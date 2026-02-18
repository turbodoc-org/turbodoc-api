import { OpenAPIRoute } from "chanfana";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { AppContext } from "../../../types/app-context";
import { supabaseApiClient } from "../../../utils/clients/supabase/api";

export class RevokePat extends OpenAPIRoute {
  static schema = {
    tags: ["Personal Access Tokens"],
    summary: "Revoke a personal access token",
    request: {
      params: z.object({
        id: z.string().describe("PAT ID to revoke"),
      }),
    },
    responses: {
      "200": {
        description: "PAT revoked successfully",
        content: {
          "application/json": {
            schema: z.object({
              data: z.object({
                id: z.string(),
                scopes: z.array(z.string()).nullable(),
                created_at: z.string(),
                last_used_at: z.string().nullable(),
                revoked_at: z.string().nullable(),
              }),
            }),
          },
        },
      },
      "404": {
        description: "PAT not found",
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

      const { data, error } = await supabase
        .from("personal_access_tokens")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", id)
        .eq("user_id", user.id)
        .select("id,scopes,created_at,last_used_at,revoked_at")
        .single();

      if (error || !data) {
        console.error("Error revoking PAT:", error);
        throw new HTTPException(404, { message: "PAT not found" });
      }

      return c.json({ data });
    } catch (error) {
      console.error("Error in RevokePat:", error);
      if (error instanceof HTTPException) {
        throw error;
      }
      throw new HTTPException(500, { message: "Internal server error" });
    }
  }
}
