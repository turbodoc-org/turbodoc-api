import { z } from "zod";
import { OpenAPIRoute } from "chanfana";
import { AppContext } from "../../../types/app-context";
import { HTTPException } from "hono/http-exception";
import { supabaseApiClient } from "../../../utils/clients/supabase/api";

export class SearchBookmarks extends OpenAPIRoute {
  static schema = {
    tags: ["Bookmarks"],
    summary: "Search bookmarks for the authenticated user",
    request: {
      query: z.object({
        q: z.string().min(1).describe("Search query"),
      }),
    },
    responses: {
      "200": {
        description: "Search results retrieved successfully",
        content: {
          "application/json": {
            schema: z
              .object({
                data: z
                  .array(
                    z
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
                          .describe(
                            "ISO timestamp when record was last updated",
                          ),
                      })
                      .describe("Bookmark object"),
                  )
                  .describe("Array of matching bookmarks"),
                query: z.string().describe("The search query used"),
              })
              .describe("Response containing search results"),
          },
        },
      },
      "400": {
        description: "Bad request - invalid query parameter",
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

      const { q: query } = c.req.valid("query");

      if (!query || query.trim().length === 0) {
        throw new HTTPException(400, { message: "Search query is required" });
      }

      const trimmedQuery = query.trim();

      // Use Supabase full-text search with PostgreSQL's to_tsquery
      // Search across title, url, and tags columns
      const { data, error } = await supabase
        .from("bookmarks")
        .select("*")
        .eq("user_id", user.id)
        .or(
          `title.ilike.%${trimmedQuery}%,url.ilike.%${trimmedQuery}%,tags.ilike.%${trimmedQuery}%`,
        )
        .order("time_added", { ascending: false });

      if (error) {
        console.error("Error searching bookmarks:", error);
        throw new HTTPException(500, { message: "Failed to search bookmarks" });
      }

      return c.json({
        data: data || [],
        query: trimmedQuery,
      });
    } catch (error) {
      console.error("Error in SearchBookmarks:", error);
      if (error instanceof HTTPException) {
        throw error;
      }
      throw new HTTPException(500, { message: "Internal server error" });
    }
  }
}
