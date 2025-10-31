import { z } from "zod";
import { OpenAPIRoute } from "chanfana";
import { AppContext } from "../../../types/app-context";
import { HTTPException } from "hono/http-exception";
import { supabaseApiClient } from "../../../utils/clients/supabase/api";

export class DeleteCodeSnippet extends OpenAPIRoute {
  static schema = {
    tags: ["Code Snippets"],
    summary: "Delete a code snippet",
    request: {
      params: z.object({
        id: z.string().uuid().describe("The ID of the code snippet to delete"),
      }),
    },
    responses: {
      "204": {
        description: "Code snippet deleted successfully",
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
        description: "Code snippet not found",
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

      if (!id) {
        throw new HTTPException(400, {
          message: "Code snippet ID is required",
        });
      }

      // Check if snippet exists and belongs to user
      const { data: existingSnippet, error: fetchError } = await supabase
        .from("code_snippets")
        .select("id")
        .eq("id", id)
        .eq("user_id", user.id)
        .single();

      if (fetchError || !existingSnippet) {
        throw new HTTPException(404, { message: "Code snippet not found" });
      }

      const { error } = await supabase
        .from("code_snippets")
        .delete()
        .eq("id", id)
        .eq("user_id", user.id);

      if (error) {
        console.error("Error deleting code snippet:", error);
        throw new HTTPException(500, {
          message: "Failed to delete code snippet",
        });
      }

      return new Response(null, { status: 204 });
    } catch (error) {
      console.error("Error in DeleteCodeSnippet:", error);
      if (error instanceof HTTPException) {
        throw error;
      }
      throw new HTTPException(500, { message: "Internal server error" });
    }
  }
}
