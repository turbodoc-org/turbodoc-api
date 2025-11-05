import { z } from "zod";
import { OpenAPIRoute } from "chanfana";
import { AppContext } from "../../../types/app-context";
import { HTTPException } from "hono/http-exception";
import { Database } from "../../../types/database.types";
import { supabaseApiClient } from "../../../utils/clients/supabase/api";

export class UpdateDiagram extends OpenAPIRoute {
  static schema = {
    tags: ["Diagrams"],
    summary: "Update an existing diagram",
    request: {
      params: z.object({
        id: z.string().describe("Diagram ID"),
      }),
      body: {
        content: {
          "application/json": {
            schema: z
              .object({
                title: z
                  .string()
                  .min(1, "Title cannot be empty")
                  .optional()
                  .describe("Title of the diagram"),
                shapes: z
                  .array(z.any())
                  .optional()
                  .describe("Array of diagram shapes"),
                connections: z
                  .array(z.any())
                  .optional()
                  .describe("Array of diagram connections"),
                thumbnail: z
                  .string()
                  .optional()
                  .describe("Base64 encoded thumbnail image"),
              })
              .describe("Diagram update request"),
          },
        },
      },
    },
    responses: {
      "200": {
        description: "Diagram updated successfully",
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
                  .describe("Updated diagram object"),
              })
              .describe("Response containing the updated diagram"),
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
      const id = c.req.param("id");
      const authToken = c.get("authToken");
      const supabase = supabaseApiClient(authToken, c);
      const body = await c.req.json();

      const { title, shapes, connections, thumbnail } = body;

      const updatedDiagram: Database["public"]["Tables"]["diagrams"]["Update"] =
        {};
      if (title !== undefined) updatedDiagram.title = title;
      if (shapes !== undefined) updatedDiagram.shapes = shapes;
      if (connections !== undefined) updatedDiagram.connections = connections;
      if (thumbnail !== undefined) updatedDiagram.thumbnail = thumbnail;

      const { data, error } = await supabase
        .from("diagrams")
        .update(updatedDiagram)
        .eq("id", id)
        .eq("user_id", user.id)
        .select()
        .single();

      if (error) {
        console.error("Error updating diagram:", error);
        throw new HTTPException(500, { message: "Failed to update diagram" });
      }

      if (!data) {
        throw new HTTPException(404, { message: "Diagram not found" });
      }

      return c.json({ data });
    } catch (error) {
      console.error("Error in UpdateDiagram:", error);
      if (error instanceof HTTPException) {
        throw error;
      }
      throw new HTTPException(500, { message: "Internal server error" });
    }
  }
}
