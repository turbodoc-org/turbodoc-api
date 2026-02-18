import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import type { AppContext } from "../../types/app-context";
import { supabaseAdminClient } from "../clients/supabase/admin";
import { hashToken, PAT_PREFIX } from "./pat";

export const requireAuth = createMiddleware(
  async (context: AppContext, next) => {
    try {
      console.log("Checking authentication token...");
      const authHeader = context.req.header("Authorization");
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        throw new HTTPException(401, {
          message: "Invalid authorization header.",
        });
      }

      const token = authHeader.replace("Bearer ", "").trim();
      if (!token) {
        throw new HTTPException(401, { message: "Unauthorized." });
      }

      const adminClient = supabaseAdminClient(context);

      if (token.startsWith(PAT_PREFIX)) {
        const tokenHash = await hashToken(token);
        const { data: pat, error: patError } = await adminClient
          .from("personal_access_tokens")
          .select("id,user_id,revoked_at")
          .eq("token_hash", tokenHash)
          .is("revoked_at", null)
          .single();

        if (patError || !pat) {
          throw new HTTPException(401, { message: "Unauthorized." });
        }

        const { data: userData, error: userError } =
          await adminClient.auth.admin.getUserById(pat.user_id);

        if (userError || !userData?.user) {
          throw new HTTPException(401, { message: "Unauthorized." });
        }

        await adminClient
          .from("personal_access_tokens")
          .update({ last_used_at: new Date().toISOString() })
          .eq("id", pat.id);

        console.log("PAT verified successfully.");
        context.set("user", userData.user);
        context.set("authToken", context.env.SUPABASE_SECRET_KEY);
        await next();
        return;
      }

      const { data, error } = await adminClient.auth.getUser(token);
      if (error || !data?.user) {
        throw new HTTPException(401, { message: "Unauthorized." });
      }

      console.log("Authentication token verified successfully.");
      context.set("user", data.user);
      context.set("authToken", token);
      await next();
    } catch (error) {
      console.error("Error in auth middleware:", error);
      if (error instanceof HTTPException) {
        throw error;
      }
      throw new HTTPException(500, { message: "Internal server error." });
    }
  },
);
