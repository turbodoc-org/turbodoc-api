import { z } from "zod";
import { OpenAPIRoute } from "chanfana";
import { AppContext } from "../../../types/app-context";
import { HTTPException } from "hono/http-exception";
import { supabaseApiClient } from "../../../utils/clients/supabase/api";

export class GetCodeSnippets extends OpenAPIRoute {
  static schema = {
    tags: ["Code Snippets"],
    summary: "Get all code snippets for the authenticated user",
    responses: {
      "200": {
        description: "Code snippets retrieved successfully",
        content: {
          "application/json": {
            schema: z.object({
              data: z.array(
                z.object({
                  id: z.string(),
                  user_id: z.string(),
                  title: z.string(),
                  code: z.string(),
                  language: z.string(),
                  theme: z.string(),
                  background_type: z.string(),
                  background_value: z.string(),
                  padding: z.number(),
                  show_line_numbers: z.boolean(),
                  font_family: z.string(),
                  font_size: z.number(),
                  window_style: z.string(),
                  created_at: z.string(),
                  updated_at: z.string(),
                }),
              ),
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

      const { data, error } = await supabase
        .from("code_snippets")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching code snippets:", error);
        throw new HTTPException(500, {
          message: "Failed to fetch code snippets",
        });
      }

      return c.json({ data });
    } catch (error) {
      console.error("Error in GetCodeSnippets:", error);
      if (error instanceof HTTPException) {
        throw error;
      }
      throw new HTTPException(500, { message: "Internal server error" });
    }
  }
}
