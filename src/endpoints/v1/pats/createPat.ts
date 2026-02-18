import { OpenAPIRoute } from "chanfana";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { AppContext } from "../../../types/app-context";
import { generatePatToken, hashToken } from "../../../utils/auth/pat";
import { supabaseApiClient } from "../../../utils/clients/supabase/api";

export class CreatePat extends OpenAPIRoute {
  static schema = {
    tags: ["Personal Access Tokens"],
    summary: "Create a personal access token",
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({
              scopes: z
                .array(z.enum(["read", "write"]))
                .optional()
                .describe("Optional scopes for the token"),
            }),
          },
        },
      },
    },
    responses: {
      "201": {
        description: "PAT created successfully",
        content: {
          "application/json": {
            schema: z.object({
              data: z.object({
                id: z.string(),
                token: z
                  .string()
                  .describe("Personal access token (shown once)"),
                scopes: z.array(z.string()).nullable(),
                created_at: z.string(),
                last_used_at: z.string().nullable(),
                revoked_at: z.string().nullable(),
              }),
            }),
          },
        },
      },
      "400": {
        description: "Bad request",
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
      const body = await c.req.json();

      const scopes = Array.isArray(body?.scopes) ? body.scopes : null;
      const token = generatePatToken();
      const tokenHash = await hashToken(token);

      const { data, error } = await supabase
        .from("personal_access_tokens")
        .insert({
          user_id: user.id,
          token_hash: tokenHash,
          scopes,
        })
        .select("id,scopes,created_at,last_used_at,revoked_at")
        .single();

      if (error || !data) {
        console.error("Error creating PAT:", error);
        throw new HTTPException(500, { message: "Failed to create PAT" });
      }

      return c.json({ data: { ...data, token } }, 201);
    } catch (error) {
      console.error("Error in CreatePat:", error);
      if (error instanceof HTTPException) {
        throw error;
      }
      throw new HTTPException(500, { message: "Internal server error" });
    }
  }
}
