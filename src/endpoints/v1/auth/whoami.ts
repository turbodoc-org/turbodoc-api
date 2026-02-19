import { OpenAPIRoute } from "chanfana";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { AppContext } from "../../../types/app-context";

export class WhoAmI extends OpenAPIRoute {
  static schema = {
    tags: ["Auth"],
    summary: "Get the authenticated user identity",
    responses: {
      "200": {
        description: "Authenticated user identity",
        content: {
          "application/json": {
            schema: z.object({
              user_id: z.string().describe("Authenticated user ID"),
              auth_type: z.enum(["jwt", "pat"]).describe("Authentication type"),
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
      "403": {
        description: "Forbidden",
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
      const authType = c.get("authType");

      return c.json({
        user_id: user.id,
        auth_type: authType,
      });
    } catch (error) {
      console.error("Error in WhoAmI:", error);
      if (error instanceof HTTPException) {
        throw error;
      }
      throw new HTTPException(500, { message: "Internal server error" });
    }
  }
}
