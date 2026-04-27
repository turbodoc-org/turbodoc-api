import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../types/database.types";

export type BookmarkWorkflowParams = {
  bookmarkId: string;
  userId?: string;
  url: string;
};

// Cap the content passed to the LLM. llama-3.3-70b has a 128k window but
// keeping this tight keeps latency and cost predictable across the fleet.
const MAX_CONTENT_CHARS = 12_000;

const SUMMARY_SYSTEM_PROMPT =
  "You write two-to-three sentence summaries of articles for a weekly email digest. " +
  "Focus on the key takeaways a reader would want to remember. Plain prose, no bullet points, no preamble.";

export class BookmarkWorkflow extends WorkflowEntrypoint<Cloudflare.Env, BookmarkWorkflowParams> {
  async run(event: Readonly<WorkflowEvent<BookmarkWorkflowParams>>, step: WorkflowStep) {
    const { bookmarkId, url } = event.payload;
    const supabase = createClient<Database>(this.env.SUPABASE_URL, this.env.SUPABASE_SECRET_KEY);

    await step.do("mark-processing", async () => {
      const { error } = await supabase
        .from("bookmarks")
        .update({ content_status: "processing" })
        .eq("id", bookmarkId);
      if (error) throw error;
    });

    try {
      const markdown = await step.do(
        "fetch-markdown",
        { retries: { limit: 3, delay: "10 seconds", backoff: "exponential" } },
        async () => {
          const res = await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${this.env.CLOUDFLARE_ACCOUNT_ID}/browser-rendering/markdown`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${this.env.CLOUDFLARE_API_TOKEN}`,
              },
              body: JSON.stringify({
                url,
                gotoOptions: { waitUntil: "networkidle0" },
                rejectRequestPattern: ["/^.*\\.(css|png|jpg|jpeg|gif|svg|woff|woff2|ttf)/"],
              }),
            },
          );

          if (!res.ok) {
            const errorBody = await res.text();
            const message = `Markdown API ${res.status}: ${errorBody}`;
            console.error(message);
            throw new Error(message);
          }

          const data = (await res.json()) as { success?: boolean; result?: string };
          if (!data.success || !data.result) {
            console.error("Markdown API returned empty result");
            throw new Error("Markdown API returned empty result");
          }

          return data.result;
        },
      );

      if (!markdown.trim()) {
        console.error("No readable content extracted");
        throw new Error("No readable content extracted");
      }

      const summary = await step.do(
        "summarize",
        { retries: { limit: 2, delay: "5 seconds", backoff: "exponential" } },
        async () => {
          const truncated = markdown.slice(0, MAX_CONTENT_CHARS);
          const response = (await this.env.AI!.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
            messages: [
              { role: "system", content: SUMMARY_SYSTEM_PROMPT },
              { role: "user", content: truncated },
            ],
          })) as { response?: string };
          const text = response.response?.trim();
          if (!text) {
            console.error("AI returned empty summary");
            throw new Error("AI returned empty summary");
          }
          return text;
        },
      );

      await step.do("persist-summary", async () => {
        const { error } = await supabase
          .from("bookmarks")
          .update({
            summary,
            content_status: "succeeded",
            content_processed_at: new Date().toISOString(),
          })
          .eq("id", bookmarkId);
        if (error) {
          console.error("Failed to persist summary:", error);
          throw error;
        }
      });
    } catch (error) {
      // Terminal failure — leave summary null so the digest falls back to title-only.
      console.error(`BookmarkWorkflow failed for ${bookmarkId}:`, error);
      await step.do("mark-failed", async () => {
        const { error: updateError } = await supabase
          .from("bookmarks")
          .update({
            content_status: "failed",
            content_processed_at: new Date().toISOString(),
          })
          .eq("id", bookmarkId);
        if (updateError) {
          console.error("Failed to mark bookmark as failed:", updateError);
          throw updateError;
        }
      });
    }
  }
}
