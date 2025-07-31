import { z } from "zod";
import { OpenAPIRoute } from "chanfana";
import { AppContext } from "../../../types/app-context";
import { HTTPException } from "hono/http-exception";
import { supabaseApiClient } from "../../../utils/clients/supabase/api";

export class GetNote extends OpenAPIRoute {
  static schema = {
    tags: ["Notes"],
    summary: "Get a specific note by ID",
    request: {
      params: z.object({
        id: z.string().describe("UUID of the note to retrieve"),
      }),
    },
    responses: {
      "200": {
        description: "Note retrieved successfully",
        content: {
          "application/json": {
            schema: z
              .object({
                data: z
                  .object({
                    id: z.string().describe("Unique identifier for the note"),
                    user_id: z
                      .string()
                      .describe("ID of the user who owns this note"),
                    title: z.string().describe("Title of the note"),
                    content: z.string().describe("Content of the note"),
                    tags: z
                      .string()
                      .nullable()
                      .describe("Comma-separated tags"),
                    created_at: z
                      .string()
                      .nullable()
                      .describe("ISO timestamp when record was created"),
                    updated_at: z
                      .string()
                      .nullable()
                      .describe("ISO timestamp when record was last updated"),
                  })
                  .describe("Note object"),
              })
              .describe("Response containing the note"),
          },
        },
      },
      "404": {
        description: "Note not found",
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
        .from("notes")
        .select("*")
        .eq("id", id)
        .eq("user_id", user.id)
        .single();

      if (error) {
        console.error("Error fetching note:", error);
        if (error.code === "PGRST116") {
          throw new HTTPException(404, { message: "Note not found" });
        }
        throw new HTTPException(500, { message: "Failed to fetch note" });
      }

      return c.json({ data });
    } catch (error) {
      console.error("Error in GetNote:", error);
      if (error instanceof HTTPException) {
        throw error;
      }
      throw new HTTPException(500, { message: "Internal server error" });
    }
  }
}
