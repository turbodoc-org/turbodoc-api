import type { Context } from "hono";
import {
  digestSubject,
  renderDigestEmail,
  renderDigestText,
  type DigestEmailProps,
} from "./digest-email-template";

// Dev-only preview of the weekly digest email. Guarded by hostname so it is
// never reachable on api.turbodoc.ai.
//
//   GET /dev/digest-preview                 -> full sample (all sections)
//   GET /dev/digest-preview?variant=light   -> few items, no summaries
//   GET /dev/digest-preview?variant=notes-only
//   GET /dev/digest-preview?variant=overflow -> 12 bookmarks ("+N more" row)
//   GET /dev/digest-preview?format=text     -> plain-text alternative
//   GET /dev/digest-preview?format=json     -> subject line + fixture

const ALLOWED_HOSTS = new Set(["localhost", "127.0.0.1", "api-dev.turbodoc.ai"]);

const NOW = () => new Date();
const WEEK_AGO = () => new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

function fullSample(): DigestEmailProps {
  return {
    bookmarks: [
      {
        title: "Designing Data-Intensive Applications — Chapter Notes",
        url: "https://dataintensive.net/chapters",
        summary:
          "A deep dive into replication, partitioning, and consistency trade-offs. Covers leader-based replication, quorum reads and writes, and why exactly-once semantics are so hard.",
        tags: "distributed-systems|books|engineering",
      },
      {
        title: "The Model Context Protocol specification",
        url: "https://modelcontextprotocol.io/specification",
        summary: "Official spec for MCP: transports, tools, resources, prompts, and auth.",
        tags: "mcp|ai",
      },
      {
        title: "Postgres full-text search in 5 minutes",
        url: "https://www.crunchydata.com/blog/postgres-full-text-search",
        summary: null,
        tags: "postgres",
      },
      {
        title: "Escaping test <script>alert('x')</script> & \"quotes\"",
        url: "https://example.com/pricing?a=1&b=2",
        summary: 'Summary with <tags> & "quotes" — must render as literal text.',
        tags: null,
      },
    ],
    notes: [{ title: "Q3 planning — infra priorities" }, { title: "Ideas for diagram editor v2" }],
    snippetCount: 2,
    diagramCount: 1,
    unreadCount: 12,
    weekStart: WEEK_AGO(),
    weekEnd: NOW(),
  };
}

const VARIANTS: Record<string, () => DigestEmailProps> = {
  full: fullSample,
  light: () => ({
    ...fullSample(),
    bookmarks: fullSample().bookmarks.slice(2, 3),
    notes: [],
    snippetCount: 0,
    diagramCount: 0,
    unreadCount: 0,
  }),
  "notes-only": () => ({
    ...fullSample(),
    bookmarks: [],
    snippetCount: 0,
    diagramCount: 0,
  }),
  overflow: () => ({
    ...fullSample(),
    bookmarks: Array.from({ length: 12 }, (_, i) => ({
      title: `Sample bookmark #${i + 1} — a reasonably long title to exercise wrapping`,
      url: `https://example.com/articles/${i + 1}`,
      summary: i % 2 === 0 ? "A short summary for this sample bookmark." : null,
      tags: i % 3 === 0 ? "sample|testing" : null,
    })),
  }),
};

export function handleDigestPreview(c: Context) {
  const host = new URL(c.req.url).hostname;
  if (!ALLOWED_HOSTS.has(host)) {
    return c.notFound();
  }

  const variantName = c.req.query("variant") ?? "full";
  const variant = VARIANTS[variantName];
  if (!variant) {
    return c.json(
      { error: `Unknown variant. Use one of: ${Object.keys(VARIANTS).join(", ")}` },
      400,
    );
  }
  const props = variant();

  const format = c.req.query("format") ?? "html";
  if (format === "text") return c.text(renderDigestText(props));
  if (format === "json") return c.json({ subject: digestSubject(props), props });
  return c.html(renderDigestEmail(props));
}
