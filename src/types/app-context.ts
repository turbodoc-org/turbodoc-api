import { type Context } from "hono";
import { User } from "@supabase/supabase-js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";

export type AppContext = Context<{
  Bindings: Cloudflare.Env;
  Variables: {
    user: User;
    authToken: string;
    mcpAuthInfo: AuthInfo;
  };
}>;
