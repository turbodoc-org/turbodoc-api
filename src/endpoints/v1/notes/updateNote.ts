import { z } from "zod";
import { OpenAPIRoute } from "chanfana";
import { AppContext } from "../../../types/app-context";
import { HTTPException } from "hono/http-exception";
import { supabaseApiClient } from "../../../utils/clients/supabase/api";
import { DocumentVersionConflict, saveDocument } from "../../../utils/documents/save";

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
                is_favorite: z
                  .boolean()
                  .optional()
                  .describe("Whether the note is marked as favorite"),
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
                    user_id: z.string().describe("ID of the user who owns this note"),
                    title: z.string().describe("Title of the note"),
                    content: z.string().describe("Content of the note"),
                    tags: z.string().nullable().describe("Comma-separated tags"),
                    is_favorite: z.boolean().describe("Whether the note is marked as favorite"),
                    version: z.number().describe("Version number for optimistic locking"),
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
                  is_favorite: z.boolean(),
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

      const { title, content, tags, is_favorite, version } = body;

      if (
        title === undefined &&
        content === undefined &&
        tags === undefined &&
        is_favorite === undefined
      ) {
        throw new HTTPException(400, {
          message: "No fields provided to update",
        });
      }

      // The version check and the write happen atomically; every content change
      // records a revision so v2 clients can merge with it.
      const { note } = await saveDocument(
        supabase,
        user.id,
        id,
        { title, markdown: content, tags, is_favorite },
        { expectedVersion: version },
      );

      return c.json({ data: note });
    } catch (error) {
      if (error instanceof DocumentVersionConflict) {
        return c.json({ status: 409, message: error.message, data: error.current }, 409);
      }
      console.error("Error in UpdateNote:", error);
      if (error instanceof HTTPException) {
        if (error.status === 404) throw new HTTPException(404, { message: "Note not found" });
        throw error;
      }
      throw new HTTPException(500, { message: "Internal server error" });
    }
  }
}
