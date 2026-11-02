interface ContactEmailTemplateProps {
  name: string;
  email: string;
  subject: string;
  message: string;
}

// Shares the "Editorial" look of the weekly digest.
const C = {
  paper: "#f6f3ee",
  card: "#ffffff",
  ink: "#171c26",
  muted: "#5c6370",
  faint: "#8e94a0",
  line: "#ebe5db",
  accentText: "#b4500a",
  accentWash: "#fdf1e4",
};

const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const SERIF = "Georgia, 'Times New Roman', Times, serif";

// Helper function to escape HTML to prevent XSS
function escapeHtml(text: string): string {
  const map: { [key: string]: string } = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

function detailRow(label: string, value: string, isLast = false): string {
  const border = isLast ? "" : `border-bottom: 1px solid ${C.line};`;
  return `
    <tr>
      <td width="88" valign="top" style="width: 88px; padding: 12px 0; ${border} font-family: ${SANS}; font-size: 13px; line-height: 20px; color: ${C.faint};">${label}</td>
      <td valign="top" style="padding: 12px 0; ${border} font-family: ${SANS}; font-size: 15px; line-height: 20px; font-weight: 600; color: ${C.ink};">${value}</td>
    </tr>`;
}

// Render template to HTML string for Cloudflare Workers compatibility.
// The same HTML goes to the Turbodoc inbox and, as a confirmation, to the sender,
// so keep the copy neutral for both readers.
export function renderContactEmailTemplate({
  name,
  email,
  subject,
  message,
}: ContactEmailTemplateProps): string {
  const safeEmail = escapeHtml(email);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>New contact form submission</title>
  <style>
    @media only screen and (max-width: 620px) {
      .outer { padding: 24px 12px 32px !important; }
      .px { padding-left: 24px !important; padding-right: 24px !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: ${C.paper};">
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
                    <img src="https://turbodoc.ai/logo.png" width="28" height="28" alt="" style="vertical-align: middle; border: 0; border-radius: 7px;">
                    <span style="margin-left: 8px; font-size: 16px; font-weight: 700; letter-spacing: -0.2px; color: ${C.ink}; vertical-align: middle;">Turbodoc</span>
                  </td>
                  <td align="right" valign="middle" style="font-family: ${SANS}; font-size: 13px; color: ${C.faint}; white-space: nowrap;">Contact form</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td bgcolor="${C.card}" style="background-color: ${C.card}; border: 1px solid ${C.line}; border-radius: 16px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td class="px" style="padding: 48px 48px 28px; font-family: ${SANS};">
                    <div style="font-size: 12px; line-height: 16px; font-weight: 700; letter-spacing: 1.4px; text-transform: uppercase; color: ${C.accentText};">Contact form submission</div>
                    <h1 style="margin: 14px 0 0; font-family: ${SERIF}; font-size: 30px; line-height: 1.2; font-weight: 400; letter-spacing: -0.4px; color: ${C.ink};">${escapeHtml(subject)}</h1>
                  </td>
                </tr>
                <tr>
                  <td class="px" style="padding: 0 48px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top: 1px solid ${C.line}; border-bottom: 1px solid ${C.line};">
                      ${detailRow("From", escapeHtml(name))}
                      ${detailRow("Email", `<a href="mailto:${safeEmail}" style="color: ${C.accentText}; text-decoration: none;">${safeEmail}</a>`, true)}
                    </table>
                  </td>
                </tr>
                <tr>
                  <td class="px" style="padding: 28px 48px 48px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${C.accentWash}" style="background-color: ${C.accentWash}; border-radius: 12px;">
                      <tr>
                        <td style="padding: 24px; font-family: ${SANS}; font-size: 15px; line-height: 1.6; color: ${C.ink}; white-space: pre-wrap;">${escapeHtml(message)}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding: 28px 8px 0; font-family: ${SANS}; font-size: 12px; line-height: 1.7; color: ${C.faint};">
              Sent from the contact form on <a href="https://turbodoc.ai" style="color: ${C.muted}; text-decoration: underline;">turbodoc.ai</a>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
