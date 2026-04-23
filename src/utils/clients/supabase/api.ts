import { createClient } from "@supabase/supabase-js";
import type { AppContext } from "../../../types/app-context";
import type { Database } from "../../../types/database.types";
import { isPatToken } from "../../auth/pats";
import { supabaseAdminClient } from "./admin";

export const supabaseApiClient = (authToken: string, c: AppContext) => {
  if (isPatToken(authToken)) {
    return supabaseAdminClient(c);
  }

  return createClient<Database>(
    c.env.SUPABASE_URL,
    c.env.SUPABASE_PUBLISHABLE_KEY,
    {
      global: {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      },
    },
  );
};
