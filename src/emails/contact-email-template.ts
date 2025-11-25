interface ContactEmailTemplateProps {
  name: string;
  email: string;
  subject: string;
  message: string;
}

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

// Render template to HTML string for Cloudflare Workers compatibility
export function renderContactEmailTemplate({
  name,
  email,
  subject,
  message,
}: ContactEmailTemplateProps): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #333;">New Contact Form Submission</h2>
      <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <p style="margin: 10px 0;"><strong>From:</strong> ${escapeHtml(name)}</p>
        <p style="margin: 10px 0;"><strong>Email:</strong> <a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></p>
        <p style="margin: 10px 0;"><strong>Subject:</strong> ${escapeHtml(subject)}</p>
      </div>
      <div style="background: white; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
        <h3 style="color: #666; margin-top: 0;">Message:</h3>
        <p style="white-space: pre-wrap; color: #333; line-height: 1.6;">${escapeHtml(message)}</p>
      </div>
      <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #ddd; color: #999; font-size: 12px;">
        <p>This email was sent from the Turbodoc contact form.</p>
      </div>
    </div>
  `.trim();
}
