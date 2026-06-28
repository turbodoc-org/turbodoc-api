import { z } from "zod";
import { OpenAPIRoute } from "chanfana";
import { AppContext } from "../../../types/app-context";
import { HTTPException } from "hono/http-exception";
import { supabaseApiClient } from "../../../utils/clients/supabase/api";

/**
 * Returns summary statistics for the authenticated user, used to populate the
 * profile screen in the iOS app. Counts are computed live from Supabase using
 * the user-scoped client.
 *
 * Returns:
 *   - bookmark_count: total bookmarks owned by the user
 *   - note_count:      total notes owned by the user
 *   - tag_count:        number of distinct tags in use
 *   - favorite_count:   number of favorited bookmarks
 *   - member_since:     ISO timestamp the user's Supabase auth account was
 *                       created (for the "Member Since" profile field)
 */
export class GetUserStats extends OpenAPIRoute {
  static schema = {
    tags: ["Users"],
    summary: "Get summary stats for the current user",
    responses: {
      "200": {
        description: "User stats retrieved successfully",
        content: {
          "application/json": {
            schema: z.object({
              data: z.object({
                bookmark_count: z.number(),
                note_count: z.number(),
                tag_count: z.number(),
                favorite_count: z.number(),
                member_since: z
                  .string()
                  .nullable()
                  .describe("ISO timestamp the account was created"),
              }),
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

      // Run count queries (head: true returns only the count) in parallel.
      const [bookmarksRes, notesRes, favoriteRes, tagsRowsRes] = await Promise.all([
        supabase
          .from("bookmarks")
          .select("*", { count: "exact", head: true })
          .eq("user_id", user.id),
        supabase.from("notes").select("*", { count: "exact", head: true }).eq("user_id", user.id),
        supabase
          .from("bookmarks")
          .select("*", { count: "exact", head: true })
          .eq("user_id", user.id)
          .eq("is_favorite", true),
        // Distinct tags are derived from the bookmarks.tags column, which
        // stores tags as a pipe-separated string. Fetch the rows once.
        supabase
          .from("bookmarks")
          .select("tags")
          .eq("user_id", user.id)
          .not("tags", "is", null)
          .neq("tags", ""),
      ]);

      if (bookmarksRes.error || notesRes.error || favoriteRes.error || tagsRowsRes.error) {
        const firstError =
          bookmarksRes.error || notesRes.error || favoriteRes.error || tagsRowsRes.error;
        console.error("Error fetching user stats:", firstError);
        throw new HTTPException(500, { message: "Failed to fetch user stats" });
      }

      const distinctTags = new Set<string>();
      for (const row of tagsRowsRes.data ?? []) {
        const value = (row as { tags?: string | null } | null)?.tags;
        if (!value || typeof value !== "string") continue;
        for (const tag of value.split("|")) {
          const trimmed = tag.trim();
          if (trimmed.length > 0) distinctTags.add(trimmed);
        }
      }

      // Supabase auth user objects expose `created_at` as the registration date.
      const memberSince = typeof user.created_at === "string" ? user.created_at : null;

      return c.json({
        data: {
          bookmark_count: bookmarksRes.count ?? 0,
          note_count: notesRes.count ?? 0,
          tag_count: distinctTags.size,
          favorite_count: favoriteRes.count ?? 0,
          member_since: memberSince,
        },
      });
    } catch (error) {
      console.error("Error in GetUserStats:", error);
      if (error instanceof HTTPException) {
        throw error;
      }
      throw new HTTPException(500, { message: "Internal server error" });
    }
  }
}
