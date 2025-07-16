import { supabaseAdminClient } from "../clients/supabase/admin";
import { AppContext } from "../../types/app-context";
import { HTTPException } from "hono/http-exception";
import { createMiddleware } from "hono/factory";

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

      const token = authHeader.replace("Bearer ", "");
      const { data, error } =
        await supabaseAdminClient(context).auth.getUser(token);
      if (error || !data) {
        throw new HTTPException(401, { message: "Unauthorized." });
      }

      console.log("Authentication token verified successfully.");
      context.set("user", data.user);
      context.set("authToken", token);
      await next();
    } catch (error) {
      console.error("Error in auth middleware:", error);
      throw new HTTPException(500, { message: "Internal server error." });
    }
  },
);
