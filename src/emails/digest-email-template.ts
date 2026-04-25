export interface DigestBookmark {
  title: string;
  url: string;
  summary: string | null;
}

export interface DigestEmailProps {
  bookmarks: DigestBookmark[];
  weekStart: Date;
  weekEnd: Date;
}

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

export function renderDigestEmail({ bookmarks, weekStart, weekEnd }: DigestEmailProps): string {
  const range = `${formatDate(weekStart)} – ${formatDate(weekEnd)}`;
  const items = bookmarks
    .map(({ title, url, summary }) => {
      const safeTitle = escapeHtml(title);
      const safeUrl = escapeHtml(url);
      const body = summary
        ? `<p style="margin: 8px 0 0; color: #444; line-height: 1.6;">${escapeHtml(summary)}</p>`
        : "";
      return `
        <div style="padding: 20px 0; border-bottom: 1px solid #eee;">
          <a href="${safeUrl}" style="font-size: 16px; font-weight: 600; color: #111; text-decoration: none;">${safeTitle}</a>
          ${body}
        </div>
      `;
    })
    .join("");

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; max-width: 640px; margin: 0 auto; padding: 24px; color: #111;">
      <h1 style="font-size: 22px; margin: 0 0 4px;">Your Turbodoc digest</h1>
      <p style="color: #777; margin: 0 0 24px;">${range} · ${bookmarks.length} bookmark${bookmarks.length === 1 ? "" : "s"}</p>
      <div>${items}</div>
      <p style="margin-top: 32px; color: #999; font-size: 12px;">
        You're getting this because your weekly digest is enabled.
        <a href="https://turbodoc.ai/settings/digest" style="color: #666;">Manage preferences</a>.
      </p>
    </div>
  `.trim();
}
