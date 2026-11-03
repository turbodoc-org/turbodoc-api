import {
  LIGHT as C,
  SANS,
  SERIF,
  SITE,
  WRAP,
  escapeHtml,
  eyebrow,
  footerLink,
  renderLayout,
} from "./email-layout";

interface ContactEmailTemplateProps {
  name: string;
  email: string;
  subject: string;
  message: string;
}

function detailRow(label: string, value: string, isLast = false): string {
  const border = isLast ? "" : `border-bottom: 1px solid ${C.line};`;
  return `
    <tr>
      <td class="t-faint b-line" width="72" valign="top" style="width: 72px; padding: 12px 0; ${border} font-family: ${SANS}; font-size: 13px; line-height: 20px; color: ${C.faint};">${label}</td>
      <td class="t-ink b-line" valign="top" style="padding: 12px 0 12px 12px; ${border} font-family: ${SANS}; font-size: 15px; line-height: 20px; font-weight: 600; color: ${C.ink}; ${WRAP}">${value}</td>
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

  const cardRows = `
        <tr>
          <td class="px hero" style="padding: 32px 24px 24px; font-family: ${SANS};">
            ${eyebrow("Contact form submission")}
            <h1 class="h1 t-ink" style="margin: 14px 0 0; font-family: ${SERIF}; font-size: 26px; line-height: 1.2; font-weight: 400; letter-spacing: -0.4px; color: ${C.ink}; ${WRAP}">${escapeHtml(subject)}</h1>
          </td>
        </tr>
        <tr>
          <td class="px" style="padding: 0 24px;">
            <table role="presentation" class="b-line" width="100%" cellpadding="0" cellspacing="0" style="width: 100%; border-top: 1px solid ${C.line}; border-bottom: 1px solid ${C.line};">
              ${detailRow("From", escapeHtml(name))}
              ${detailRow("Email", `<a class="t-accent" href="mailto:${safeEmail}" style="color: ${C.accentText}; text-decoration: none;">${safeEmail}</a>`, true)}
            </table>
          </td>
        </tr>
        <tr>
          <td class="px" style="padding: 24px 24px 32px;">
            <table role="presentation" class="bg-wash" width="100%" cellpadding="0" cellspacing="0" bgcolor="${C.accentWash}" style="width: 100%; background-color: ${C.accentWash}; border-radius: 12px;">
              <tr>
                <td class="t-ink" style="padding: 20px; font-family: ${SANS}; font-size: 15px; line-height: 1.6; color: ${C.ink}; white-space: pre-wrap; ${WRAP}">${escapeHtml(message)}</td>
              </tr>
            </table>
          </td>
        </tr>`;

  return renderLayout({
    title: "New contact form submission",
    mastheadLabel: "Contact form",
    cardRows,
    footer: `Sent from the contact form on ${footerLink("turbodoc.ai", SITE)}`,
  });
}
