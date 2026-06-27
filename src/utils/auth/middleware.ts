import { createClient, type JwtPayload, type SupabaseClient } from "@supabase/supabase-js";
import { AppContext } from "../../types/app-context";
import { HTTPException } from "hono/http-exception";
import { createMiddleware } from "hono/factory";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { mcpResourceUrl, supabaseAuthIssuer, tokenAudienceMatchesResource } from "./oauth";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const bearerToken = (context: AppContext) => {
  const authHeader = context.req.header("Authorization");
  const match = authHeader?.match(/^Bearer[ \t]+(.+)$/i);

  if (!match) {
    throw new HTTPException(401, {
      message: "Invalid authorization header.",
    });
  }

  const token = match[1].trim();
  if (!token) {
    throw new HTTPException(401, {
      message: "Invalid authorization header.",
    });
  }

  return token;
};

const supabaseAuthClient = (context: AppContext) =>
  createClient(context.env.SUPABASE_URL, context.env.SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

const verifySupabaseToken = async (
  context: AppContext,
  supabase: SupabaseClient,
  token: string,
): Promise<JwtPayload> => {
  const { data, error } = await supabase.auth.getClaims(token);
  const claims = data?.claims;

  if (
    error ||
    !claims?.sub ||
    !UUID_PATTERN.test(claims.sub) ||
    typeof claims.exp !== "number" ||
    claims.iss !== supabaseAuthIssuer(context)
  ) {
    throw new HTTPException(401, { message: "Unauthorized." });
  }

  return claims;
};

const authenticateSupabaseToken = async (context: AppContext) => {
  const token = bearerToken(context);
  const supabase = supabaseAuthClient(context);
  const [claims, userResult] = await Promise.all([
    verifySupabaseToken(context, supabase, token),
    supabase.auth.getUser(token),
  ]);

  if (userResult.error || !userResult.data.user || userResult.data.user.id !== claims.sub) {
    throw new HTTPException(401, { message: "Unauthorized." });
  }

  context.set("user", userResult.data.user);
  context.set("authToken", token);

  return { claims, token };
};

const mcpAuthInfo = (context: AppContext, token: string, claims: JwtPayload): AuthInfo => {
  if (!claims.client_id || typeof claims.client_id !== "string") {
    throw new HTTPException(401, {
      message: "MCP access requires a Supabase OAuth 2.1 access token.",
    });
  }

  const resource = mcpResourceUrl(context);
  const hasStandardAudience =
    claims.aud === "authenticated" ||
    (Array.isArray(claims.aud) && claims.aud.includes("authenticated"));

  if (!hasStandardAudience && !tokenAudienceMatchesResource(claims.aud, resource)) {
    throw new HTTPException(401, {
      message: "Access token audience is not valid for this MCP resource.",
    });
  }

  return {
    token,
    clientId: claims.client_id,
    scopes: typeof claims.scope === "string" ? claims.scope.split(" ").filter(Boolean) : [],
    expiresAt: claims.exp,
    resource: new URL(resource),
    extra: { userId: claims.sub },
  };
};

export const requireAuth = createMiddleware(async (context: AppContext, next) => {
  try {
    await authenticateSupabaseToken(context);
    await next();
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }
    console.error({
      event: "auth_error",
      message: error instanceof Error ? error.message : "Unknown authentication error",
    });
    throw new HTTPException(500, { message: "Internal server error." });
  }
});

export const requireMcpAuth = createMiddleware(async (context: AppContext, next) => {
  try {
    const { claims, token } = await authenticateSupabaseToken(context);

    context.set("mcpAuthInfo", mcpAuthInfo(context, token, claims));
    await next();
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }
    console.error({
      event: "mcp_auth_error",
      message: error instanceof Error ? error.message : "Unknown MCP authentication error",
    });
    throw new HTTPException(500, { message: "Internal server error." });
  }
});
