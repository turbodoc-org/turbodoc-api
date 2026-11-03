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
import {
  LIGHT as C,
  SANS,
  SERIF,
  SITE,
  WRAP,
  escapeHtml,
  eyebrow,
  footerLink,
  hairline,
  iconTile,
  pillButton,
  renderLayout,
} from "./email-layout";

const DIGEST_SETTINGS_URL = `${SITE}/settings/digest`;

const MAX_BOOKMARKS_SHOWN = 4;
const MAX_NOTES_SHOWN = 5;
const MAX_TAGS_PER_BOOKMARK = 3;
const MAX_EXTRA_TITLES = 3;
const SUMMARY_CLAMP = 180;

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

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

function bookmarkRow(bookmark: DigestBookmark, isLast: boolean): string {
  const href = safeHref(bookmark.url);
  const domain = hostname(bookmark.url);
  const tags = parseTags(bookmark.tags);
  const border = isLast ? "" : `border-bottom: 1px solid ${C.line};`;

  return `
    <tr>
      <td class="b-line" style="padding: 20px 0; ${border} font-family: ${SANS}; ${WRAP}">
        ${domain ? `<div class="t-faint" style="font-size: 12px; line-height: 16px; font-weight: 600; letter-spacing: 0.4px; color: ${C.faint};">${escapeHtml(domain)}</div>` : ""}
        <div style="margin-top: 6px;"><a class="t-ink" href="${href}" style="font-family: ${SERIF}; font-size: 19px; line-height: 1.35; color: ${C.ink}; text-decoration: none;">${escapeHtml(bookmark.title)}</a></div>
        ${bookmark.summary ? `<div class="t-muted" style="margin-top: 6px; font-size: 15px; line-height: 1.6; color: ${C.muted};">${escapeHtml(clamp(bookmark.summary, SUMMARY_CLAMP))}</div>` : ""}
        ${tags.length ? `<div class="t-accent" style="margin-top: 6px; font-size: 13px; line-height: 18px; color: ${C.accentText};">${tags.map((t) => `#${escapeHtml(t)}`).join("&nbsp;&nbsp; ")}</div>` : ""}
      </td>
    </tr>`;
}

interface ItemRow {
  icon: "note" | "diagram" | "code";
  tone: "accent" | "slate";
  title: string;
  subtitle: string;
  href: string;
  isLast: boolean;
}

function itemRow(row: ItemRow): string {
  const border = row.isLast ? "" : `border-bottom: 1px solid ${C.line};`;
  return `
    <tr>
      <td class="b-line" style="padding: 14px 0; ${border}">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width: 100%;">
          <tr>
            <td width="32" valign="middle" style="width: 32px;">${iconTile(row.icon, row.tone)}</td>
            <td valign="middle" style="padding-left: 14px; font-family: ${SANS}; ${WRAP}">
              <a class="t-ink" href="${row.href}" style="display: block; font-size: 15px; line-height: 20px; font-weight: 600; color: ${C.ink}; text-decoration: none;">${row.title}</a>
              <div class="t-faint" style="margin-top: 2px; font-size: 13px; line-height: 18px; color: ${C.faint};">${row.subtitle}</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>`;
}

