import { type Context } from "hono";
import { User } from "@supabase/supabase-js";

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
  };
}>;
