export interface DigestBookmark {
  title: string;
  url: string;
  summary: string | null;
  tags: string | null;
}

export interface DigestNote {
  title: string;
}

export interface DigestEmailProps {
  bookmarks: DigestBookmark[];
  notes: DigestNote[];
  snippetCount: number;
  diagramCount: number;
  unreadCount: number;
  weekStart: Date;
  weekEnd: Date;
}

const BRAND = {
  navy: "#0e1526",
  navySoft: "#1c2841",
  orange: "#f2790f",
  orangeSoft: "#fff3e6",
  blue: "#2f6fd6",
  bg: "#f5f6f8",
  card: "#ffffff",
  border: "#e6e8ec",
  text: "#1a2233",
  muted: "#5b6577",
  faint: "#9aa3b2",
};

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

const MAX_BOOKMARKS_SHOWN = 8;
const MAX_NOTES_SHOWN = 5;
const MAX_TAGS_PER_BOOKMARK = 3;
const SUMMARY_CLAMP = 180;

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

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
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

function tagChips(tags: string[]): string {
  if (!tags.length) return "";
  const chips = tags
    .map(
      (tag) =>
        `<span style="display: inline-block; padding: 2px 10px; margin: 0 6px 4px 0; font-size: 11px; font-weight: 600; color: ${BRAND.orange}; background-color: ${BRAND.orangeSoft}; border-radius: 10px;">${escapeHtml(tag)}</span>`,
    )
    .join("");
  return `<div style="margin-top: 8px;">${chips}</div>`;
}

function bookmarkCard(bookmark: DigestBookmark): string {
  const safeTitle = escapeHtml(bookmark.title);
  const safeUrl = escapeHtml(bookmark.url);
  const domain = escapeHtml(hostname(bookmark.url));
  const summary = bookmark.summary
    ? `<p style="margin: 8px 0 0; font-size: 14px; line-height: 1.6; color: ${BRAND.muted};">${escapeHtml(clamp(bookmark.summary, SUMMARY_CLAMP))}</p>`
    : "";
  const domainLine = domain
    ? `<div style="margin-top: 4px; font-size: 12px; color: ${BRAND.faint};">${domain}</div>`
    : "";

  return `
    <tr>
      <td style="padding: 0 0 12px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: ${BRAND.card}; border: 1px solid ${BRAND.border}; border-radius: 10px;">
          <tr>
            <td style="padding: 16px 20px; font-family: ${FONT};">
              <a href="${safeUrl}" style="font-size: 16px; font-weight: 600; line-height: 1.4; color: ${BRAND.text}; text-decoration: none;">${safeTitle}</a>
              ${domainLine}
              ${summary}
              ${tagChips(parseTags(bookmark.tags))}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  `;
}

function statCell(value: number, label: string): string {
  return `
    <td align="center" style="padding: 14px 6px; font-family: ${FONT};">
      <div style="font-size: 26px; font-weight: 700; color: ${BRAND.navy};">${value}</div>
      <div style="margin-top: 2px; font-size: 11px; font-weight: 600; letter-spacing: 0.6px; text-transform: uppercase; color: ${BRAND.faint};">${label}</div>
    </td>
  `;
}

function sectionTitle(title: string): string {
  return `
    <tr>
      <td style="padding: 24px 0 12px; font-family: ${FONT};">
        <span style="font-size: 13px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: ${BRAND.orange};">${title}</span>
      </td>
    </tr>
  `;
}

