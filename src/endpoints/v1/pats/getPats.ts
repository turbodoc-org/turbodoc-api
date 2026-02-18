import { OpenAPIRoute } from "chanfana";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { AppContext } from "../../../types/app-context";
import { supabaseApiClient } from "../../../utils/clients/supabase/api";

export class GetPats extends OpenAPIRoute {
  static schema = {
    tags: ["Personal Access Tokens"],
    summary: "List personal access tokens",
    responses: {
      "200": {
        description: "PATs retrieved successfully",
        content: {
          "application/json": {
            schema: z.object({
              data: z.array(
                z.object({
                  id: z.string(),
                  scopes: z.array(z.string()).nullable(),
                  created_at: z.string(),
                  last_used_at: z.string().nullable(),
                  revoked_at: z.string().nullable(),
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
        .from("personal_access_tokens")
        .select("id,scopes,created_at,last_used_at,revoked_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching PATs:", error);
        throw new HTTPException(500, { message: "Failed to fetch PATs" });
      }

      return c.json({ data: data || [] });
    } catch (error) {
      console.error("Error in GetPats:", error);
      if (error instanceof HTTPException) {
        throw error;
      }
      throw new HTTPException(500, { message: "Internal server error" });
    }
  }
}
