import type { OAuthProtectedResourceMetadata } from "@modelcontextprotocol/sdk/shared/auth.js";

type McpOAuthEnv = {
  SUPABASE_URL: string;
  MCP_RESOURCE_DOCUMENTATION_URL?: string;
};

type OAuthContext = {
  env: McpOAuthEnv;
  req: {
    url: string;
  };
};

export type JwtAudience = string | string[] | undefined;

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, "");

export const supabaseAuthIssuer = (c: OAuthContext) =>
  `${trimTrailingSlash(c.env.SUPABASE_URL)}/auth/v1`;

export const mcpAuthorizationServerIssuer = (c: OAuthContext) => supabaseAuthIssuer(c);

export const mcpResourceUrl = (c: OAuthContext) => {
  const url = new URL(c.req.url);
  return `${url.origin}/mcp`;
};

export const protectedResourceMetadataUrl = (c: OAuthContext, resourcePath = "/mcp") => {
  const url = new URL(c.req.url);
  const normalizedPath = resourcePath.startsWith("/") ? resourcePath : `/${resourcePath}`;
  return `${url.origin}/.well-known/oauth-protected-resource${normalizedPath}`;
};

export const protectedResourceMetadata = (
  c: OAuthContext,
  resourcePath = "/mcp",
): OAuthProtectedResourceMetadata => {
  const url = new URL(c.req.url);
  const normalizedPath = resourcePath.startsWith("/") ? resourcePath : `/${resourcePath}`;
  const resource = `${url.origin}${normalizedPath}`;

  return {
    resource,
    resource_name: "Turbodoc MCP API",
    authorization_servers: [mcpAuthorizationServerIssuer(c)],
    scopes_supported: ["openid", "email", "profile"],
    bearer_methods_supported: ["header"],
    resource_documentation: c.env.MCP_RESOURCE_DOCUMENTATION_URL ?? "https://turbodoc.ai",
  };
};

export const oauthAuthenticateHeader = (c: OAuthContext, resourcePath = "/mcp") =>
  `Bearer resource_metadata="${protectedResourceMetadataUrl(c, resourcePath)}"`;

export const tokenAudienceMatchesResource = (audience: JwtAudience, resource: string) => {
  if (Array.isArray(audience)) return audience.includes(resource);
  return audience === resource;
};
