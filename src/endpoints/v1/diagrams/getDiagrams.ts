import { z } from "zod";
import { OpenAPIRoute } from "chanfana";
import { AppContext } from "../../../types/app-context";
import { HTTPException } from "hono/http-exception";
import { supabaseApiClient } from "../../../utils/clients/supabase/api";

export class GetDiagrams extends OpenAPIRoute {
  static schema = {
    tags: ["Diagrams"],
    summary: "Get all diagrams for the authenticated user",
    responses: {
      "200": {
        description: "Diagrams retrieved successfully",
        content: {
          "application/json": {
            schema: z
              .object({
                data: z
                  .array(
                    z
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
                          .describe(
                            "ISO timestamp when record was last updated",
                          ),
                      })
                      .describe("Diagram object"),
                  )
                  .describe("Array of diagrams"),
              })
              .describe("Response containing array of diagrams"),
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
        .from("diagrams")
        .select("*")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false });

      if (error) {
        console.error("Error fetching diagrams:", error);
        throw new HTTPException(500, { message: "Failed to fetch diagrams" });
      }

      return c.json({ data });
    } catch (error) {
      console.error("Error in GetDiagrams:", error);
      if (error instanceof HTTPException) {
        throw error;
      }
      throw new HTTPException(500, { message: "Internal server error" });
    }
  }
}
