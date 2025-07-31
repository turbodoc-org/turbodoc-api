import { z } from "zod";
import { OpenAPIRoute } from "chanfana";
import { AppContext } from "../../../types/app-context";
import { HTTPException } from "hono/http-exception";
import { supabaseApiClient } from "../../../utils/clients/supabase/api";

export class GetNotes extends OpenAPIRoute {
  static schema = {
    tags: ["Notes"],
    summary: "Get user's notes",
    request: {
      query: z.object({
        limit: z
          .string()
          .optional()
          .default("50")
          .describe("Maximum number of notes to return (default: 50)"),
        offset: z
          .string()
          .optional()
          .default("0")
          .describe("Number of notes to skip (default: 0)"),
        search: z
          .string()
          .optional()
          .describe("Search term to filter notes by title or content"),
      }),
    },
    responses: {
      "200": {
        description: "Notes retrieved successfully",
        content: {
          "application/json": {
            schema: z
              .object({
                data: z
                  .array(
                    z.object({
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
                    }),
                  )
                  .describe("Array of note objects"),
                count: z.number().describe("Total number of notes"),
              })
              .describe("Response containing notes and count"),
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

      const { limit = "50", offset = "0", search } = c.req.query();

      let query = supabase
        .from("notes")
        .select("*", { count: "exact" })
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false });

      if (search) {
        query = query.or(`title.ilike.%${search}%,content.ilike.%${search}%`);
      }

      query = query.range(
        parseInt(offset, 10),
        parseInt(offset, 10) + parseInt(limit, 10) - 1,
      );

      const { data, error, count } = await query;

      if (error) {
        console.error("Error fetching notes:", error);
        throw new HTTPException(500, { message: "Failed to fetch notes" });
      }

      return c.json({ data: data || [], count: count || 0 });
    } catch (error) {
      console.error("Error in GetNotes:", error);
      if (error instanceof HTTPException) {
        throw error;
      }
      throw new HTTPException(500, { message: "Internal server error" });
    }
  }
}
