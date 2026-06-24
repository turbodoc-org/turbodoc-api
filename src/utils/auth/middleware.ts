import { supabaseAdminClient } from "../clients/supabase/admin";
import { AppContext } from "../../types/app-context";
import { HTTPException } from "hono/http-exception";
import { createMiddleware } from "hono/factory";
import {
  decodeJwtClaims,
  mcpResourceUrl,
  supabaseAuthIssuer,
  tokenAudienceMatchesResource,
} from "./oauth";

const authenticateSupabaseToken = async (context: AppContext) => {
  console.log("Checking authentication token...");
  const authHeader = context.req.header("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new HTTPException(401, {
      message: "Invalid authorization header.",
    });
  }

  const token = authHeader.replace("Bearer ", "");
  const { data, error } = await supabaseAdminClient(context).auth.getUser(token);
  if (error || !data) {
    throw new HTTPException(401, { message: "Unauthorized." });
  }

  console.log("Authentication token verified successfully.");
  context.set("user", data.user);
  context.set("authToken", token);

  return { token };
};

export const requireAuth = createMiddleware(async (context: AppContext, next) => {
  try {
    await authenticateSupabaseToken(context);
    await next();
  } catch (error) {
    console.error("Error in auth middleware:", error);
    if (error instanceof HTTPException) {
      throw error;
    }
    throw new HTTPException(500, { message: "Internal server error." });
  }
});

export const requireMcpAuth = createMiddleware(async (context: AppContext, next) => {
  try {
    const { token } = await authenticateSupabaseToken(context);
    const claims = decodeJwtClaims(token);

    if (!claims) {
      throw new HTTPException(401, { message: "Invalid access token claims." });
    }

    if (claims.iss !== supabaseAuthIssuer(context)) {
      throw new HTTPException(401, { message: "Access token issuer is not trusted." });
    }

    if (!claims.client_id || typeof claims.client_id !== "string") {
      throw new HTTPException(401, {
        message: "MCP access requires a Supabase OAuth 2.1 access token.",
      });
    }

    const resource = mcpResourceUrl(context);
    if (claims.aud !== "authenticated" && !tokenAudienceMatchesResource(claims.aud, resource)) {
      throw new HTTPException(401, {
        message: "Access token audience is not valid for this MCP resource.",
      });
    }

    await next();
  } catch (error) {
    console.error("Error in MCP auth middleware:", error);
    if (error instanceof HTTPException) {
      throw error;
    }
    throw new HTTPException(500, { message: "Internal server error." });
  }
});
