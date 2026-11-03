/**
 * Shared shell for Turbodoc HTML emails ("Editorial" look).
 *
 * Rendering strategy, since mail clients disagree wildly:
 * - Fluid-hybrid width: tables are width:100% with max-width:600px (plus a
 *   fixed-width ghost table for Outlook desktop), so nothing overflows on a
 *   phone even when a client strips max-width or ignores <style>.
 * - Mobile-first: inline styles are the phone layout. A min-width media query
 *   adds the roomier desktop spacing, so clients without media query support
 *   (several mobile apps) still get the phone layout.
 * - Dark mode: inline colours are the light theme; utility classes (t-*, bg-*,
 *   b-*) are re-coloured under prefers-color-scheme (Apple Mail, iOS Mail,
 *   Outlook for Mac/iOS, …) and Outlook.com's [data-ogsc]/[data-ogsb] hooks.
 *   Gmail apps ignore both and auto-invert, which these colours survive.
 * - Each concern lives in its own <style> block: Gmail drops a whole block
 *   when it doesn't understand a rule, so one bad rule can't take out the rest.
 */

export const SANS =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
export const SERIF = "Georgia, 'Times New Roman', Times, serif";

export const SITE = "https://turbodoc.ai";
export const ASSETS = "https://api.turbodoc.ai/email-assets";

export const LIGHT = {
  paper: "#f6f3ee",
  card: "#ffffff",
  ink: "#171c26",
  muted: "#5c6370",
  faint: "#8e94a0",
  line: "#ebe5db",
  accentText: "#b4500a",
  accentWash: "#fdf1e4",
  slateWash: "#eef2f8",
  button: "#0e1526",
  buttonText: "#ffffff",
};

export const DARK = {
  paper: "#121418",
  card: "#1b1e24",
  ink: "#ecebe8",
  muted: "#a9afba",
  faint: "#848b98",
  line: "#2d313a",
  accentText: "#f39a4b",
  accentWash: "#2a2019",
  slateWash: "#1f2632",
  button: "#f2790f",
  buttonText: "#0e1526",
};

export function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

/** Lets long words, URLs and email addresses wrap instead of widening the layout. */
export const WRAP = "word-break: break-word; overflow-wrap: anywhere;";

const RESPONSIVE_CSS = `
    @media only screen and (min-width: 640px) {
      .outer { padding: 40px 16px !important; }
      .px { padding-left: 48px !important; padding-right: 48px !important; }
      .hero { padding-top: 48px !important; padding-bottom: 36px !important; }
      .h1 { font-size: 36px !important; line-height: 1.15 !important; }
      .h2 { font-size: 24px !important; }
      .rl { padding: 32px !important; }
      .show-lg { display: inline !important; }
    }`;

const DARK_RULES = (prefix: string, textPrefix = prefix, bgPrefix = prefix) => `
      ${bgPrefix}.bg-paper { background-color: ${DARK.paper} !important; }
      ${bgPrefix}.bg-card { background-color: ${DARK.card} !important; }
      ${bgPrefix}.bg-wash { background-color: ${DARK.accentWash} !important; }
      ${bgPrefix}.bg-slate { background-color: ${DARK.slateWash} !important; }
      ${bgPrefix}.bg-line { background-color: ${DARK.line} !important; }
      ${bgPrefix}.btn-td { background-color: ${DARK.button} !important; }
      ${prefix}.b-line { border-color: ${DARK.line} !important; }
      ${textPrefix}.t-ink { color: ${DARK.ink} !important; }
      ${textPrefix}.t-muted { color: ${DARK.muted} !important; }
      ${textPrefix}.t-faint { color: ${DARK.faint} !important; }
      ${textPrefix}.t-accent { color: ${DARK.accentText} !important; }
      ${textPrefix}.btn-a { color: ${DARK.buttonText} !important; }`;

const DARK_CSS = `
    :root { color-scheme: light dark; supported-color-schemes: light dark; }
    @media (prefers-color-scheme: dark) {${DARK_RULES("")}
      .img-light { display: none !important; }
      .img-dark { display: block !important; max-height: none !important; overflow: visible !important; }
    }`;

// Outlook.com / Outlook mobile apply their own dark mode and expose these hooks.
const OUTLOOK_DARK_CSS = DARK_RULES("[data-ogsc] ", "[data-ogsc] ", "[data-ogsb] ");

export function hairline(): string {
  return `<div class="bg-line" style="height: 1px; line-height: 1px; font-size: 0; background-color: ${LIGHT.line};">&nbsp;</div>`;
}

export function eyebrow(text: string): string {
  return `<div class="t-accent" style="font-family: ${SANS}; font-size: 12px; line-height: 16px; font-weight: 700; letter-spacing: 1.4px; text-transform: uppercase; color: ${LIGHT.accentText};">${text}</div>`;
}

