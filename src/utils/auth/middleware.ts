import type { User } from "@supabase/supabase-js";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import type { AppContext } from "../../types/app-context";
import { supabaseAdminClient } from "../clients/supabase/admin";
import { hashPatToken, isPatToken } from "./pats";

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
      let user: User;
      let authType: "jwt" | "pat" = "jwt";

      if (isPatToken(token)) {
        authType = "pat";
        const tokenHash = await hashPatToken(token);
        const { data: pat, error: patError } = await supabaseAdminClient(
          context,
        )
          .from("personal_access_tokens")
          .select("id, user_id, revoked_at")
          .eq("token_hash", tokenHash)
          .maybeSingle();

        if (patError || !pat) {
          throw new HTTPException(401, { message: "Unauthorized." });
        }

        if (pat.revoked_at) {
          throw new HTTPException(403, { message: "Token revoked." });
        }

        const { data: userData, error: userError } = await supabaseAdminClient(
          context,
        ).auth.getUserById(pat.user_id);

        if (userError || !userData?.user) {
          throw new HTTPException(401, { message: "Unauthorized." });
        }

        user = userData.user;

        try {
          const { error: updateError } = await supabaseAdminClient(context)
            .from("personal_access_tokens")
            .update({ last_used_at: new Date().toISOString() })
            .eq("id", pat.id);

          if (updateError) {
            console.error("Error updating PAT last_used_at:", updateError);
          }
        } catch (updateError) {
          console.error("Error updating PAT last_used_at:", updateError);
        }
      } else {
        const { data, error } =
          await supabaseAdminClient(context).auth.getUser(token);
        if (error || !data?.user) {
          throw new HTTPException(401, { message: "Unauthorized." });
        }
        user = data.user;
      }

      console.log("Authentication token verified successfully.");
      context.set("user", user);
      context.set("authToken", token);
      context.set("authType", authType);
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
