import type {
  OAuthClientInformationFull,
  OAuthClientMetadata,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { User } from "@supabase/supabase-js";
import { HTTPException } from "hono/http-exception";
import type { AppContext } from "../../types/app-context";
import { supabaseAdminClient } from "../clients/supabase/admin";
import { mcpResourceUrl } from "./oauth";

const AUTH_CODE_TTL_SECONDS = 10 * 60;
const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
const REFRESH_TOKEN_TTL_SECONDS = 90 * 24 * 60 * 60;
const DEFAULT_LOGIN_URL = "https://turbodoc.ai/auth/login";

type McpOAuthEnv = Cloudflare.Env & {
  MCP_OAUTH_SIGNING_SECRET?: string;
  TURBODOC_WEB_URL?: string;
};

type TokenType = "client" | "code" | "access" | "refresh";

type SignedPayload = {
  type: TokenType;
  client_id?: string;
  code_challenge?: string;
  exp?: number;
  iat?: number;
  redirect_uri?: string;
  redirect_uris?: string[];
  resource?: string;
  scope?: string;
  user_id?: string;
};

type PayloadOf<T extends TokenType> = SignedPayload & { type: T };

const oauthEnv = (c: AppContext) => c.env as McpOAuthEnv;

const base64UrlEncode = (bytes: ArrayBuffer | Uint8Array) => {
  const values = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (const byte of values) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const base64UrlDecode = (value: string) => {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
};

const sha256 = async (value: string) => {
  const bytes = new TextEncoder().encode(value);
  return base64UrlEncode(await crypto.subtle.digest("SHA-256", bytes));
};

const nowSeconds = () => Math.floor(Date.now() / 1000);

const signingSecret = (c: AppContext) => {
  const env = oauthEnv(c);
  return env.MCP_OAUTH_SIGNING_SECRET ?? c.env.SUPABASE_SECRET_KEY;
};

const signingKey = async (c: AppContext) =>
  await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(signingSecret(c)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );

const signPayload = async (c: AppContext, payload: SignedPayload) => {
  const encodedPayload = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign(
    "HMAC",
    await signingKey(c),
    new TextEncoder().encode(encodedPayload),
  );

  return `${encodedPayload}.${base64UrlEncode(signature)}`;
};

const verifyPayload = async <T extends SignedPayload["type"]>(
  c: AppContext,
  token: string,
  type: T,
): Promise<PayloadOf<T> | null> => {
  const [encodedPayload, encodedSignature] = token.split(".");
  if (!encodedPayload || !encodedSignature) return null;

  const isValid = await crypto.subtle.verify(
    "HMAC",
    await signingKey(c),
    base64UrlDecode(encodedSignature),
    new TextEncoder().encode(encodedPayload),
  );

  if (!isValid) return null;

  try {
    const payload = JSON.parse(
      new TextDecoder().decode(base64UrlDecode(encodedPayload)),
    ) as SignedPayload;

    if (payload.type !== type) return null;
    if (typeof payload.exp === "number" && payload.exp <= nowSeconds()) return null;

    return payload as PayloadOf<T>;
  } catch {
    return null;
  }
};

const webLoginUrl = (c: AppContext) => {
  const configured = oauthEnv(c).TURBODOC_WEB_URL?.replace(/\/+$/, "");
  return configured ? `${configured}/auth/login` : DEFAULT_LOGIN_URL;
};

const wantsJson = (c: AppContext) =>
  c.req.header("Accept")?.includes("application/json") ||
  c.req.header("X-Requested-With") === "fetch";

const bearerToken = (c: AppContext) => {
  const header = c.req.header("Authorization");
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length);
};

const formOrJsonBody = async (c: AppContext) => {
  const contentType = c.req.header("Content-Type") ?? "";
  if (contentType.includes("application/json")) return await c.req.json<Record<string, string>>();

  const body = await c.req.text();
  return Object.fromEntries(new URLSearchParams(body));
};

const verifySupabaseUser = async (c: AppContext, token: string): Promise<User> => {
  const { data, error } = await supabaseAdminClient(c).auth.getUser(token);
  if (error || !data.user) throw new HTTPException(401, { message: "Unauthorized." });
  return data.user;
};

const requiredValue = (values: URLSearchParams | Record<string, string>, key: string) => {
  const value = values instanceof URLSearchParams ? values.get(key) : values[key];
  if (!value) throw new HTTPException(400, { message: `Missing OAuth parameter: ${key}.` });
  return value;
};

const validateAuthorizeParams = (params: URLSearchParams) => {
  if (params.get("response_type") !== "code") {
    throw new HTTPException(400, { message: "Unsupported OAuth response_type." });
  }

  for (const key of ["client_id", "redirect_uri", "code_challenge"]) requiredValue(params, key);

  const method = params.get("code_challenge_method") ?? "plain";
  if (method !== "S256") {
    throw new HTTPException(400, { message: "Only S256 PKCE is supported." });
  }
};

const verifiedClient = async (c: AppContext, id: string, redirectUri: string) => {
  const client = await verifyPayload(c, id, "client");
  if (!client?.redirect_uris?.length) {
    throw new HTTPException(400, { message: "Unknown OAuth client_id." });
  }

  if (!client.redirect_uris.includes(redirectUri)) {
    throw new HTTPException(400, { message: "OAuth redirect_uri is not registered." });
  }

  return client;
};

export const registerOAuthClient = async (
  c: AppContext,
  metadata: Partial<OAuthClientMetadata>,
): Promise<OAuthClientInformationFull> => {
  const redirectUris = metadata.redirect_uris ?? [];
  if (!redirectUris.length) {
    throw new HTTPException(400, { message: "OAuth client registration requires redirect_uris." });
  }

  const clientName = metadata.client_name ?? "Turbodoc MCP Client";
  const scope = metadata.scope ?? "openid email profile";
  const clientId = await signPayload(c, {
    type: "client",
    redirect_uris: redirectUris,
    scope,
    iat: nowSeconds(),
  });

  return {
    redirect_uris: redirectUris,
    token_endpoint_auth_method: "none",
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    client_name: clientName,
    client_uri: metadata.client_uri,
    logo_uri: metadata.logo_uri,
    scope,
    contacts: metadata.contacts,
    tos_uri: metadata.tos_uri,
    policy_uri: metadata.policy_uri,
    jwks_uri: metadata.jwks_uri,
    jwks: metadata.jwks,
    software_id: metadata.software_id,
    software_version: metadata.software_version,
    software_statement: metadata.software_statement,
    client_id: clientId,
    client_id_issued_at: nowSeconds(),
  };
};

export const handleOAuthAuthorize = async (c: AppContext) => {
  const requestUrl = new URL(c.req.url);
  const params = requestUrl.searchParams;
  validateAuthorizeParams(params);

  const clientId = requiredValue(params, "client_id");
  const redirectUri = requiredValue(params, "redirect_uri");
  const client = await verifiedClient(c, clientId, redirectUri);

  const token = bearerToken(c);
  if (!token) {
    const loginUrl = new URL(webLoginUrl(c));
    loginUrl.searchParams.set("redirect", requestUrl.toString());
    return c.redirect(loginUrl.toString(), 302);
  }

  const user = await verifySupabaseUser(c, token);
  const scope = params.get("scope") ?? client.scope ?? "openid email profile";
  const resource = params.get("resource") ?? mcpResourceUrl(c);
  const code = await signPayload(c, {
    type: "code",
    user_id: user.id,
    client_id: clientId,
    redirect_uri: redirectUri,
    code_challenge: requiredValue(params, "code_challenge"),
    resource,
    scope,
    exp: nowSeconds() + AUTH_CODE_TTL_SECONDS,
  });

  const redirectUrl = new URL(redirectUri);
  redirectUrl.searchParams.set("code", code);

  const state = params.get("state");
  if (state) redirectUrl.searchParams.set("state", state);

  if (wantsJson(c)) return c.json({ redirect_to: redirectUrl.toString() });
  return c.redirect(redirectUrl.toString(), 302);
};

const issueTokens = async (
  c: AppContext,
  values: {
    userId: string;
    clientId: string;
    scope: string;
    resource: string;
  },
) => ({
  access_token: await signPayload(c, {
    type: "access",
    user_id: values.userId,
    client_id: values.clientId,
    resource: values.resource,
    scope: values.scope,
    exp: nowSeconds() + ACCESS_TOKEN_TTL_SECONDS,
  }),
  refresh_token: await signPayload(c, {
    type: "refresh",
    user_id: values.userId,
    client_id: values.clientId,
    resource: values.resource,
    scope: values.scope,
    exp: nowSeconds() + REFRESH_TOKEN_TTL_SECONDS,
  }),
  token_type: "Bearer",
  expires_in: ACCESS_TOKEN_TTL_SECONDS,
  scope: values.scope,
});

const exchangeAuthorizationCode = async (c: AppContext, body: Record<string, string>) => {
  const codeToken = requiredValue(body, "code");
  const clientId = requiredValue(body, "client_id");
  const redirectUri = requiredValue(body, "redirect_uri");
  const codeVerifier = requiredValue(body, "code_verifier");
  const code = await verifyPayload(c, codeToken, "code");

  if (!code?.user_id || !code.client_id || !code.redirect_uri || !code.code_challenge) {
    throw new HTTPException(400, { message: "Invalid OAuth authorization code." });
  }

  if (code.client_id !== clientId || code.redirect_uri !== redirectUri) {
    throw new HTTPException(400, { message: "OAuth authorization code request does not match." });
  }

  if ((await sha256(codeVerifier)) !== code.code_challenge) {
    throw new HTTPException(400, { message: "Invalid OAuth PKCE verifier." });
  }

  return await issueTokens(c, {
    userId: code.user_id,
    clientId: code.client_id,
    scope: code.scope ?? "openid email profile",
    resource: code.resource ?? mcpResourceUrl(c),
  });
};

const exchangeRefreshToken = async (c: AppContext, body: Record<string, string>) => {
  const refreshToken = await verifyPayload(c, requiredValue(body, "refresh_token"), "refresh");
  if (!refreshToken?.user_id || !refreshToken.client_id) {
    throw new HTTPException(400, { message: "Invalid OAuth refresh token." });
  }

  return await issueTokens(c, {
    userId: refreshToken.user_id,
    clientId: refreshToken.client_id,
    scope: refreshToken.scope ?? "openid email profile",
    resource: refreshToken.resource ?? mcpResourceUrl(c),
  });
};

export const handleOAuthToken = async (c: AppContext) => {
  const body = await formOrJsonBody(c);

  if (body.grant_type === "authorization_code")
    return c.json(await exchangeAuthorizationCode(c, body));
  if (body.grant_type === "refresh_token") return c.json(await exchangeRefreshToken(c, body));

  throw new HTTPException(400, { message: "Unsupported OAuth grant_type." });
};

export const verifyMcpAccessToken = async (
  c: AppContext,
  token: string,
): Promise<AuthInfo | null> => {
  const accessToken = await verifyPayload(c, token, "access");
  if (!accessToken?.user_id || !accessToken.client_id || !accessToken.exp) return null;

  c.set("user", { id: accessToken.user_id } as User);
  c.set("authToken", token);

  return {
    token,
    clientId: accessToken.client_id,
    scopes: accessToken.scope?.split(" ").filter(Boolean) ?? [],
    expiresAt: accessToken.exp,
    resource: new URL(accessToken.resource ?? mcpResourceUrl(c)),
    extra: { tokenType: "mcp-oauth", userId: accessToken.user_id },
  };
};