export function pillButton(label: string, url: string): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top: 20px;">
      <tr>
        <td class="btn-td" bgcolor="${LIGHT.button}" style="background-color: ${LIGHT.button}; border-radius: 999px;">
          <a class="btn-a" href="${url}" style="display: inline-block; padding: 13px 24px; font-family: ${SANS}; font-size: 15px; line-height: 20px; font-weight: 600; color: ${LIGHT.buttonText}; text-decoration: none; border-radius: 999px;">${label}</a>
        </td>
      </tr>
    </table>`;
}

/** 32×32 rounded tile with a 16×16 icon; swaps to the "-dark" PNG in dark mode. */
export function iconTile(icon: "note" | "diagram" | "code", tone: "accent" | "slate"): string {
  const bg = tone === "accent" ? LIGHT.accentWash : LIGHT.slateWash;
  const bgClass = tone === "accent" ? "bg-wash" : "bg-slate";
  return `
    <table role="presentation" cellpadding="0" cellspacing="0">
      <tr>
        <td class="${bgClass}" width="32" height="32" align="center" valign="middle" bgcolor="${bg}" style="width: 32px; height: 32px; background-color: ${bg}; border-radius: 8px;">
          <img class="img-light" src="${ASSETS}/${icon}.png" width="16" height="16" alt="" style="display: block; width: 16px; height: 16px; border: 0;">
          <!--[if !mso]><!--><img class="img-dark" src="${ASSETS}/${icon}-dark.png" width="16" height="16" alt="" style="display: none; width: 16px; height: 16px; max-height: 0; overflow: hidden; border: 0;"><!--<![endif]-->
        </td>
      </tr>
    </table>`;
}

export interface LayoutOptions {
  title: string;
  preheader?: string;
  /** Right side of the masthead; may contain markup (e.g. a .show-lg span). */
  mastheadLabel: string;
  /** Table rows (<tr>…</tr>) placed inside the white card. */
  cardRows: string;
  /** Inner HTML of the centred footer. */
  footer: string;
}

export function renderLayout({
  title,
  preheader,
  mastheadLabel,
  cardRows,
  footer,
}: LayoutOptions): string {
  const pre = preheader
    ? `<div style="display: none; max-height: 0; overflow: hidden; mso-hide: all;">${escapeHtml(preheader)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>`
    : "";

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="format-detection" content="telephone=no, date=no, address=no, email=no, url=no">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>${escapeHtml(title)}</title>
  <style>
    body { margin: 0 !important; padding: 0 !important; width: 100% !important; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    img { -ms-interpolation-mode: bicubic; }
    a { text-decoration: none; }
  </style>
  <style>${RESPONSIVE_CSS}
  </style>
  <style>${DARK_CSS}
  </style>
  <style>${OUTLOOK_DARK_CSS}
  </style>
</head>
<body class="bg-paper" style="margin: 0; padding: 0; width: 100%; background-color: ${LIGHT.paper};">
  ${pre}
  <table role="presentation" class="bg-paper" width="100%" cellpadding="0" cellspacing="0" bgcolor="${LIGHT.paper}" style="width: 100%; background-color: ${LIGHT.paper};">
    <tr>
      <td class="outer" align="center" style="padding: 20px 12px 32px;">
        <!--[if mso]><table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0"><tr><td><![endif]-->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width: 100%; max-width: 600px; margin: 0 auto;">

          <!-- Masthead -->
          <tr>
            <td style="padding: 0 4px 20px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width: 100%;">
                <tr>
                  <td width="55%" valign="middle" style="width: 55%; font-family: ${SANS};">
                    <a href="${SITE}" style="text-decoration: none;"><img src="${SITE}/logo.png" width="28" height="28" alt="" style="display: inline-block; vertical-align: middle; border: 0; border-radius: 7px;"><span class="t-ink" style="display: inline-block; margin-left: 8px; font-size: 16px; line-height: 28px; font-weight: 700; letter-spacing: -0.2px; color: ${LIGHT.ink}; vertical-align: middle;">Turbodoc</span></a>
                  </td>
                  <td class="t-faint" width="45%" align="right" valign="middle" style="width: 45%; text-align: right; font-family: ${SANS}; font-size: 13px; line-height: 18px; color: ${LIGHT.faint};">${mastheadLabel}</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td class="bg-card b-line" bgcolor="${LIGHT.card}" style="background-color: ${LIGHT.card}; border: 1px solid ${LIGHT.line}; border-radius: 16px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width: 100%;">
                ${cardRows}
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td class="t-faint" align="center" style="padding: 24px 8px 0; font-family: ${SANS}; font-size: 12px; line-height: 1.7; color: ${LIGHT.faint}; text-align: center;">
              ${footer}
            </td>
          </tr>

        </table>
        <!--[if mso]></td></tr></table><![endif]-->
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function footerLink(label: string, url: string): string {
  return `<a class="t-muted" href="${url}" style="color: ${LIGHT.muted}; text-decoration: underline;">${label}</a>`;
}
