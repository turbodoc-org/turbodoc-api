import { z } from "zod";
import { OpenAPIRoute } from "chanfana";
import { AppContext } from "../../../types/app-context";
import { HTTPException } from "hono/http-exception";
import { Database } from "../../../types/database.types";
import { supabaseApiClient } from "../../../utils/clients/supabase/api";

export class UpdateBookmark extends OpenAPIRoute {
  static schema = {
    tags: ["Bookmarks"],
    summary: "Update an existing bookmark",
    request: {
      params: z.object({
        id: z
          .string()
          .min(1, "Bookmark ID is required")
          .describe("Unique identifier of the bookmark to update"),
      }),
      body: {
        content: {
          "application/json": {
            schema: z
              .object({
                title: z
                  .string()
                  .optional()
                  .describe("New title for the bookmark"),
                url: z.string().optional().describe("New URL for the bookmark"),
                tags: z
                  .string()
                  .optional()
                  .describe("New comma-separated tags"),
                status: z
                  .string()
                  .optional()
                  .describe("New status for the bookmark"),
              })
              .describe("Bookmark update request"),
          },
        },
      },
    },
    responses: {
      "200": {
        description: "Bookmark updated successfully",
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
                  .describe("Updated bookmark object"),
              })
              .describe("Response containing the updated bookmark"),
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
      "404": {
        description: "Bookmark not found",
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
      const id = c.req.param("id");
      const authToken = c.get("authToken");
      const supabase = supabaseApiClient(authToken, c);
      const body = await c.req.json();

      const { title, url, tags, status } = body;

      const updatedBookmark: Database["public"]["Tables"]["bookmarks"]["Update"] =
        {};
      if (title !== undefined) updatedBookmark.title = title;
      if (url !== undefined) updatedBookmark.url = url;
      if (tags !== undefined) updatedBookmark.tags = tags;
      if (status !== undefined) updatedBookmark.status = status;

      const { data, error } = await supabase
        .from("bookmarks")
        .update(updatedBookmark)
        .eq("id", id)
        .eq("user_id", user.id)
        .select()
        .single();

      if (error) {
        console.error("Error updating bookmark:", error);
        throw new HTTPException(500, { message: "Failed to update bookmark" });
      }

      if (!data) {
        throw new HTTPException(404, { message: "Bookmark not found" });
      }

      return c.json({ data });
    } catch (error) {
      console.error("Error in UpdateBookmark:", error);
      if (error instanceof HTTPException) {
        throw error;
      }
      throw new HTTPException(500, { message: "Internal server error" });
    }
  }
}
