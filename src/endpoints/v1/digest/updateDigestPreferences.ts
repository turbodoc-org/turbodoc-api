import { z } from "zod";
import { OpenAPIRoute } from "chanfana";
import { AppContext } from "../../../types/app-context";
import { HTTPException } from "hono/http-exception";
import { supabaseApiClient } from "../../../utils/clients/supabase/api";

export class UpdateDigestPreferences extends OpenAPIRoute {
  static schema = {
    tags: ["Digest"],
    summary: "Update the current user's digest preferences",
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({
              enabled: z.boolean().optional(),
              day_of_week: z.number().int().min(0).max(6).optional(),
              send_time: z
                .string()
                .regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, "Must be HH:MM or HH:MM:SS")
                .optional(),
              timezone: z.string().min(1).optional(),
            }),
          },
        },
      },
    },
    responses: {
      "200": {
        description: "Updated digest preferences",
        content: {
          "application/json": {
            schema: z.object({
              data: z.object({
                user_id: z.string(),
                enabled: z.boolean(),
                day_of_week: z.number(),
                send_time: z.string(),
                timezone: z.string(),
                last_sent_at: z.string().nullable(),
                created_at: z.string(),
                updated_at: z.string(),
              }),
            }),
          },
        },
      },
      "400": { description: "Invalid request" },
      "401": { description: "Unauthorized" },
    },
  };

  async handle(c: AppContext) {
    const user = c.get("user");
    const authToken = c.get("authToken");
    const supabase = supabaseApiClient(authToken, c);
    const body = await c.req.json();

    if (body.timezone !== undefined && !isValidTimeZone(body.timezone)) {
      throw new HTTPException(400, { message: `Invalid IANA timezone: ${body.timezone}` });
    }

    // Normalise HH:MM → HH:MM:00 so Postgres TIME round-trips cleanly.
    const sendTime =
      body.send_time !== undefined
        ? body.send_time.length === 5
          ? `${body.send_time}:00`
          : body.send_time
        : undefined;

    const { data, error } = await supabase
      .from("digest_preferences")
      .upsert(
        {
          user_id: user.id,
          ...(body.enabled !== undefined && { enabled: body.enabled }),
          ...(body.day_of_week !== undefined && { day_of_week: body.day_of_week }),
          ...(sendTime !== undefined && { send_time: sendTime }),
          ...(body.timezone !== undefined && { timezone: body.timezone }),
        },
        { onConflict: "user_id" },
      )
      .select()
      .single();

    if (error) {
      console.error("Error upserting digest preferences:", error);
      throw new HTTPException(500, { message: "Failed to update digest preferences" });
    }

    return c.json({ data });
  }
}

function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
