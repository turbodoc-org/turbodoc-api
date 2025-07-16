import { z } from "zod";
import { OpenAPIRoute } from "chanfana";
import { AppContext } from "../../../types/app-context";
import { HTTPException } from "hono/http-exception";
import { supabaseApiClient } from "../../../utils/clients/supabase/api";

export class DeleteBookmark extends OpenAPIRoute {
  static schema = {
    tags: ["Bookmarks"],
    summary: "Delete a bookmark",
    request: {
      params: z.object({
        id: z
          .string()
          .min(1, "Bookmark ID is required")
          .describe("Unique identifier of the bookmark to delete"),
      }),
    },
    responses: {
      "200": {
        description: "Bookmark deleted successfully",
        content: {
          "application/json": {
            schema: z
              .object({
                message: z.string().describe("Success message"),
              })
              .describe("Deletion confirmation response"),
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

      const { data, error } = await supabase
        .from("bookmarks")
        .delete()
        .eq("id", id)
        .eq("user_id", user.id)
        .select()
        .single();

      if (error) {
        console.error("Error deleting bookmark:", error);
        throw new HTTPException(500, { message: "Failed to delete bookmark" });
      }

      if (!data) {
        throw new HTTPException(404, { message: "Bookmark not found" });
      }

      return c.json({ message: "Bookmark deleted successfully" });
    } catch (error) {
      console.error("Error in DeleteBookmark:", error);
      if (error instanceof HTTPException) {
        throw error;
      }
      throw new HTTPException(500, { message: "Internal server error" });
    }
  }
}
