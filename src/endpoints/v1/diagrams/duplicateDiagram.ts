import { z } from "zod";
import { OpenAPIRoute } from "chanfana";
import { AppContext } from "../../../types/app-context";
import { HTTPException } from "hono/http-exception";
import { Database } from "../../../types/database.types";
import { supabaseApiClient } from "../../../utils/clients/supabase/api";

export class DuplicateDiagram extends OpenAPIRoute {
  static schema = {
    tags: ["Diagrams"],
    summary: "Duplicate an existing diagram",
    request: {
      params: z.object({
        id: z.string().describe("Diagram ID to duplicate"),
      }),
    },
    responses: {
      "201": {
        description: "Diagram duplicated successfully",
        content: {
          "application/json": {
            schema: z
              .object({
                data: z
                  .object({
                    id: z
                      .string()
                      .describe("Unique identifier for the new diagram"),
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
                  .describe("Duplicated diagram object"),
              })
              .describe("Response containing the duplicated diagram"),
          },
        },
      },
      "404": {
        description: "Original diagram not found",
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

      // First, fetch the original diagram
      const { data: originalDiagram, error: fetchError } = await supabase
        .from("diagrams")
        .select("*")
        .eq("id", id)
        .eq("user_id", user.id)
        .single();

      if (fetchError || !originalDiagram) {
        console.error("Error fetching original diagram:", fetchError);
        throw new HTTPException(404, { message: "Diagram not found" });
      }

      // Create a duplicate with a new title
      const duplicatedDiagram: Database["public"]["Tables"]["diagrams"]["Insert"] =
        {
          user_id: user.id,
          title: `${originalDiagram.title} (Copy)`,
          shapes: originalDiagram.shapes,
          connections: originalDiagram.connections,
          thumbnail: originalDiagram.thumbnail,
        };

      const { data, error } = await supabase
        .from("diagrams")
        .insert(duplicatedDiagram)
        .select()
        .single();

      if (error) {
        console.error("Error duplicating diagram:", error);
        throw new HTTPException(500, {
          message: "Failed to duplicate diagram",
        });
      }

      return c.json({ data }, 201);
    } catch (error) {
      console.error("Error in DuplicateDiagram:", error);
      if (error instanceof HTTPException) {
        throw error;
      }
      throw new HTTPException(500, { message: "Internal server error" });
    }
  }
}
