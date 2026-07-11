import { createClient } from "@supabase/supabase-js";
import type { Database } from "../types/database.types";
import {
  digestSubject,
  renderDigestEmail,
  renderDigestText,
  type DigestEmailProps,
} from "../emails/digest-email-template";

type DigestPreferencesRow = Database["public"]["Tables"]["digest_preferences"]["Row"];

const MIN_RESEND_INTERVAL_HOURS = 144; // 6 days — guards against hour rollovers during DST, etc.
const TICK_WINDOW_MINUTES = 15; // Cron fires every 15 min; eligible window starts at send_time.

export async function sendDueDigests(env: Cloudflare.Env, now = new Date()) {
  const supabase = createClient<Database>(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY);

  const { data: prefs, error } = await supabase
    .from("digest_preferences")
    .select("*")
    .eq("enabled", true);
  if (error || !prefs?.length) return;

  let sent = 0;
  for (const pref of prefs) {
    try {
      if (!isEligibleNow(pref, now)) continue;
      await sendDigestForUser(env, supabase, pref, now);
      sent++;
    } catch (e) {
      console.error(`Digest failed for user ${pref.user_id}:`, e);
    }
  }
  console.log(`Digest tick: ${sent} of ${prefs.length} users sent`);
}

function isEligibleNow(pref: DigestPreferencesRow, now: Date): boolean {
  const local = localParts(now, pref.timezone);
  if (local.weekday !== pref.day_of_week) return false;

  const sendMinutes = parseSendTime(pref.send_time);
  if (sendMinutes === null) return false;

  const tickMinutes = local.hour * 60 + local.minute;
  if (tickMinutes < sendMinutes || tickMinutes >= sendMinutes + TICK_WINDOW_MINUTES) return false;

  if (pref.last_sent_at) {
    const hoursSince = (now.getTime() - new Date(pref.last_sent_at).getTime()) / 36e5;
    if (hoursSince < MIN_RESEND_INTERVAL_HOURS) return false;
  }

  return true;
}

function localParts(date: Date, timeZone: string) {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  });
  const p = f.formatToParts(date);
  const v = (t: string) => p.find((x) => x.type === t)?.value ?? "0";
  return {
    weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(v("weekday")),
    hour: Number(v("hour")) % 24,
    minute: Number(v("minute")),
  };
}

function parseSendTime(value: string) {
  const m = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(value);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

async function sendDigestForUser(
  env: Cloudflare.Env,
  supabase: ReturnType<typeof createClient<Database>>,
  pref: DigestPreferencesRow,
  now: Date,
) {
  const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const weekStartIso = weekStart.toISOString();

  const [bookmarksRes, notesRes, snippetsRes, diagramsRes, unreadRes] = await Promise.all([
    supabase
      .from("bookmarks")
      .select("title, url, summary, tags")
      .eq("user_id", pref.user_id)
      .eq("content_status", "succeeded")
      .gte("time_added", Math.floor(weekStart.getTime() / 1000))
      .order("time_added", { ascending: false }),
    supabase
      .from("notes")
      .select("title")
      .eq("user_id", pref.user_id)
      .gte("updated_at", weekStartIso)
      .order("updated_at", { ascending: false }),
    supabase
      .from("code_snippets")
      .select("id", { count: "exact", head: true })
      .eq("user_id", pref.user_id)
      .gte("created_at", weekStartIso),
    supabase
      .from("diagrams")
      .select("id", { count: "exact", head: true })
      .eq("user_id", pref.user_id)
      .gte("created_at", weekStartIso),
    supabase
      .from("bookmarks")
      .select("id", { count: "exact", head: true })
      .eq("user_id", pref.user_id)
      .eq("status", "unread"),
  ]);

  if (bookmarksRes.error) throw bookmarksRes.error;

  const props: DigestEmailProps = {
    bookmarks: (bookmarksRes.data ?? []).map((b) => ({
      title: b.title,
      url: b.url,
      summary: b.summary,
      tags: b.tags,
    })),
    notes: (notesRes.data ?? []).map((n) => ({ title: n.title })),
    snippetCount: snippetsRes.count ?? 0,
    diagramCount: diagramsRes.count ?? 0,
    unreadCount: unreadRes.count ?? 0,
    weekStart,
    weekEnd: now,
  };

  const hasActivity =
    props.bookmarks.length > 0 ||
    props.notes.length > 0 ||
    props.snippetCount > 0 ||
    props.diagramCount > 0;

  if (!hasActivity) {
    await supabase
      .from("digest_preferences")
      .update({ last_sent_at: now.toISOString() })
      .eq("user_id", pref.user_id);
    return;
  }

  const { data: userResult, error: userError } = await supabase.auth.admin.getUserById(
    pref.user_id,
  );
  if (userError) throw userError;

  const email = userResult?.user?.email;
  if (!email) {
    console.warn(`No email on file for user ${pref.user_id}`);
    return;
  }

  const result = await env.EMAILER?.send({
    from: "Turbodoc Digest <digest@mail.turbodoc.ai>",
    to: email,
    subject: digestSubject(props),
    html: renderDigestEmail(props),
    text: renderDigestText(props),
  });

  if (!result) return;

  await supabase
    .from("digest_preferences")
    .update({ last_sent_at: now.toISOString() })
    .eq("user_id", pref.user_id);
}
