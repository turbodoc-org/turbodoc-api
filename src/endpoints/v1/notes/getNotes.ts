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
        is_favorite: z
          .string()
          .optional()
          .describe("Filter by favorite status (true/false)"),
        tag: z.string().optional().describe("Filter by specific tag"),
        days: z
          .string()
          .optional()
          .describe("Filter by created in last N days"),
        sort: z
          .enum([
            "date_newest",
            "date_oldest",
            "alpha_asc",
            "alpha_desc",
            "modified",
          ])
          .optional()
          .default("date_newest")
          .describe("Sort order"),
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
                      is_favorite: z
                        .boolean()
                        .describe("Whether the note is marked as favorite"),
                      version: z
                        .number()
                        .describe("Version number for optimistic locking"),
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

      const {
        limit = "50",
        offset = "0",
        search,
        is_favorite,
        tag,
        days,
        sort = "date_newest",
      } = c.req.query();

      let query = supabase
        .from("notes")
        .select("*", { count: "exact" })
        .eq("user_id", user.id);

      // Apply filters
      if (search) {
        query = query.or(`title.ilike.%${search}%,content.ilike.%${search}%`);
      }

      if (is_favorite === "true") {
        query = query.eq("is_favorite", true);
      }

      if (tag) {
        query = query.ilike("tags", `%${tag}%`);
      }

      if (days) {
        const daysAgo = new Date();
        daysAgo.setDate(daysAgo.getDate() - parseInt(days, 10));
        query = query.gte("created_at", daysAgo.toISOString());
      }

      // Apply sorting
      switch (sort) {
        case "date_newest":
          query = query.order("created_at", { ascending: false });
          break;
        case "date_oldest":
          query = query.order("created_at", { ascending: true });
          break;
        case "alpha_asc":
          query = query.order("title", { ascending: true });
          break;
        case "alpha_desc":
          query = query.order("title", { ascending: false });
          break;
        case "modified":
          query = query.order("updated_at", { ascending: false });
          break;
        default:
          query = query.order("created_at", { ascending: false });
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
