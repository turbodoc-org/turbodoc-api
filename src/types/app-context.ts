import { type Context } from "hono";
import { User } from "@supabase/supabase-js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";

export type AppEnv = {
  Bindings: Cloudflare.Env;
  Variables: {
    user: User;
    authToken: string;
    mcpAuthInfo: AuthInfo;
  };
};

export type AppContext = Context<AppEnv>;