function sectionTitle(text: string): string {
  return `<div class="t-ink" style="padding-bottom: 8px; font-family: ${SERIF}; font-size: 22px; line-height: 28px; font-weight: 400; color: ${C.ink};">${text}</div>`;
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
          <td class="px" style="padding: 32px 24px 12px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width: 100%;">
              <tr>
                <td valign="bottom">${sectionTitle("Saved this week")}</td>
                <td class="t-faint" align="right" valign="bottom" style="padding-bottom: 12px; font-family: ${SANS}; font-size: 13px; line-height: 18px; color: ${C.faint}; text-align: right; white-space: nowrap;">${plural(bookmarks.length, "link")}</td>
              </tr>
            </table>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width: 100%;">
              ${shownBookmarks.map((b, i) => bookmarkRow(b, i === shownBookmarks.length - 1)).join("")}
            </table>
            ${
              hiddenBookmarks > 0
                ? `<div style="padding-top: 8px; font-family: ${SANS}; font-size: 14px; line-height: 20px; font-weight: 600;"><a class="t-ink" href="${SITE}/bookmarks" style="color: ${C.ink}; text-decoration: none;">+ ${hiddenBookmarks} more in your library →</a></div>`
                : ""
            }
          </td>
        </tr>`
    : "";

  // --- Notes, snippets & diagrams -------------------------------------------
  const rows: ItemRow[] = notes.slice(0, MAX_NOTES_SHOWN).map((note) => {
    const day = note.updatedAt ? shortWeekday(note.updatedAt, tz) : "";
    return {
      icon: "note",
      tone: "accent",
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
      icon: diagramCount ? "diagram" : "code",
      tone: "slate",
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
          <td class="px" style="padding: ${hasBookmarks ? "32px" : "4px"} 24px 12px;">
            ${hasBookmarks ? sectionTitle("Also this week") : ""}
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width: 100%;">
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
          <td class="px" style="padding: ${hasBookmarks ? "32px" : "24px"} 24px 0;">
            <table role="presentation" class="bg-wash" width="100%" cellpadding="0" cellspacing="0" bgcolor="${C.accentWash}" style="width: 100%; background-color: ${C.accentWash}; border-radius: 12px;">
              <tr>
                <td class="rl" style="padding: 24px; font-family: ${SANS};">
                  ${eyebrow("Your reading list")}
                  <div class="h2 t-ink" style="margin-top: 10px; font-family: ${SERIF}; font-size: 22px; line-height: 1.3; color: ${C.ink};">${unreadCount === 1 ? "1 unread bookmark is waiting." : `${unreadCount} unread bookmarks are waiting.`}</div>
                  <div class="t-muted" style="margin-top: 10px; font-size: 15px; line-height: 1.6; color: ${C.muted};">Ten minutes with your reading list beats another new tab.</div>
                  ${pillButton("Start reading →", `${SITE}/bookmarks`)}
                </td>
              </tr>
            </table>
          </td>
        </tr>`
      : "";

  const cardRows = `
        <!-- Hero -->
        <tr>
          <td class="px hero" style="padding: 32px 24px 24px; font-family: ${SANS};">
            ${eyebrow("Your week in review")}
            <h1 class="h1 t-ink" style="margin: 14px 0 0; font-family: ${SERIF}; font-size: 28px; line-height: 1.2; font-weight: 400; letter-spacing: -0.4px; color: ${C.ink};">${escapeHtml(headline(props))}</h1>
            <p class="t-muted" style="margin: 14px 0 0; font-size: 16px; line-height: 1.6; color: ${C.muted};">${intro(props)}</p>
          </td>
        </tr>
        <tr><td class="px" style="padding: 0 24px;">${hairline()}</td></tr>
        ${bookmarksSection}
        ${itemsSection}
        ${readingSection}

        <!-- Tip -->
        <tr>
          <td class="px" style="padding: 28px 24px 32px;">
            ${hairline()}
            <div class="t-muted" style="padding-top: 20px; font-family: ${SANS}; font-size: 14px; line-height: 1.6; color: ${C.muted};">
              <strong class="t-ink" style="color: ${C.ink};">Tip:</strong> Connect Claude or Cursor to Turbodoc and let your AI assistant file links and notes for you. <a class="t-accent" href="${SITE}/mcp" style="color: ${C.accentText}; font-weight: 600; text-decoration: none;">Set it up in 2 minutes →</a>
            </div>
          </td>
        </tr>`;

  return renderLayout({
    title: "Your week in Turbodoc",
    preheader,
    mastheadLabel: `<span class="show-lg" style="display: none;">Weekly digest · </span>${range}`,
    cardRows,
    footer: `You're getting this because your weekly digest is on.${scheduleSentence(props.schedule)}<br>
              ${footerLink("Change delivery day", DIGEST_SETTINGS_URL)}&nbsp;&nbsp;·&nbsp;&nbsp;${footerLink("Unsubscribe", DIGEST_SETTINGS_URL)}&nbsp;&nbsp;·&nbsp;&nbsp;${footerLink("turbodoc.ai", SITE)}`,
  });
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
