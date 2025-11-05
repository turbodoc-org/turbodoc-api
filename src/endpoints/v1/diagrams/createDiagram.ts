import { z } from "zod";
import { OpenAPIRoute } from "chanfana";
import { AppContext } from "../../../types/app-context";
import { HTTPException } from "hono/http-exception";
import { Database } from "../../../types/database.types";
import { supabaseApiClient } from "../../../utils/clients/supabase/api";

export class CreateDiagram extends OpenAPIRoute {
  static schema = {
    tags: ["Diagrams"],
    summary: "Create a new diagram",
    request: {
      body: {
        content: {
          "application/json": {
            schema: z
              .object({
                title: z
                  .string()
                  .min(1, "Title is required")
                  .describe("Title of the diagram"),
                shapes: z
                  .array(z.any())
                  .optional()
                  .default([])
                  .describe("Array of diagram shapes"),
                connections: z
                  .array(z.any())
                  .optional()
                  .default([])
                  .describe("Array of diagram connections"),
                thumbnail: z
                  .string()
                  .optional()
                  .describe("Base64 encoded thumbnail image"),
              })
              .describe("Diagram creation request"),
          },
        },
      },
    },
    responses: {
      "201": {
        description: "Diagram created successfully",
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
                  .describe("Created diagram object"),
              })
              .describe("Response containing the created diagram"),
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

      const { title, shapes = [], connections = [], thumbnail } = body;

      if (!title) {
        throw new HTTPException(400, { message: "Title is required" });
      }

      const newDiagram: Database["public"]["Tables"]["diagrams"]["Insert"] = {
        user_id: user.id,
        title,
        shapes,
        connections,
        thumbnail,
      };

      const { data, error } = await supabase
        .from("diagrams")
        .insert(newDiagram)
        .select()
        .single();

      if (error) {
        console.error("Error creating diagram:", error);
        throw new HTTPException(500, { message: "Failed to create diagram" });
      }

      return c.json({ data }, 201);
    } catch (error) {
      console.error("Error in CreateDiagram:", error);
      if (error instanceof HTTPException) {
        throw error;
      }
      throw new HTTPException(500, { message: "Internal server error" });
    }
  }
}
