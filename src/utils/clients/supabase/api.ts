import { createClient } from "@supabase/supabase-js";
import type { AppContext } from "../../../types/app-context";
import type { Database } from "../../../types/database.types";

export const supabaseApiClient = (authToken: string, c: AppContext) => {
  const supabaseKey =
    authToken === c.env.SUPABASE_SECRET_KEY
      ? c.env.SUPABASE_SECRET_KEY
      : c.env.SUPABASE_PUBLISHABLE_KEY;

  return createClient<Database>(c.env.SUPABASE_URL, supabaseKey, {
    global: {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    },
  });
};
