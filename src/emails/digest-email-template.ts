export interface DigestBookmark {
  title: string;
  url: string;
  summary: string | null;
  tags: string | null;
}

export interface DigestNote {
  title: string;
  /** ISO timestamp of the last edit, shown as "edited Thu". */
  updatedAt?: string | null;
}

export interface DigestSchedule {
  /** 0 = Sunday … 6 = Saturday */
  dayOfWeek: number;
  /** "HH:MM" or "HH:MM:SS" in the user's timezone */
  sendTime: string;
}

export interface DigestEmailProps {
  bookmarks: DigestBookmark[];
  notes: DigestNote[];
  snippetCount: number;
  diagramCount: number;
  /** Titles of snippets/diagrams created this week (a few is enough). */
  snippetTitles?: string[];
  diagramTitles?: string[];
  unreadCount: number;
  weekStart: Date;
  weekEnd: Date;
  /** IANA timezone used for dates in the email (defaults to UTC). */
  timeZone?: string;
  schedule?: DigestSchedule;
}

// "Editorial" direction: warm paper, serif headlines, one calm accent.
const C = {
  paper: "#f6f3ee",
  card: "#ffffff",
  ink: "#171c26",
  muted: "#5c6370",
  faint: "#8e94a0",
  line: "#ebe5db",
  accentText: "#b4500a",
  accentWash: "#fdf1e4",
  slateWash: "#eef2f8",
  navy: "#0e1526",
};

const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const SERIF = "Georgia, 'Times New Roman', Times, serif";

const SITE = "https://turbodoc.ai";
const ASSETS = "https://api.turbodoc.ai/email-assets";
const DIGEST_SETTINGS_URL = `${SITE}/settings/digest`;

const MAX_BOOKMARKS_SHOWN = 4;
const MAX_NOTES_SHOWN = 5;
const MAX_TAGS_PER_BOOKMARK = 3;
const MAX_EXTRA_TITLES = 3;
const SUMMARY_CLAMP = 180;

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

function dateParts(d: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { month: get("month"), day: get("day") };
}

/** "Oct 24 – 31", or "Oct 28 – Nov 4" when the week spans two months. */
function formatRange(start: Date, end: Date, timeZone: string): string {
  const s = dateParts(start, timeZone);
  const e = dateParts(end, timeZone);
  return s.month === e.month
    ? `${s.month} ${s.day} – ${e.day}`
    : `${s.month} ${s.day} – ${e.month} ${e.day}`;
}

function shortWeekday(iso: string, timeZone: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { timeZone, weekday: "short" });
}

/** "09:00:00" → "9:00" */
function formatSendTime(value: string): string | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(value);
  if (!m) return null;
  return `${Number(m[1])}:${m[2]}`;
}

