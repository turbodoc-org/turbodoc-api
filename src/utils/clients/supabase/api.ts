import { createClient } from "@supabase/supabase-js";
import { AppContext } from "../../../types/app-context";
import { Database } from "../../../types/database.types";

export const supabaseApiClient = (authToken: string, c: AppContext) =>
  createClient<Database>(c.env.SUPABASE_URL, c.env.SUPABASE_PUBLISHABLE_KEY, {
    accessToken: async () => authToken,
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
