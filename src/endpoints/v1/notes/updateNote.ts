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

      const { title, content, tags } = body;

      // Build update object with only provided fields
      const updateNote: Database["public"]["Tables"]["notes"]["Update"] = {};

      if (title !== undefined) updateNote.title = title;
      if (content !== undefined) updateNote.content = content;
      if (tags !== undefined) updateNote.tags = tags;

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
        throw error;
      }
      throw new HTTPException(500, { message: "Internal server error" });
    }
  }
}
