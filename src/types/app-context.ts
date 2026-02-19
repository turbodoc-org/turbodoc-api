import type { User } from "@supabase/supabase-js";
import type { Context } from "hono";

export type Env = {
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
  SUPABASE_SECRET_KEY: string;
  RESEND_API_KEY?: string;
  CONTACT_EMAIL?: string;
};

export type AppContext = Context<{
  Bindings: Env;
  Variables: {
    user: User;
    authToken: string;
    authType: "jwt" | "pat";
  };
}>;
