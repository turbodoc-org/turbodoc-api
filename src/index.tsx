import { Hono } from "hono";
import { cors } from "hono/cors";
import { fromHono } from "chanfana";
import { requireAuth, requireMcpAuth } from "./utils/auth/middleware";
import { HTTPException } from "hono/http-exception";
import { GetBookmarks } from "./endpoints/v1/bookmarks/getBookmarks";
import { CreateBookmark } from "./endpoints/v1/bookmarks/createBookmark";
import { UpdateBookmark } from "./endpoints/v1/bookmarks/updateBookmark";
import { DeleteBookmark } from "./endpoints/v1/bookmarks/deleteBookmark";
import { GetOgImage } from "./endpoints/v1/bookmarks/getOgImage";
import { SearchBookmarks } from "./endpoints/v1/bookmarks/searchBookmarks";
import { BatchBookmarks } from "./endpoints/v1/bookmarks/batchBookmarks";
import { GetNotes } from "./endpoints/v1/notes/getNotes";
import { GetNote } from "./endpoints/v1/notes/getNote";
import { CreateNote } from "./endpoints/v1/notes/createNote";
import { UpdateNote } from "./endpoints/v1/notes/updateNote";
import { DeleteNote } from "./endpoints/v1/notes/deleteNote";
import { BatchNotes } from "./endpoints/v1/notes/batchNotes";
import { GetTags } from "./endpoints/v1/tags/getTags";
import { GetCodeSnippets } from "./endpoints/v1/code-snippets/getCodeSnippets";
import { CreateCodeSnippet } from "./endpoints/v1/code-snippets/createCodeSnippet";
import { UpdateCodeSnippet } from "./endpoints/v1/code-snippets/updateCodeSnippet";
import { DeleteCodeSnippet } from "./endpoints/v1/code-snippets/deleteCodeSnippet";
import { GetDiagrams } from "./endpoints/v1/diagrams/getDiagrams";
import { GetDiagram } from "./endpoints/v1/diagrams/getDiagram";
import { CreateDiagram } from "./endpoints/v1/diagrams/createDiagram";
import { UpdateDiagram } from "./endpoints/v1/diagrams/updateDiagram";
import { DeleteDiagram } from "./endpoints/v1/diagrams/deleteDiagram";
import { DuplicateDiagram } from "./endpoints/v1/diagrams/duplicateDiagram";
import { SendContactEmail } from "./endpoints/v1/contact/sendContactEmail";
import { GetDigestPreferences } from "./endpoints/v1/digest/getDigestPreferences";
import { UpdateDigestPreferences } from "./endpoints/v1/digest/updateDigestPreferences";
import { sendDueDigests } from "./scheduled/send-digests";
import { BookmarkWorkflow } from "./workflows/bookmark-workflow";
import { handleMcpRequest } from "./mcp/server";
import {
  handleOAuthAuthorize,
  handleOAuthToken,
  registerOAuthClient,
} from "./utils/auth/mcp-oauth";
import {
  authorizationServerMetadata,
  oauthAuthenticateHeader,
  protectedResourceMetadata,
} from "./utils/auth/oauth";
import type { AppEnv } from "./types/app-context";

export { BookmarkWorkflow };

// Start a Hono app
const app = new Hono<AppEnv>();

// Setup CORS middleware
app.use(
  "*",
  cors({
    origin: (origin) => {
      // Allow requests from iOS app (no origin header)
      if (!origin) return null;

      const allowedOrigins = [
        "https://turbodoc.ai", // Production domain
        "https://www.turbodoc.ai", // WWW subdomain
      ];

      return origin && allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
    },
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: [
      "Content-Type",
      "Authorization",
      "token",
      "Baggage",
      "sentry-trace",
      "Accept",
      "X-Requested-With",
      "MCP-Protocol-Version",
      "Mcp-Session-Id",
    ],
    exposeHeaders: ["WWW-Authenticate", "MCP-Protocol-Version", "Mcp-Session-Id"],
    credentials: true,
  }),
);

// Setup OpenAPI registry
const openapi = fromHono(app, {
  docs_url: "/",
  openapi_url: "/swagger.json",
  schema: {
    info: {
      title: "Turbodoc API",
      version: "1.0.0",
      description: "API for Turbodoc bookmark management application",
    },
  },
});

