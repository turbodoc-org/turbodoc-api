import { z } from "zod";
import { OpenAPIRoute } from "chanfana";
import { AppContext } from "../../../types/app-context";
import { HTTPException } from "hono/http-exception";
import { Database } from "../../../types/database.types";
import { supabaseApiClient } from "../../../utils/clients/supabase/api";

export class UpdateNote extends OpenAPIRoute {
  static schema = {
    tags: ["Notes"],
    summary: "Update a note",
    request: {
      params: z.object({
        id: z.string().describe("UUID of the note to update"),
      }),
      body: {
        content: {
          "application/json": {
            schema: z
              .object({
                title: z.string().optional().describe("Title of the note"),
                content: z
                  .string()
                  .optional()
                  .describe("Content of the note (can include whitespace)"),
                tags: z.string().optional().describe("Comma-separated tags"),
                version: z
                  .number()
                  .optional()
                  .describe("Current version number for optimistic locking"),
              })
              .describe("Note update request"),
          },
        },
      },
    },
    responses: {
      "200": {
        description: "Note updated successfully",
        content: {
          "application/json": {
            schema: z
              .object({
                data: z
                  .object({
                    id: z.string().describe("Unique identifier for the note"),
                    user_id: z
                      .string()
                      .describe("ID of the user who owns this note"),
                    title: z.string().describe("Title of the note"),
                    content: z.string().describe("Content of the note"),
                    tags: z
                      .string()
                      .nullable()
                      .describe("Comma-separated tags"),
                    version: z
                      .number()
                      .describe("Version number for optimistic locking"),
                    created_at: z
                      .string()
                      .nullable()
                      .describe("ISO timestamp when record was created"),
                    updated_at: z
                      .string()
                      .nullable()
                      .describe("ISO timestamp when record was last updated"),
                  })
                  .describe("Updated note object"),
              })
              .describe("Response containing the updated note"),
          },
        },
      },
      "404": {
        description: "Note not found",
        content: {
          "application/json": {
            schema: z.object({
              status: z.number(),
              message: z.string(),
            }),
          },
        },
      },
      "409": {
        description: "Version conflict - note was modified by another client",
        content: {
          "application/json": {
            schema: z.object({
              status: z.number(),
              message: z.string(),
              data: z
                .object({
                  id: z.string(),
                  user_id: z.string(),
                  title: z.string(),
                  content: z.string(),
                  tags: z.string().nullable(),
                  version: z.number(),
                  created_at: z.string().nullable(),
                  updated_at: z.string().nullable(),
                })
                .describe("Current server version of the note"),
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
      const { id } = c.req.param();
      const body = await c.req.json();

      const { title, content, tags, version } = body;

      // If version is provided, check for conflicts first
      if (version !== undefined) {
        const { data: currentNote, error: fetchError } = await supabase
          .from("notes")
          .select("*")
          .eq("id", id)
          .eq("user_id", user.id)
          .single();

        if (fetchError) {
          if (fetchError.code === "PGRST116") {
            throw new HTTPException(404, { message: "Note not found" });
          }
          throw new HTTPException(500, {
            message: "Failed to fetch current note",
          });
        }

        // Check version conflict
        if (currentNote.version !== version) {
          throw new HTTPException(409, {
            message: "Version conflict - note was modified by another client",
            cause: { data: currentNote },
          });
        }
      }

      // Build update object with only provided fields
      const updateNote: Database["public"]["Tables"]["notes"]["Update"] = {};

      if (title !== undefined) updateNote.title = title;
      if (content !== undefined) updateNote.content = content;
      if (tags !== undefined) updateNote.tags = tags;

      // Increment version on every update
      if (version !== undefined) {
        updateNote.version = version + 1;
      }

      // Check if there's anything to update
      if (Object.keys(updateNote).length === 0) {
        throw new HTTPException(400, {
          message: "No fields provided to update",
        });
      }

      const { data, error } = await supabase
        .from("notes")
        .update(updateNote)
        .eq("id", id)
        .eq("user_id", user.id)
        .select()
        .single();

      if (error) {
        console.error("Error updating note:", error);
        if (error.code === "PGRST116") {
          throw new HTTPException(404, { message: "Note not found" });
        }
        throw new HTTPException(500, { message: "Failed to update note" });
      }

      return c.json({ data });
    } catch (error) {
      console.error("Error in UpdateNote:", error);
      if (error instanceof HTTPException) {
        // Handle 409 conflict specially to include current note data
        if (error.status === 409 && error.cause) {
          return c.json(
            {
              status: 409,
              message: error.message,
              data: (error.cause as any).data,
            },
            409,
          );
        }
        throw error;
      }
      throw new HTTPException(500, { message: "Internal server error" });
    }
  }
}
