type OAuthContext = {
  env: Cloudflare.Env;
  req: {
    url: string;
  };
};

export type JwtClaims = {
  aud?: string | string[];
  client_id?: string;
  exp?: number;
  iss?: string;
  [claim: string]: unknown;
};

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, "");

const base64UrlDecode = (value: string) => {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  return atob(padded);
};

export const decodeJwtClaims = (token: string): JwtClaims | null => {
  const [, payload] = token.split(".");
  if (!payload) return null;

  try {
    return JSON.parse(base64UrlDecode(payload)) as JwtClaims;
  } catch {
    return null;
  }
};

export const supabaseAuthIssuer = (c: OAuthContext) =>
  `${trimTrailingSlash(c.env.SUPABASE_URL)}/auth/v1`;

export const mcpResourceUrl = (c: OAuthContext) => {
  const url = new URL(c.req.url);
  return `${url.origin}/mcp`;
};

export const protectedResourceMetadataUrl = (c: OAuthContext, resourcePath = "/mcp") => {
  const url = new URL(c.req.url);
  const normalizedPath = resourcePath.startsWith("/") ? resourcePath : `/${resourcePath}`;
  return `${url.origin}/.well-known/oauth-protected-resource${normalizedPath}`;
};

export const protectedResourceMetadata = (c: OAuthContext, resourcePath = "/mcp") => {
  const url = new URL(c.req.url);
  const normalizedPath = resourcePath.startsWith("/") ? resourcePath : `/${resourcePath}`;
  const resource = `${url.origin}${normalizedPath}`;

  return {
    resource,
    resource_name: "Turbodoc MCP API",
    authorization_servers: [supabaseAuthIssuer(c)],
    scopes_supported: ["openid", "email", "profile"],
    bearer_methods_supported: ["header"],
    resource_documentation: "https://turbodoc.ai",
  };
};

export const oauthAuthenticateHeader = (c: OAuthContext, resourcePath = "/mcp") =>
  `Bearer resource_metadata="${protectedResourceMetadataUrl(c, resourcePath)}"`;

export const tokenAudienceMatchesResource = (audience: JwtClaims["aud"], resource: string) => {
  if (Array.isArray(audience)) return audience.includes(resource);
  return audience === resource;
};