function ctaButton(label: string, url: string): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 0 auto;">
      <tr>
        <td style="background-color: ${BRAND.orange}; border-radius: 8px;">
          <a href="${url}" style="display: inline-block; padding: 12px 28px; font-family: ${FONT}; font-size: 15px; font-weight: 600; color: #ffffff; text-decoration: none;">${label}</a>
        </td>
      </tr>
    </table>
  `;
}

export function renderDigestEmail(props: DigestEmailProps): string {
  const { bookmarks, notes, snippetCount, diagramCount, unreadCount, weekStart, weekEnd } = props;
  const range = `${formatDate(weekStart)} – ${formatDate(weekEnd)}`;

  const shownBookmarks = bookmarks.slice(0, MAX_BOOKMARKS_SHOWN);
  const hiddenBookmarks = bookmarks.length - shownBookmarks.length;

  const preheaderParts: string[] = [];
  if (bookmarks.length) preheaderParts.push(plural(bookmarks.length, "bookmark"));
  if (notes.length) preheaderParts.push(plural(notes.length, "note"));
  const preheader = preheaderParts.length
    ? `${preheaderParts.join(" and ")} saved this week — here's your recap.`
    : "Your weekly recap from Turbodoc.";

  const bookmarksSection = shownBookmarks.length
    ? `
      ${sectionTitle("Saved this week")}
      ${shownBookmarks.map(bookmarkCard).join("")}
      ${
        hiddenBookmarks > 0
          ? `<tr><td style="padding: 4px 0 0; font-family: ${FONT}; font-size: 13px; color: ${BRAND.muted};">
              + ${plural(hiddenBookmarks, "more bookmark")} in <a href="https://turbodoc.ai/bookmarks" style="color: ${BRAND.blue}; text-decoration: none;">your library</a>
            </td></tr>`
          : ""
      }
    `
    : "";

  const notesSection = notes.length
    ? `
      ${sectionTitle("Notes you worked on")}
      <tr>
        <td style="padding: 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: ${BRAND.card}; border: 1px solid ${BRAND.border}; border-radius: 10px;">
            <tr>
              <td style="padding: 8px 20px; font-family: ${FONT};">
                ${notes
                  .slice(0, MAX_NOTES_SHOWN)
                  .map(
                    (note) =>
                      `<div style="padding: 8px 0; border-bottom: 1px solid ${BRAND.border}; font-size: 14px; font-weight: 600; color: ${BRAND.text};">📝&nbsp; ${escapeHtml(note.title)}</div>`,
                  )
                  .join("")}
                <div style="padding: 10px 0 8px; font-size: 13px;">
                  <a href="https://turbodoc.ai/notes" style="color: ${BRAND.blue}; text-decoration: none;">Open your notes →</a>
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    `
    : "";

  const extrasParts: string[] = [];
  if (snippetCount) extrasParts.push(plural(snippetCount, "code snippet"));
  if (diagramCount) extrasParts.push(plural(diagramCount, "diagram"));
  const extrasSection = extrasParts.length
    ? `
      <tr>
        <td style="padding: 20px 0 0; font-family: ${FONT}; font-size: 14px; color: ${BRAND.muted};">
          You also saved ${extrasParts.join(" and ")} this week. Nice.
        </td>
      </tr>
    `
    : "";

  const unreadSection =
    unreadCount > 0
      ? `
      <tr>
        <td style="padding: 28px 0 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: ${BRAND.navy}; border-radius: 12px;">
            <tr>
              <td align="center" style="padding: 26px 24px; font-family: ${FONT};">
                <div style="font-size: 17px; font-weight: 700; color: #ffffff;">📚 ${plural(unreadCount, "unread bookmark")} waiting for you</div>
                <div style="margin: 6px 0 18px; font-size: 13px; color: #aeb7c8;">Ten minutes with your reading list beats another new tab.</div>
                ${ctaButton("Open your library", "https://turbodoc.ai/bookmarks")}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    `
      : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>Your Turbodoc digest</title>
