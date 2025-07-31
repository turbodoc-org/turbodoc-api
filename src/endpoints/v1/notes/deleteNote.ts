import { z } from "zod";
import { OpenAPIRoute } from "chanfana";
import { AppContext } from "../../../types/app-context";
import { HTTPException } from "hono/http-exception";
import { supabaseApiClient } from "../../../utils/clients/supabase/api";

export class DeleteNote extends OpenAPIRoute {
  static schema = {
    tags: ["Notes"],
    summary: "Delete a note",
    request: {
      params: z.object({
        id: z.string().describe("UUID of the note to delete"),
      }),
    },
    responses: {
      "204": {
        description: "Note deleted successfully",
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

      const { error } = await supabase
        .from("notes")
        .delete()
        .eq("id", id)
        .eq("user_id", user.id);

      if (error) {
        console.error("Error deleting note:", error);
        if (error.code === "PGRST116") {
          throw new HTTPException(404, { message: "Note not found" });
        }
        throw new HTTPException(500, { message: "Failed to delete note" });
      }

      return c.body(null, 204);
    } catch (error) {
      console.error("Error in DeleteNote:", error);
      if (error instanceof HTTPException) {
        throw error;
      }
      throw new HTTPException(500, { message: "Internal server error" });
    }
  }
}
