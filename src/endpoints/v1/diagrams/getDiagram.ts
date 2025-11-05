import { z } from "zod";
import { OpenAPIRoute } from "chanfana";
import { AppContext } from "../../../types/app-context";
import { HTTPException } from "hono/http-exception";
import { supabaseApiClient } from "../../../utils/clients/supabase/api";

export class GetDiagram extends OpenAPIRoute {
  static schema = {
    tags: ["Diagrams"],
    summary: "Get a specific diagram by ID",
    request: {
      params: z.object({
        id: z.string().describe("Diagram ID"),
      }),
    },
    responses: {
      "200": {
        description: "Diagram retrieved successfully",
        content: {
          "application/json": {
            schema: z
              .object({
                data: z
                  .object({
                    id: z
                      .string()
                      .describe("Unique identifier for the diagram"),
                    user_id: z
                      .string()
                      .describe("ID of the user who owns this diagram"),
                    title: z.string().describe("Title of the diagram"),
                    shapes: z
                      .array(z.any())
                      .describe("Array of diagram shapes"),
                    connections: z
                      .array(z.any())
                      .describe("Array of diagram connections"),
                    thumbnail: z
                      .string()
                      .nullable()
                      .describe("Base64 encoded thumbnail image"),
                    created_at: z
                      .string()
                      .describe("ISO timestamp when record was created"),
                    updated_at: z
                      .string()
                      .describe("ISO timestamp when record was last updated"),
                  })
                  .describe("Diagram object"),
              })
              .describe("Response containing the diagram"),
          },
        },
      },
      "404": {
        description: "Diagram not found",
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
      const id = c.req.param("id");
      const supabase = supabaseApiClient(authToken, c);

      const { data, error } = await supabase
        .from("diagrams")
        .select("*")
        .eq("id", id)
        .eq("user_id", user.id)
        .single();

      if (error || !data) {
        console.error("Error fetching diagram:", error);
        throw new HTTPException(404, { message: "Diagram not found" });
      }

      return c.json({ data });
    } catch (error) {
      console.error("Error in GetDiagram:", error);
      if (error instanceof HTTPException) {
        throw error;
      }
      throw new HTTPException(500, { message: "Internal server error" });
    }
  }
}
