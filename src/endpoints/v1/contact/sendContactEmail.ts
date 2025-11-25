import { z } from "zod";
import { OpenAPIRoute } from "chanfana";
import { AppContext } from "../../../types/app-context";
import { HTTPException } from "hono/http-exception";
import { Resend } from "resend";
import { ContactEmailTemplate } from "../../../emails/contact-email-template";

export class SendContactEmail extends OpenAPIRoute {
  static schema = {
    tags: ["Contact"],
    summary: "Send a contact form email",
    request: {
      body: {
        content: {
          "application/json": {
            schema: z
              .object({
                name: z
                  .string()
                  .min(1, "Name is required")
                  .describe("Sender's name"),
                email: z
                  .email("Must be a valid email")
                  .describe("Sender's email address"),
                subject: z
                  .string()
                  .min(1, "Subject is required")
                  .describe("Email subject"),
                message: z
                  .string()
                  .min(10, "Message must be at least 10 characters")
                  .describe("Email message body"),
              })
              .describe("Contact form submission"),
          },
        },
      },
    },
    responses: {
      "200": {
        description: "Email sent successfully",
        content: {
          "application/json": {
            schema: z.object({
              success: z.boolean(),
              message: z.string(),
            }),
          },
        },
      },
      "400": {
        description: "Invalid request",
      },
      "500": {
        description: "Internal server error",
      },
    },
  };

  async handle(c: AppContext) {
    try {
      const body = await c.req.json();
      const { name, email, subject, message } = body;

      if (!name || !email || !subject || !message) {
        throw new HTTPException(400, {
          message: "All fields are required",
        });
      }

      const resendApiKey = c.env.RESEND_API_KEY;
      const contactEmail = c.env.CONTACT_EMAIL!;

      // Initialize Resend client
      const resend = new Resend(resendApiKey);

      // Send email using Resend SDK with React template
      const { data, error } = await resend.emails.send({
        from: "Turbodoc Contact <noreply@mail.turbodoc.ai>",
        to: [contactEmail],
        replyTo: email,
        subject: `[Turbodoc Contact Form] ${subject}`,
        react: ContactEmailTemplate({ name, email, subject, message }),
      });

      if (error) {
        console.error("Resend API error:", error);
        throw new HTTPException(500, {
          message: "Failed to send email",
        });
      }

      return c.json(
        {
          success: true,
          message: "Message sent successfully! I'll get back to you soon.",
        },
        200,
      );
    } catch (error) {
      console.error("Error sending contact email:", error);

      if (error instanceof HTTPException) {
        throw error;
      }

      throw new HTTPException(500, {
        message: "Failed to send message. Please try again later.",
      });
    }
  }
}
