import { createClient } from "@supabase/supabase-js";
import { AppContext } from "../../../types/app-context";
import { Database } from "../../../types/database.types";

export const supabaseAdminClient = (c: AppContext) =>
  createClient<Database>(c.env.SUPABASE_URL, c.env.SUPABASE_SECRET_KEY);
