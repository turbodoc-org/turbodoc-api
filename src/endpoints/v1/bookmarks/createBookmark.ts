import { z } from "zod";
import { OpenAPIRoute } from "chanfana";
import { AppContext } from "../../../types/app-context";
import { HTTPException } from "hono/http-exception";
import { Database } from "../../../types/database.types";
import { supabaseApiClient } from "../../../utils/clients/supabase/api";

export class CreateBookmark extends OpenAPIRoute {
  static schema = {
    tags: ["Bookmarks"],
    summary: "Create a new bookmark",
    request: {
      body: {
        content: {
          "application/json": {
            schema: z
              .object({
                title: z
                  .string()
                  .min(1, "Title is required")
                  .describe("Title of the bookmark"),
                url: z
                  .string()
                  .url("Must be a valid URL")
                  .describe("URL of the bookmark"),
                tags: z.string().optional().describe("Comma-separated tags"),
                status: z
                  .string()
                  .optional()
                  .default("unread")
                  .describe("Status of the bookmark (read/unread)"),
              })
              .describe("Bookmark creation request"),
          },
        },
      },
    },
    responses: {
      "201": {
        description: "Bookmark created successfully",
        content: {
          "application/json": {
            schema: z
              .object({
                data: z
                  .object({
                    id: z
                      .string()
                      .describe("Unique identifier for the bookmark"),
                    user_id: z
                      .string()
                      .describe("ID of the user who owns this bookmark"),
                    title: z.string().describe("Title of the bookmark"),
                    url: z.string().describe("URL of the bookmark"),
                    time_added: z
                      .number()
                      .describe("Unix timestamp when bookmark was added"),
                    tags: z
                      .string()
                      .nullable()
                      .describe("Comma-separated tags"),
                    status: z
                      .string()
                      .describe("Status of the bookmark (read/unread)"),
                    created_at: z
                      .string()
                      .nullable()
                      .describe("ISO timestamp when record was created"),
                    updated_at: z
                      .string()
                      .nullable()
                      .describe("ISO timestamp when record was last updated"),
                  })
                  .describe("Created bookmark object"),
              })
              .describe("Response containing the created bookmark"),
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

      const { title, url, tags, status = "unread" } = body;

      if (!title || !url) {
        throw new HTTPException(400, { message: "Title and URL are required" });
      }

      const newBookmark: Database["public"]["Tables"]["bookmarks"]["Insert"] = {
        user_id: user.id,
        title,
        url,
        time_added: Math.floor(Date.now() / 1000),
        tags,
        status,
      };

      const { data, error } = await supabase
        .from("bookmarks")
        .insert(newBookmark)
        .select()
        .single();

      if (error) {
        console.error("Error creating bookmark:", error);
        throw new HTTPException(500, { message: "Failed to create bookmark" });
      }

      return c.json({ data }, 201);
    } catch (error) {
      console.error("Error in CreateBookmark:", error);
      if (error instanceof HTTPException) {
        throw error;
      }
      throw new HTTPException(500, { message: "Internal server error" });
    }
  }
}