</head>
<body style="margin: 0; padding: 0; background-color: ${BRAND.bg};">
  <div style="display: none; max-height: 0; overflow: hidden; mso-hide: all;">${escapeHtml(preheader)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: ${BRAND.bg};">
    <tr>
      <td align="center" style="padding: 24px 12px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width: 600px; max-width: 100%;">

          <!-- Header -->
          <tr>
            <td style="background-color: ${BRAND.navy}; border-radius: 12px 12px 0 0; padding: 20px 28px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="font-family: ${FONT};">
                    <a href="https://turbodoc.ai" style="text-decoration: none;">
                      <img src="https://turbodoc.ai/logo.png" width="34" height="34" alt="Turbodoc" style="vertical-align: middle; border: 0; border-radius: 8px;">
                      <span style="margin-left: 10px; font-size: 18px; font-weight: 700; color: #ffffff; vertical-align: middle;">Turbodoc</span>
                    </a>
                  </td>
                  <td align="right" style="font-family: ${FONT}; font-size: 12px; color: #8f99ab;">Weekly digest</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Accent bar -->
          <tr><td style="height: 3px; background-color: ${BRAND.orange}; font-size: 0; line-height: 0;">&nbsp;</td></tr>

          <!-- Hero + stats -->
          <tr>
            <td style="background-color: ${BRAND.card}; padding: 28px 28px 20px; border-left: 1px solid ${BRAND.border}; border-right: 1px solid ${BRAND.border};">
              <div style="font-family: ${FONT}; font-size: 22px; font-weight: 700; color: ${BRAND.text};">Your week in Turbodoc</div>
              <div style="font-family: ${FONT}; margin-top: 4px; font-size: 13px; color: ${BRAND.faint};">${range}</div>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top: 18px; background-color: ${BRAND.bg}; border-radius: 10px;">
                <tr>
                  ${statCell(bookmarks.length, "Bookmarks")}
                  ${statCell(notes.length, "Notes")}
                  ${statCell(snippetCount + diagramCount, "Snippets & diagrams")}
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background-color: ${BRAND.card}; padding: 0 28px 28px; border-left: 1px solid ${BRAND.border}; border-right: 1px solid ${BRAND.border};">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                ${bookmarksSection}
                ${notesSection}
                ${extrasSection}
                ${unreadSection}
              </table>
            </td>
          </tr>

          <!-- Tip -->
          <tr>
            <td style="background-color: ${BRAND.card}; padding: 0 28px 28px; border-left: 1px solid ${BRAND.border}; border-right: 1px solid ${BRAND.border};">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: ${BRAND.orangeSoft}; border-radius: 10px;">
                <tr>
                  <td style="padding: 14px 18px; font-family: ${FONT}; font-size: 13px; line-height: 1.6; color: ${BRAND.text};">
                    💡 <strong>Tip:</strong> Connect Claude or Cursor to Turbodoc and let your AI assistant file links and notes for you. <a href="https://turbodoc.ai/mcp" style="color: ${BRAND.orange}; font-weight: 600; text-decoration: none;">Set it up in 2 minutes →</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: ${BRAND.card}; border-radius: 0 0 12px 12px; border: 1px solid ${BRAND.border}; border-top: 0; padding: 18px 28px;">
              <div style="font-family: ${FONT}; font-size: 12px; line-height: 1.7; color: ${BRAND.faint};">
                You're getting this because your weekly digest is enabled.
                <a href="https://turbodoc.ai/settings/digest" style="color: ${BRAND.muted};">Manage preferences</a>
                &nbsp;·&nbsp;
                <a href="https://turbodoc.ai" style="color: ${BRAND.muted};">turbodoc.ai</a>
              </div>
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
  const lines: string[] = [
    "YOUR WEEK IN TURBODOC",
    `${formatDate(weekStart)} – ${formatDate(weekEnd)}`,
    "",
  ];

  if (bookmarks.length) {
    lines.push(`SAVED THIS WEEK (${bookmarks.length})`);
    for (const b of bookmarks.slice(0, MAX_BOOKMARKS_SHOWN)) {
      lines.push(`- ${b.title}`, `  ${b.url}`);
    }
    if (bookmarks.length > MAX_BOOKMARKS_SHOWN) {
      lines.push(
        `  …and ${bookmarks.length - MAX_BOOKMARKS_SHOWN} more: https://turbodoc.ai/bookmarks`,
      );
    }
    lines.push("");
  }

  if (notes.length) {
    lines.push(`NOTES YOU WORKED ON (${notes.length})`);
    for (const n of notes.slice(0, MAX_NOTES_SHOWN)) lines.push(`- ${n.title}`);
    lines.push("");
  }

  const extras: string[] = [];
  if (snippetCount) extras.push(plural(snippetCount, "code snippet"));
  if (diagramCount) extras.push(plural(diagramCount, "diagram"));
  if (extras.length) lines.push(`You also saved ${extras.join(" and ")} this week.`, "");

  if (unreadCount > 0) {
    lines.push(
      `${plural(unreadCount, "unread bookmark")} waiting: https://turbodoc.ai/bookmarks`,
      "",
    );
  }

  lines.push(
    "Tip: connect Claude or Cursor to Turbodoc via MCP: https://turbodoc.ai/mcp",
    "",
    "Manage digest preferences: https://turbodoc.ai/settings/digest",
  );

  return lines.join("\n");
}
