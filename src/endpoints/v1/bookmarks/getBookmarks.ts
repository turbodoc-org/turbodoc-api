import { z } from "zod";
import { OpenAPIRoute } from "chanfana";
import { AppContext } from "../../../types/app-context";
import { HTTPException } from "hono/http-exception";
import { supabaseApiClient } from "../../../utils/clients/supabase/api";

export class GetBookmarks extends OpenAPIRoute {
  static schema = {
    tags: ["Bookmarks"],
    summary: "Get all bookmarks for the authenticated user",
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

      const { data, error } = await supabase
        .from("bookmarks")
        .select("*")
        .eq("user_id", user.id)
        .order("time_added", { ascending: false });

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
