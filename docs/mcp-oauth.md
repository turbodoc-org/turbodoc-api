# MCP OAuth 2.1 Authentication

The `/mcp` endpoint is an OAuth 2.0 protected resource for remote MCP clients.
It uses Supabase Auth's OAuth 2.1 server for authorization code + PKCE,
dynamic client registration, token issuance, refresh token rotation, and user
consent.

## Discovery

Public protected-resource metadata endpoints:

- `/.well-known/oauth-protected-resource`
- `/.well-known/oauth-protected-resource/mcp`

Unauthorized MCP requests return a `WWW-Authenticate` challenge with the
protected resource metadata URL. MCP clients discover Supabase as the
authorization server from that metadata, then use Supabase's OAuth endpoints to
register, redirect the user, exchange the authorization code, and refresh
tokens.

## Production Supabase Auth Requirements

- Enable OAuth 2.1 Server in the Supabase project.
- Enable Dynamic Client Registration if MCP clients should self-register.
- Configure the Supabase OAuth authorization path to Turbodoc's consent UI.
- The consent UI must require the user to be logged in, show the requesting
  OAuth client, requested scopes, and approve or deny the authorization request
  with Supabase Auth.
- Keep `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and `SUPABASE_SECRET_KEY`
  configured for the Worker.

MCP access requires a Supabase OAuth access token with a `client_id` claim.
Normal first-party web or iOS Supabase session tokens continue to work for REST
API routes but are rejected by `/mcp`.

For stricter audience-bound MCP tokens, configure a Supabase custom access token
hook to set `aud` to the canonical MCP resource URL, for example
`https://api.turbodoc.ai/mcp`. The Worker accepts that audience and also accepts
Supabase's default `authenticated` audience for compatibility with Supabase's
default OAuth token shape.