function scheduleSentence(schedule?: DigestSchedule): string {
  if (!schedule) return "";
  const day = WEEKDAYS[schedule.dayOfWeek];
  const time = formatSendTime(schedule.sendTime);
  if (!day || !time) return "";
  return ` It arrives every ${day} at ${time}.`;
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function safeHref(url: string): string {
  return /^https?:\/\//i.test(url) ? escapeHtml(url) : SITE;
}

function clamp(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max).replace(/\s+\S*$/, "")}…`;
}

function parseTags(tags: string | null): string[] {
  if (!tags) return [];
  return tags
    .split("|")
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, MAX_TAGS_PER_BOOKMARK);
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/** "a", "a and b", "a, b, and c" */
function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

function diagramPhrase(n: number): string {
  return n === 1 ? "sketched a diagram" : `sketched ${n} diagrams`;
}

function snippetPhrase(n: number): string {
  return n === 1 ? "added a code snippet" : `added ${n} code snippets`;
}

/** Headline that adapts to the week, e.g. "You saved 6 links, worked on 2 notes, and sketched a diagram." */
function headline(props: DigestEmailProps): string {
  const { bookmarks, notes, snippetCount, diagramCount } = props;
  const extras: string[] = [];
  if (diagramCount) extras.push(diagramPhrase(diagramCount));
  if (snippetCount) extras.push(snippetPhrase(snippetCount));

  if (bookmarks.length) {
    const parts = [`saved ${plural(bookmarks.length, "link")}`];
    if (notes.length) parts.push(`worked on ${plural(notes.length, "note")}`);
    return `You ${joinList([...parts, ...extras])}.`;
  }

  const parts: string[] = [];
  if (notes.length) parts.push(`kept ${plural(notes.length, "note")} moving`);
  parts.push(...extras);
  return parts.length ? `A quiet week. You ${joinList(parts)}.` : "A quiet week in Turbodoc.";
}

function intro(props: DigestEmailProps): string {
  if (props.bookmarks.length) {
    return props.unreadCount > 0
      ? "Here's everything you collected this week, plus a few things still waiting in your reading list."
      : "Here's everything you collected this week.";
  }
  return props.unreadCount > 0
    ? "No new links this week, which makes it a good week to read the ones you already saved."
    : "No new links this week. Here's what you worked on.";
}

/** Dynamic subject line, e.g. "Your week in Turbodoc: 6 bookmarks & 2 notes" */
export function digestSubject(props: DigestEmailProps): string {
  const parts: string[] = [];
  if (props.bookmarks.length) parts.push(plural(props.bookmarks.length, "bookmark"));
  if (props.notes.length) parts.push(plural(props.notes.length, "note"));
  if (props.snippetCount) parts.push(plural(props.snippetCount, "snippet"));
  if (props.diagramCount) parts.push(plural(props.diagramCount, "diagram"));
  if (!parts.length) return "Your weekly Turbodoc digest";
  const summary =
    parts.length > 1 ? `${parts.slice(0, -1).join(", ")} & ${parts.at(-1)}` : parts[0];
  return `Your week in Turbodoc: ${summary}`;
}

function eyebrow(text: string): string {
  return `<div style="font-family: ${SANS}; font-size: 12px; line-height: 16px; font-weight: 700; letter-spacing: 1.4px; text-transform: uppercase; color: ${C.accentText};">${text}</div>`;
}

function hairline(): string {
  return `<div style="height: 1px; line-height: 1px; font-size: 0; background-color: ${C.line};">&nbsp;</div>`;
}

function bookmarkRow(bookmark: DigestBookmark, isLast: boolean): string {
  const href = safeHref(bookmark.url);
  const domain = hostname(bookmark.url);
  const tags = parseTags(bookmark.tags);
  const border = isLast ? "" : `border-bottom: 1px solid ${C.line};`;

  return `
    <tr>
      <td style="padding: 20px 0; ${border} font-family: ${SANS};">
        ${domain ? `<div style="font-size: 12px; line-height: 16px; font-weight: 600; letter-spacing: 0.4px; color: ${C.faint};">${escapeHtml(domain)}</div>` : ""}
        <div style="margin-top: 6px;"><a href="${href}" style="font-family: ${SERIF}; font-size: 19px; line-height: 1.35; color: ${C.ink}; text-decoration: none;">${escapeHtml(bookmark.title)}</a></div>
        ${bookmark.summary ? `<div style="margin-top: 6px; font-size: 15px; line-height: 1.6; color: ${C.muted};">${escapeHtml(clamp(bookmark.summary, SUMMARY_CLAMP))}</div>` : ""}
        ${tags.length ? `<div style="margin-top: 6px; font-size: 13px; line-height: 18px; color: ${C.accentText};">${tags.map((t) => `#${escapeHtml(t)}`).join("&nbsp;&nbsp; ")}</div>` : ""}
      </td>
    </tr>`;
}

function itemRow(opts: {
  icon: string;
  tileColor: string;
  title: string;
  subtitle: string;
  href: string;
  isLast: boolean;
}): string {
  const border = opts.isLast ? "" : `border-bottom: 1px solid ${C.line};`;
  return `
    <tr>
      <td style="padding: 14px 0; ${border}">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td width="32" valign="middle" style="width: 32px;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td width="32" height="32" align="center" valign="middle" bgcolor="${opts.tileColor}" style="width: 32px; height: 32px; background-color: ${opts.tileColor}; border-radius: 8px;">
                    <img src="${ASSETS}/${opts.icon}" width="16" height="16" alt="" style="display: block; width: 16px; height: 16px; border: 0;">
                  </td>
                </tr>
              </table>
            </td>
            <td valign="middle" style="padding-left: 14px; font-family: ${SANS};">
              <a href="${opts.href}" style="display: block; font-size: 15px; line-height: 20px; font-weight: 600; color: ${C.ink}; text-decoration: none;">${opts.title}</a>
              <div style="margin-top: 2px; font-size: 13px; line-height: 18px; color: ${C.faint};">${opts.subtitle}</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>`;
}

function pillButton(label: string, url: string): string {
  return `
    <table role="presentation" class="btn" cellpadding="0" cellspacing="0" style="margin-top: 20px;">
      <tr>
        <td bgcolor="${C.navy}" style="background-color: ${C.navy}; border-radius: 999px;">
          <a href="${url}" style="display: inline-block; padding: 13px 24px; font-family: ${SANS}; font-size: 15px; line-height: 20px; font-weight: 600; color: #ffffff; text-decoration: none; border-radius: 999px;">${label}</a>
        </td>
      </tr>
    </table>`;
}

export function renderDigestEmail(props: DigestEmailProps): string {
  const { bookmarks, notes, snippetCount, diagramCount, unreadCount, weekStart, weekEnd } = props;
  const tz = props.timeZone || "UTC";
  const range = formatRange(weekStart, weekEnd, tz);
  const hasBookmarks = bookmarks.length > 0;

  const shownBookmarks = bookmarks.slice(0, MAX_BOOKMARKS_SHOWN);
  const hiddenBookmarks = bookmarks.length - shownBookmarks.length;

  const preheaderParts: string[] = [];
  if (bookmarks.length) preheaderParts.push(plural(bookmarks.length, "link"));
  if (notes.length) preheaderParts.push(plural(notes.length, "note"));
  const preheader = preheaderParts.length
    ? `${preheaderParts.join(" and ")} this week, plus what's waiting in your reading list.`
    : "Your weekly recap from Turbodoc.";

  // --- Saved this week -------------------------------------------------------
  const bookmarksSection = hasBookmarks
    ? `
          <tr>
            <td class="px" style="padding: 36px 48px 12px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding-bottom: 8px; font-family: ${SERIF}; font-size: 22px; line-height: 28px; font-weight: 400; color: ${C.ink};">Saved this week</td>
                  <td align="right" style="padding-bottom: 8px; font-family: ${SANS}; font-size: 13px; line-height: 28px; color: ${C.faint}; white-space: nowrap;">${plural(bookmarks.length, "link")}</td>
                </tr>
              </table>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                ${shownBookmarks.map((b, i) => bookmarkRow(b, i === shownBookmarks.length - 1)).join("")}
              </table>
              ${
                hiddenBookmarks > 0
                  ? `<div style="padding-top: 8px; font-family: ${SANS}; font-size: 14px; line-height: 20px; font-weight: 600;"><a href="${SITE}/bookmarks" style="color: ${C.ink}; text-decoration: none;">+ ${hiddenBookmarks} more in your library →</a></div>`
                  : ""
              }
            </td>
          </tr>`
    : "";

  // --- Notes, snippets & diagrams -------------------------------------------
  const rows: Parameters<typeof itemRow>[0][] = notes.slice(0, MAX_NOTES_SHOWN).map((note) => {
    const day = note.updatedAt ? shortWeekday(note.updatedAt, tz) : "";
    return {
      icon: "note.png",
      tileColor: C.accentWash,
      title: escapeHtml(note.title || "Untitled note"),
      subtitle: day ? `Note · edited ${day}` : "Note",
      href: `${SITE}/notes`,
      isLast: false,
    };
  });

  const extras: string[] = [];
  if (diagramCount) extras.push(plural(diagramCount, "diagram"));
  if (snippetCount) extras.push(plural(snippetCount, "code snippet"));
  if (extras.length) {
    const titles = [...(props.diagramTitles ?? []), ...(props.snippetTitles ?? [])]
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, MAX_EXTRA_TITLES);
    rows.push({
      icon: diagramCount ? "diagram.png" : "code.png",
      tileColor: C.slateWash,
      title: extras.join(" and "),
      subtitle: titles.length ? titles.map(escapeHtml).join(" · ") : "Saved to your library",
      href: diagramCount ? `${SITE}/diagrams` : `${SITE}/snippets`,
      isLast: false,
    });
  }
  // Busy weeks separate rows; quiet weeks also close the list with a hairline.
  if (rows.length && hasBookmarks) rows[rows.length - 1].isLast = true;

  const itemsSection = rows.length
    ? `
          <tr>
            <td class="px" style="padding: ${hasBookmarks ? "36px" : "4px"} 48px 12px;">
              ${hasBookmarks ? `<div style="padding-bottom: 8px; font-family: ${SERIF}; font-size: 22px; line-height: 28px; font-weight: 400; color: ${C.ink};">Also this week</div>` : ""}
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                ${rows.map(itemRow).join("")}
              </table>
            </td>
          </tr>`
    : "";

  // --- Reading list ---------------------------------------------------------
  const readingSection =
    unreadCount > 0
      ? `
          <tr>
            <td class="px" style="padding: ${hasBookmarks ? "36px" : "24px"} 48px 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${C.accentWash}" style="background-color: ${C.accentWash}; border-radius: 12px;">
                <tr>
                  <td class="rl" style="padding: 32px; font-family: ${SANS};">
                    ${eyebrow("Your reading list")}
                    <div class="h2" style="margin-top: 10px; font-family: ${SERIF}; font-size: 24px; line-height: 1.3; color: ${C.ink};">${unreadCount === 1 ? "1 unread bookmark is waiting." : `${unreadCount} unread bookmarks are waiting.`}</div>
                    <div style="margin-top: 10px; font-size: 15px; line-height: 1.6; color: ${C.muted};">Ten minutes with your reading list beats another new tab.</div>
                    ${pillButton("Start reading →", `${SITE}/bookmarks`)}
                  </td>
                </tr>
              </table>
            </td>
          </tr>`
      : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>Your week in Turbodoc</title>
  <style>
    a { text-decoration: none; }
    @media only screen and (max-width: 620px) {
      .outer { padding: 24px 12px 32px !important; }
      .px { padding-left: 24px !important; padding-right: 24px !important; }
      .hero { padding-top: 32px !important; padding-bottom: 24px !important; }
      .h1 { font-size: 28px !important; line-height: 1.2 !important; }
      .h2 { font-size: 22px !important; }
      .rl { padding: 24px !important; }
      .btn { width: 100% !important; }
      .btn a { display: block !important; text-align: center !important; }
      .hide-sm { display: none !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: ${C.paper};">
  <div style="display: none; max-height: 0; overflow: hidden; mso-hide: all;">${escapeHtml(preheader)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${C.paper}" style="background-color: ${C.paper};">
    <tr>
      <td class="outer" align="center" style="padding: 40px 12px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width: 600px; max-width: 100%;">

          <!-- Masthead -->
          <tr>
            <td style="padding: 0 8px 24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td valign="middle" style="font-family: ${SANS};">
                    <a href="${SITE}" style="text-decoration: none;">
                      <img src="${SITE}/logo.png" width="28" height="28" alt="" style="vertical-align: middle; border: 0; border-radius: 7px;">
                      <span style="margin-left: 8px; font-size: 16px; font-weight: 700; letter-spacing: -0.2px; color: ${C.ink}; vertical-align: middle;">Turbodoc</span>
                    </a>
                  </td>
                  <td align="right" valign="middle" style="font-family: ${SANS}; font-size: 13px; color: ${C.faint}; white-space: nowrap;"><span class="hide-sm">Weekly digest · </span>${range}</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td bgcolor="${C.card}" style="background-color: ${C.card}; border: 1px solid ${C.line}; border-radius: 16px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">

                <!-- Hero -->
                <tr>
                  <td class="px hero" style="padding: 48px 48px 36px; font-family: ${SANS};">
                    ${eyebrow("Your week in review")}
                    <h1 class="h1" style="margin: 14px 0 0; font-family: ${SERIF}; font-size: 36px; line-height: 1.15; font-weight: 400; letter-spacing: -0.5px; color: ${C.ink};">${escapeHtml(headline(props))}</h1>
                    <p style="margin: 14px 0 0; font-size: 16px; line-height: 1.6; color: ${C.muted};">${intro(props)}</p>
                  </td>
                </tr>
                <tr><td class="px" style="padding: 0 48px;">${hairline()}</td></tr>

                ${bookmarksSection}
                ${itemsSection}
                ${readingSection}

                <!-- Tip -->
                <tr>
                  <td class="px" style="padding: ${readingSection ? "28px" : "36px"} 48px 48px;">
                    ${hairline()}
                    <div style="padding-top: 24px; font-family: ${SANS}; font-size: 14px; line-height: 1.6; color: ${C.muted};">
                      <strong style="color: ${C.ink};">Tip:</strong> Connect Claude or Cursor to Turbodoc and let your AI assistant file links and notes for you. <a href="${SITE}/mcp" style="color: ${C.accentText}; font-weight: 600; text-decoration: none;">Set it up in 2 minutes →</a>
                    </div>
                  </td>
                </tr>

              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding: 28px 8px 0; font-family: ${SANS}; font-size: 12px; line-height: 1.7; color: ${C.faint};">
              You're getting this because your weekly digest is on.${scheduleSentence(props.schedule)}<br>
              <a href="${DIGEST_SETTINGS_URL}" style="color: ${C.muted}; text-decoration: underline;">Change delivery day</a>&nbsp;&nbsp;·&nbsp;&nbsp;<a href="${DIGEST_SETTINGS_URL}" style="color: ${C.muted}; text-decoration: underline;">Unsubscribe</a>&nbsp;&nbsp;·&nbsp;&nbsp;<a href="${SITE}" style="color: ${C.muted}; text-decoration: underline;">turbodoc.ai</a>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** Plain-text alternative for clients that don't render HTML. */
export function renderDigestText(props: DigestEmailProps): string {
  const { bookmarks, notes, snippetCount, diagramCount, unreadCount, weekStart, weekEnd } = props;
  const tz = props.timeZone || "UTC";
  const lines: string[] = [
    `TURBODOC · WEEKLY DIGEST · ${formatRange(weekStart, weekEnd, tz)}`,
    "",
    headline(props),
    intro(props),
    "",
  ];

  if (bookmarks.length) {
    lines.push(`SAVED THIS WEEK (${plural(bookmarks.length, "link")})`, "");
    for (const b of bookmarks.slice(0, MAX_BOOKMARKS_SHOWN)) {
      lines.push(b.title, `  ${b.url}`);
      const tags = parseTags(b.tags);
      if (tags.length) lines.push(`  ${tags.map((t) => `#${t}`).join(" ")}`);
      lines.push("");
    }
    if (bookmarks.length > MAX_BOOKMARKS_SHOWN) {
      lines.push(
        `+ ${bookmarks.length - MAX_BOOKMARKS_SHOWN} more in your library: ${SITE}/bookmarks`,
        "",
      );
    }
  }

  const extras: string[] = [];
  if (diagramCount) extras.push(plural(diagramCount, "diagram"));
  if (snippetCount) extras.push(plural(snippetCount, "code snippet"));

  if (notes.length || extras.length) {
    lines.push(bookmarks.length ? "ALSO THIS WEEK" : "THIS WEEK");
    for (const n of notes.slice(0, MAX_NOTES_SHOWN)) lines.push(`- ${n.title || "Untitled note"}`);
    if (extras.length) lines.push(`- ${extras.join(" and ")}`);
    lines.push("");
  }

  if (unreadCount > 0) {
    lines.push(
      "YOUR READING LIST",
      unreadCount === 1
        ? "1 unread bookmark is waiting."
        : `${unreadCount} unread bookmarks are waiting.`,
      `Start reading: ${SITE}/bookmarks`,
      "",
    );
  }

  lines.push(
    `Tip: Connect Claude or Cursor to Turbodoc and let your AI assistant file links and notes for you: ${SITE}/mcp`,
    "",
    `You're getting this because your weekly digest is on.${scheduleSentence(props.schedule)}`,
    `Change delivery day or unsubscribe: ${DIGEST_SETTINGS_URL}`,
  );

  return lines.join("\n");
}
