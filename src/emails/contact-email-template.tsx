import * as React from "react";

interface ContactEmailTemplateProps {
  name: string;
  email: string;
  subject: string;
  message: string;
}

export function ContactEmailTemplate({
  name,
  email,
  subject,
  message,
}: ContactEmailTemplateProps) {
  return (
    <div
      style={{
        fontFamily: "Arial, sans-serif",
        maxWidth: "600px",
        margin: "0 auto",
      }}
    >
      <h2 style={{ color: "#333" }}>New Contact Form Submission</h2>
      <div
        style={{
          background: "#f5f5f5",
          padding: "20px",
          borderRadius: "8px",
          margin: "20px 0",
        }}
      >
        <p style={{ margin: "10px 0" }}>
          <strong>From:</strong> {name}
        </p>
        <p style={{ margin: "10px 0" }}>
          <strong>Email:</strong> <a href={`mailto:${email}`}>{email}</a>
        </p>
        <p style={{ margin: "10px 0" }}>
          <strong>Subject:</strong> {subject}
        </p>
      </div>
      <div
        style={{
          background: "white",
          padding: "20px",
          border: "1px solid #ddd",
          borderRadius: "8px",
        }}
      >
        <h3 style={{ color: "#666", marginTop: 0 }}>Message:</h3>
        <p style={{ whiteSpace: "pre-wrap", color: "#333", lineHeight: 1.6 }}>
          {message}
        </p>
      </div>
      <div
        style={{
          marginTop: "20px",
          paddingTop: "20px",
          borderTop: "1px solid #ddd",
          color: "#999",
          fontSize: "12px",
        }}
      >
        <p>This email was sent from the Turbodoc contact form.</p>
      </div>
    </div>
  );
}
