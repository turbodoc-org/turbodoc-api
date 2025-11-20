import { z } from "zod";
import { OpenAPIRoute } from "chanfana";
import { AppContext } from "../../../types/app-context";
import { HTTPException } from "hono/http-exception";
import { supabaseApiClient } from "../../../utils/clients/supabase/api";

export class GetBookmarks extends OpenAPIRoute {
  static schema = {
    tags: ["Bookmarks"],
    summary: "Get all bookmarks for the authenticated user",
    request: {
      query: z.object({
        status: z
          .enum(["all", "unread", "read", "archived"])
          .optional()
          .default("all")
          .describe("Filter by status"),
        is_favorite: z
          .string()
          .optional()
          .describe("Filter by favorite status (true/false)"),
        tag: z.string().optional().describe("Filter by specific tag"),
        days: z.string().optional().describe("Filter by added in last N days"),
        sort: z
          .enum(["date_newest", "date_oldest", "alpha_asc", "alpha_desc"])
          .optional()
          .default("date_newest")
          .describe("Sort order"),
      }),
    },
    responses: {
      "200": {
        description: "Bookmarks retrieved successfully",
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
                        is_favorite: z
                          .boolean()
                          .describe(
                            "Whether the bookmark is marked as favorite",
                          ),
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
                  .describe("Array of bookmarks"),
              })
              .describe("Response containing array of bookmarks"),
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

      const {
        status = "all",
        is_favorite,
        tag,
        days,
        sort = "date_newest",
      } = c.req.query();

      let query = supabase.from("bookmarks").select("*").eq("user_id", user.id);

      // Apply status filter
      if (status !== "all") {
        query = query.eq("status", status);
      }

      // Apply favorite filter
      if (is_favorite === "true") {
        query = query.eq("is_favorite", true);
      }

      // Apply tag filter
      if (tag) {
        query = query.ilike("tags", `%${tag}%`);
      }

      // Apply days filter
      if (days) {
        const daysAgo = new Date();
        daysAgo.setDate(daysAgo.getDate() - parseInt(days, 10));
        const timestamp = Math.floor(daysAgo.getTime() / 1000);
        query = query.gte("time_added", timestamp);
      }

      // Apply sorting
      switch (sort) {
        case "date_newest":
          query = query.order("time_added", { ascending: false });
          break;
        case "date_oldest":
          query = query.order("time_added", { ascending: true });
          break;
        case "alpha_asc":
          query = query.order("title", { ascending: true });
          break;
        case "alpha_desc":
          query = query.order("title", { ascending: false });
          break;
        default:
          query = query.order("time_added", { ascending: false });
      }

      const { data, error } = await query;

      if (error) {
        console.error("Error fetching bookmarks:", error);
        throw new HTTPException(500, { message: "Failed to fetch bookmarks" });
      }

      return c.json({ data });
    } catch (error) {
      console.error("Error in GetBookmarks:", error);
      if (error instanceof HTTPException) {
        throw error;
      }
      throw new HTTPException(500, { message: "Internal server error" });
    }
  }
}
