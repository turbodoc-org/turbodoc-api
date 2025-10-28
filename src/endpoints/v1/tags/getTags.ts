import { z } from "zod";
import { OpenAPIRoute } from "chanfana";
import { AppContext } from "../../../types/app-context";
import { HTTPException } from "hono/http-exception";
import { supabaseApiClient } from "../../../utils/clients/supabase/api";

export class GetTags extends OpenAPIRoute {
  static schema = {
    tags: ["Tags"],
    summary: "Get top 5 most used tags for the authenticated user",
    responses: {
      "200": {
        description: "Tags retrieved successfully",
        content: {
          "application/json": {
            schema: z
              .object({
                data: z
                  .array(
                    z
                      .object({
                        tag: z.string().describe("Tag name"),
                        count: z
                          .number()
                          .describe("Number of times this tag has been used"),
                      })
                      .describe("Tag object with usage count"),
                  )
                  .describe("Array of tags sorted by usage frequency"),
              })
              .describe("Response containing array of tags"),
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

      // Get all bookmarks for the user that have tags
      const { data: bookmarks, error } = await supabase
        .from("bookmarks")
        .select("tags")
        .eq("user_id", user.id)
        .not("tags", "is", null)
        .neq("tags", "");

      if (error) {
        console.error("Error fetching bookmarks for tags:", error);
        throw new HTTPException(500, { message: "Failed to fetch tags" });
      }

      // Process tags and count frequencies
      const tagCounts = new Map<string, number>();

      bookmarks?.forEach((bookmark) => {
        if (!bookmark.tags) return;

        // Split tags by pipe separator and clean them
        const tags = bookmark.tags
          .split("|")
          .map((tag: string) => tag.trim())
          .filter((tag: string) => tag.length > 0);

        tags.forEach((tag: string) => {
          tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
        });
      });

      // Convert to array, sort by count descending, and take top 5
      const sortedTags = Array.from(tagCounts.entries())
        .map(([tag, count]) => ({ tag, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      return c.json({ data: sortedTags });
    } catch (error) {
      console.error("Error in GetTags:", error);
      if (error instanceof HTTPException) {
        throw error;
      }
      throw new HTTPException(500, { message: "Internal server error" });
    }
  }
}
