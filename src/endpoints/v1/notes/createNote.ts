import { z } from "zod";
import { OpenAPIRoute } from "chanfana";
import { AppContext } from "../../../types/app-context";
import { HTTPException } from "hono/http-exception";
import { Database } from "../../../types/database.types";
import { supabaseApiClient } from "../../../utils/clients/supabase/api";

export class CreateNote extends OpenAPIRoute {
  static schema = {
    tags: ["Notes"],
    summary: "Create a new note",
    request: {
      body: {
        content: {
          "application/json": {
            schema: z
              .object({
                title: z
                  .string()
                  .optional()
                  .default("")
                  .describe("Title of the note"),
                content: z
                  .string()
                  .optional()
                  .default("")
                  .describe("Content of the note (can include whitespace)"),
                tags: z.string().optional().describe("Comma-separated tags"),
              })
              .describe("Note creation request"),
          },
        },
      },
    },
    responses: {
      "201": {
        description: "Note created successfully",
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
                  .describe("Created note object"),
              })
              .describe("Response containing the created note"),
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
      const body = await c.req.json();

      const { title = "", content = "", tags } = body;

      const newNote: Database["public"]["Tables"]["notes"]["Insert"] = {
        user_id: user.id,
        title,
        content,
        tags,
      };

      const { data, error } = await supabase
        .from("notes")
        .insert(newNote)
        .select()
        .single();

      if (error) {
        console.error("Error creating note:", error);
        throw new HTTPException(500, { message: "Failed to create note" });
      }

      return c.json({ data }, 201);
    } catch (error) {
      console.error("Error in CreateNote:", error);
      if (error instanceof HTTPException) {
        throw error;
      }
      throw new HTTPException(500, { message: "Internal server error" });
    }
  }
}
