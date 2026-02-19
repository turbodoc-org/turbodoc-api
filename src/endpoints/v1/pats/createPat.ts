import { OpenAPIRoute } from "chanfana";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { AppContext } from "../../../types/app-context";
import type { Database } from "../../../types/database.types";
import {
  generatePatToken,
  getPatTokenLast4,
  hashPatToken,
} from "../../../utils/auth/pats";
import { supabaseApiClient } from "../../../utils/clients/supabase/api";

export class CreatePat extends OpenAPIRoute {
  static schema = {
    tags: ["PATs"],
    summary: "Create a personal access token",
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({
              name: z
                .string()
                .min(1, "Name is required")
                .max(80, "Name must be 80 characters or less")
                .describe("Token name"),
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
                id: z.string().describe("Token ID"),
                name: z.string().describe("Token name"),
                token: z.string().describe("Full personal access token"),
                token_last4: z
                  .string()
                  .describe("Last four characters of the token"),
                created_at: z
                  .string()
                  .describe("ISO timestamp when token was created"),
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

      const { name } = body;
      if (!name) {
        throw new HTTPException(400, { message: "Name is required" });
      }

      const token = generatePatToken();
      const tokenHash = await hashPatToken(token);

      const insert: Database["public"]["Tables"]["personal_access_tokens"]["Insert"] =
        {
          user_id: user.id,
          name,
          token_hash: tokenHash,
          token_last4: getPatTokenLast4(token),
        };

      const { data, error } = await supabase
        .from("personal_access_tokens")
        .insert(insert)
        .select("id, name, created_at, token_last4")
        .single();

      if (error || !data) {
        console.error("Error creating PAT:", error);
        throw new HTTPException(500, {
          message: "Failed to create personal access token",
        });
      }

      return c.json(
        {
          data: {
            id: data.id,
            name: data.name,
            token,
            token_last4: data.token_last4,
            created_at: data.created_at,
          },
        },
        201,
      );
    } catch (error) {
      console.error("Error in CreatePat:", error);
      if (error instanceof HTTPException) {
        throw error;
      }
      throw new HTTPException(500, { message: "Internal server error" });
    }
  }
}
