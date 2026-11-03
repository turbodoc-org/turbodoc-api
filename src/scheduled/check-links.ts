import { createClient } from "@supabase/supabase-js";
import type { Database } from "../types/database.types";
import { checkLink, recordLinkChecks, type LinkCheckRecord } from "../utils/links/check-link";

// The cron fires every 15 minutes. 25 links per tick is ~16.8k checks a week,
// and keeps each run (1 select + 25 fetches + redirect hops + 1 write) inside
// the Workers free-plan limit of 50 external subrequests per invocation.
const BATCH_SIZE = 25;
const CONCURRENCY = 5;

const RECHECK_AFTER_MS = 7 * 24 * 60 * 60 * 1000; // weekly
const CONFIRM_FAILURE_AFTER_MS = 24 * 60 * 60 * 1000; // a first failure is re-checked after a day

/**
 * Re-check the bookmarks that are due: never checked, last checked over a week
 * ago, or failed once and waiting for a confirming second check.
 */
export async function checkBookmarkLinks(env: Cloudflare.Env, now = new Date()) {
  const supabase = createClient<Database>(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY);

  const staleBefore = new Date(now.getTime() - RECHECK_AFTER_MS).toISOString();
  const confirmBefore = new Date(now.getTime() - CONFIRM_FAILURE_AFTER_MS).toISOString();

  const { data: due, error } = await supabase
    .from("bookmarks")
    .select("id, url")
    .or(
      [
        "link_checked_at.is.null",
        `link_checked_at.lt."${staleBefore}"`,
        `and(link_failure_count.gt.0,link_status.neq.broken,link_checked_at.lt."${confirmBefore}")`,
      ].join(","),
    )
    .order("link_checked_at", { ascending: true, nullsFirst: true })
    .limit(BATCH_SIZE);

  if (error) {
    console.error("Link check: failed to load due bookmarks:", error);
    return;
  }
  if (!due?.length) return;

  const records: LinkCheckRecord[] = [];
  let next = 0;
  const worker = async () => {
    while (next < due.length) {
      const bookmark = due[next++];
      const result = await checkLink(bookmark.url);
      if (result) records.push({ id: bookmark.id, url: bookmark.url, ...result });
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, due.length) }, worker));

  try {
    await recordLinkChecks(supabase, records);
  } catch (e) {
    console.error("Link check: failed to record results:", e);
    return;
  }

  const failed = records.filter((r) => r.outcome === "failed").length;
  console.log(`Link check tick: ${records.length} of ${due.length} checked, ${failed} failing`);
}
