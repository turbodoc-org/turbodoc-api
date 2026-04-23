import { OpenAPIRoute } from "chanfana";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { AppContext } from "../../../types/app-context";
import { supabaseApiClient } from "../../../utils/clients/supabase/api";

export class ListPats extends OpenAPIRoute {
  static schema = {
    tags: ["PATs"],
    summary: "List personal access tokens",
    responses: {
      "200": {
        description: "PATs retrieved successfully",
        content: {
          "application/json": {
            schema: z.object({
              data: z.array(
                z.object({
                  id: z.string().describe("Token ID"),
                  name: z.string().describe("Token name"),
                  token_last4: z
                    .string()
                    .describe("Last four characters of the token"),
                  created_at: z
                    .string()
                    .describe("ISO timestamp when token was created"),
                  last_used_at: z
                    .string()
                    .nullable()
                    .describe("ISO timestamp when token was last used"),
                  revoked_at: z
                    .string()
                    .nullable()
                    .describe("ISO timestamp when token was revoked"),
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
        .select("id, name, token_last4, created_at, last_used_at, revoked_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error listing PATs:", error);
        throw new HTTPException(500, {
          message: "Failed to list personal access tokens",
        });
      }

      return c.json({ data });
    } catch (error) {
      console.error("Error in ListPats:", error);
      if (error instanceof HTTPException) {
        throw error;
      }
      throw new HTTPException(500, { message: "Internal server error" });
    }
  }
}
