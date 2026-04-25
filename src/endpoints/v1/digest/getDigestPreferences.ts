import { z } from "zod";
import { OpenAPIRoute } from "chanfana";
import { AppContext } from "../../../types/app-context";
import { HTTPException } from "hono/http-exception";
import { supabaseApiClient } from "../../../utils/clients/supabase/api";

const DigestPreferencesSchema = z.object({
  user_id: z.string(),
  enabled: z.boolean(),
  day_of_week: z.number().int().min(0).max(6),
  send_time: z.string().describe("Local send time as HH:MM or HH:MM:SS"),
  timezone: z.string(),
  last_sent_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export class GetDigestPreferences extends OpenAPIRoute {
  static schema = {
    tags: ["Digest"],
    summary: "Get the current user's digest preferences",
    description:
      "Returns the user's digest preferences. If no preferences row exists yet, defaults are inserted and returned.",
    responses: {
      "200": {
        description: "Digest preferences",
        content: {
          "application/json": {
            schema: z.object({ data: DigestPreferencesSchema }),
          },
        },
      },
      "401": { description: "Unauthorized" },
    },
  };

  async handle(c: AppContext) {
    const user = c.get("user");
    const authToken = c.get("authToken");
    const supabase = supabaseApiClient(authToken, c);

    const { data: existing, error: selectError } = await supabase
      .from("digest_preferences")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (selectError) {
      console.error("Error fetching digest preferences:", selectError);
      throw new HTTPException(500, { message: "Failed to fetch digest preferences" });
    }

    if (existing) {
      return c.json({ data: existing });
    }

    const { data: inserted, error: insertError } = await supabase
      .from("digest_preferences")
      .insert({ user_id: user.id })
      .select()
      .single();

    if (insertError) {
      console.error("Error creating digest preferences:", insertError);
      throw new HTTPException(500, { message: "Failed to create digest preferences" });
    }

    return c.json({ data: inserted });
  }
}
