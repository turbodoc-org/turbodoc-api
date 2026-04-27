import { type Context } from "hono";
import { User } from "@supabase/supabase-js";

export type AppContext = Context<{
  Bindings: Cloudflare.Env;
  Variables: {
    user: User;
    authToken: string;
  };
}>;