app.onError((e, c) => {
  // TODO: refine error handling
  console.error("Error in Hono:", JSON.stringify(e));
  if (e instanceof HTTPException && e.status < 500) {
    if (e.status === 401 && c.req.path.startsWith("/mcp")) {
      c.header("WWW-Authenticate", oauthAuthenticateHeader(c, "/mcp"));
    }

    return c.json(
      {
        status: e.status,
        message: e.message,
      },
      { status: e.status },
    );
  }

  return c.json(
    {
      status: 500,
      message: "Internal server error",
    },
    { status: 500 },
  );
});

// Public routes (no auth required)
openapi.post("/v1/contact", SendContactEmail);

// OAuth 2.0 Protected Resource Metadata (RFC 9728) for MCP clients.
app.get("/.well-known/oauth-protected-resource", (c) => c.json(protectedResourceMetadata(c, "")));
app.get("/.well-known/oauth-protected-resource/mcp", (c) =>
  c.json(protectedResourceMetadata(c, "/mcp")),
);

// OAuth 2.0 Authorization Server Metadata (RFC 8414) for MCP clients.
app.get("/.well-known/oauth-authorization-server", (c) => c.json(authorizationServerMetadata(c)));
app.get("/.well-known/openid-configuration", (c) => c.json(authorizationServerMetadata(c)));
app.post("/oauth/register", async (c) => {
  const metadata = await c.req.json().catch(() => ({}));
  return c.json(await registerOAuthClient(c, metadata), 201);
});
app.get("/oauth/authorize", handleOAuthAuthorize);
app.post("/oauth/token", handleOAuthToken);

// Register MCP endpoint with OAuth-specific token validation.
app.post("/mcp", requireMcpAuth, handleMcpRequest);
app.get("/mcp", (c) => c.text("SSE stream is not supported by this MCP endpoint", 405));

// Apply auth middleware to all routes
app.use("*", requireAuth);

// Register bookmark endpoints
openapi.get("/v1/bookmarks", GetBookmarks);
openapi.get("/v1/bookmarks/search", SearchBookmarks);
openapi.post("/v1/bookmarks", CreateBookmark);
openapi.post("/v1/bookmarks/batch", BatchBookmarks);
openapi.put("/v1/bookmarks/:id", UpdateBookmark);
openapi.delete("/v1/bookmarks/:id", DeleteBookmark);
openapi.get("/v1/bookmarks/og-image", GetOgImage);

// Register notes endpoints
openapi.get("/v1/notes", GetNotes);
openapi.get("/v1/notes/:id", GetNote);
openapi.post("/v1/notes", CreateNote);
openapi.post("/v1/notes/batch", BatchNotes);
openapi.put("/v1/notes/:id", UpdateNote);
openapi.delete("/v1/notes/:id", DeleteNote);

// Register tags endpoints
openapi.get("/v1/tags", GetTags);

// Register code snippets endpoints
openapi.get("/v1/code-snippets", GetCodeSnippets);
openapi.post("/v1/code-snippets", CreateCodeSnippet);
openapi.put("/v1/code-snippets/:id", UpdateCodeSnippet);
openapi.delete("/v1/code-snippets/:id", DeleteCodeSnippet);

// Register diagram endpoints
openapi.get("/v1/diagrams", GetDiagrams);
openapi.get("/v1/diagrams/:id", GetDiagram);
openapi.post("/v1/diagrams", CreateDiagram);
openapi.put("/v1/diagrams/:id", UpdateDiagram);
openapi.delete("/v1/diagrams/:id", DeleteDiagram);
openapi.post("/v1/diagrams/:id/duplicate", DuplicateDiagram);

// Register digest endpoints
openapi.get("/v1/digest/preferences", GetDigestPreferences);
openapi.put("/v1/digest/preferences", UpdateDigestPreferences);
// Export the Worker with fetch + scheduled handlers. Workflow class is exported
// above as a named export so Wrangler can find it via class_name.
export default {
  fetch: app.fetch,
  async scheduled(controller: ScheduledController, env: Cloudflare.Env, ctx: ExecutionContext) {
    ctx.waitUntil(sendDueDigests(env));
  },
} satisfies ExportedHandler<Cloudflare.Env>;
