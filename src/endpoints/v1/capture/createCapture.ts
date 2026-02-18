import { OpenAPIRoute } from "chanfana";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { AppContext } from "../../../types/app-context";
import type { Database } from "../../../types/database.types";
import { supabaseApiClient } from "../../../utils/clients/supabase/api";

type CaptureKind = "note" | "bookmark" | "snippet" | "diagram";

const captureSchema = z.object({
  kind: z.enum(["note", "bookmark", "snippet", "diagram"]),
  title: z.string().optional(),
  content: z.string().optional(),
  tags: z.string().optional(),
  url: z.string().optional(),
  status: z.string().optional(),
  code: z.string().optional(),
  language: z.string().optional(),
  theme: z.string().optional(),
  background_type: z.string().optional(),
  background_value: z.string().optional(),
  padding: z.number().optional(),
  show_line_numbers: z.boolean().optional(),
  font_family: z.string().optional(),
  font_size: z.number().optional(),
  window_style: z.string().optional(),
  shapes: z.array(z.any()).optional(),
  connections: z.array(z.any()).optional(),
  thumbnail: z.string().optional(),
  format: z.enum(["canvas_v1", "mermaid_v2"]).optional(),
  mermaid_text: z.string().optional(),
});

const persistIdempotency = async (
  supabase: ReturnType<typeof supabaseApiClient>,
  userId: string,
  key: string,
  kind: CaptureKind,
  response: { data: unknown },
  status: number,
) => {
  const { error } = await supabase.from("idempotency_keys").insert({
    user_id: userId,
    key,
    kind,
    response,
    status,
  });

  if (error && error.code !== "23505") {
    console.error("Error storing idempotency key:", error);
  }
};

export class CreateCapture extends OpenAPIRoute {
  static schema = {
    tags: ["Capture"],
    summary: "Unified capture for notes, bookmarks, snippets, and diagrams",
    request: {
      body: {
        content: {
          "application/json": {
            schema: captureSchema,
          },
        },
      },
    },
    responses: {
      "201": {
        description: "Capture created successfully",
        content: {
          "application/json": {
            schema: z.object({
              data: z.unknown(),
            }),
          },
        },
      },
      "400": {
        description: "Bad request",
        content: {
          "application/json": {
            schema: z.object({
              status: z.number(),
              message: z.string(),
            }),
          },
        },
      },
      "401": {
        description: "Unauthorized",
        content: {
          "application/json": {
            schema: z.object({
              status: z.number(),
              message: z.string(),
            }),
          },
        },
      },
    },
  };

  async handle(c: AppContext) {
    try {
      const user = c.get("user");
      const authToken = c.get("authToken");
      const supabase = supabaseApiClient(authToken, c);
      const parsed = captureSchema.safeParse(await c.req.json());
      if (!parsed.success) {
        throw new HTTPException(400, { message: "Invalid capture payload" });
      }
      const body = parsed.data;
      const idempotencyKey = c.req.header("Idempotency-Key");

      if (idempotencyKey) {
        const { data: existing, error } = await supabase
          .from("idempotency_keys")
          .select("response,status")
          .eq("user_id", user.id)
          .eq("key", idempotencyKey)
          .eq("kind", body.kind)
          .maybeSingle();

        if (error && error.code !== "PGRST116") {
          console.error("Error checking idempotency key:", error);
        }

        if (existing?.response) {
          return c.json(
            existing.response as { data: unknown },
            existing.status ?? 200,
          );
        }
      }

      let data: unknown = null;

      switch (body.kind) {
        case "note": {
          const newNote: Database["public"]["Tables"]["notes"]["Insert"] = {
            user_id: user.id,
            title: body.title ?? "",
            content: body.content ?? "",
            tags: body.tags,
            version: 1,
          };

          const { data: note, error } = await supabase
            .from("notes")
            .insert(newNote)
            .select()
            .single();

          if (error || !note) {
            console.error("Error creating note:", error);
            throw new HTTPException(500, { message: "Failed to create note" });
          }

          data = note;
          break;
        }
        case "bookmark": {
          if (!body.title || !body.url) {
            throw new HTTPException(400, {
              message: "Title and URL are required",
            });
          }

          const newBookmark: Database["public"]["Tables"]["bookmarks"]["Insert"] =
            {
              user_id: user.id,
              title: body.title,
              url: body.url,
              time_added: Math.floor(Date.now() / 1000),
              tags: body.tags,
              status: body.status ?? "unread",
            };

          const { data: bookmark, error } = await supabase
            .from("bookmarks")
            .insert(newBookmark)
            .select()
            .single();

          if (error || !bookmark) {
            console.error("Error creating bookmark:", error);
            throw new HTTPException(500, {
              message: "Failed to create bookmark",
            });
          }

          data = bookmark;
          break;
        }
        case "snippet": {
          if (!body.title || !body.code) {
            throw new HTTPException(400, {
              message: "Title and code are required",
            });
          }

          const newSnippet: Database["public"]["Tables"]["code_snippets"]["Insert"] =
            {
              user_id: user.id,
              title: body.title,
              code: body.code,
              language: body.language ?? "javascript",
              theme: body.theme ?? "dracula",
              background_type: body.background_type ?? "gradient",
              background_value:
                body.background_value ??
                "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
              padding: body.padding ?? 64,
              show_line_numbers: body.show_line_numbers ?? true,
              font_family: body.font_family ?? "Fira Code",
              font_size: body.font_size ?? 14,
              window_style: body.window_style ?? "mac",
            };

          const { data: snippet, error } = await supabase
            .from("code_snippets")
            .insert(newSnippet)
            .select()
            .single();

          if (error || !snippet) {
            console.error("Error creating code snippet:", error);
            throw new HTTPException(500, {
              message: "Failed to create code snippet",
            });
          }

          data = snippet;
          break;
        }
        case "diagram": {
          if (!body.title) {
            throw new HTTPException(400, { message: "Title is required" });
          }

          const format = body.format ?? "canvas_v1";
          if (format === "mermaid_v2" && !body.mermaid_text) {
            throw new HTTPException(400, {
              message: "mermaid_text is required for mermaid_v2 diagrams",
            });
          }

          const newDiagram: Database["public"]["Tables"]["diagrams"]["Insert"] =
            {
              user_id: user.id,
              title: body.title,
              shapes: body.shapes ?? [],
              connections: body.connections ?? [],
              thumbnail: body.thumbnail,
              format,
              mermaid_text: body.mermaid_text ?? null,
            };

          const { data: diagram, error } = await supabase
            .from("diagrams")
            .insert(newDiagram)
            .select()
            .single();

          if (error || !diagram) {
            console.error("Error creating diagram:", error);
            throw new HTTPException(500, {
              message: "Failed to create diagram",
            });
          }

          data = diagram;
          break;
        }
        default:
          throw new HTTPException(400, { message: "Invalid capture kind" });
      }

      const response = { data };

      if (idempotencyKey) {
        await persistIdempotency(
          supabase,
          user.id,
          idempotencyKey,
          body.kind,
          response,
          201,
        );
      }

      return c.json(response, 201);
    } catch (error) {
      console.error("Error in CreateCapture:", error);
      if (error instanceof HTTPException) {
        throw error;
      }
      throw new HTTPException(500, { message: "Internal server error" });
    }
  }
}
