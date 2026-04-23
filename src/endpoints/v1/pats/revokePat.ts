import { OpenAPIRoute } from "chanfana";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { AppContext } from "../../../types/app-context";
import { supabaseApiClient } from "../../../utils/clients/supabase/api";

export class RevokePat extends OpenAPIRoute {
  static schema = {
    tags: ["PATs"],
    summary: "Revoke a personal access token",
    request: {
      params: z.object({
        id: z
          .string()
          .min(1, "Token ID is required")
          .describe("Token ID to revoke"),
      }),
    },
    responses: {
      "200": {
        description: "PAT revoked successfully",
        content: {
          "application/json": {
            schema: z.object({
              data: z.object({
                id: z.string().describe("Token ID"),
                revoked_at: z
                  .string()
                  .describe("ISO timestamp when token was revoked"),
              }),
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
    },
  };

  async handle(c: AppContext) {
    try {
      const user = c.get("user");
      const id = c.req.param("id");
      const authToken = c.get("authToken");
      const supabase = supabaseApiClient(authToken, c);
      const revokedAt = new Date().toISOString();

      const { data, error } = await supabase
        .from("personal_access_tokens")
        .update({ revoked_at: revokedAt })
        .eq("id", id)
        .eq("user_id", user.id)
        .select("id, revoked_at")
        .single();

      if (error) {
        console.error("Error revoking PAT:", error);
        throw new HTTPException(500, {
          message: "Failed to revoke personal access token",
        });
      }

      if (!data) {
        throw new HTTPException(404, { message: "Token not found" });
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
