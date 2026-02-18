import { OpenAPIRoute } from "chanfana";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { AppContext } from "../../../types/app-context";
import { supabaseApiClient } from "../../../utils/clients/supabase/api";

type SearchResult = {
  type: "bookmarks" | "notes" | "diagrams" | "code-snippets";
  id: string;
  title: string;
  snippet: string | null;
  updated_at: string | null;
};

const normalizeTypes = (typesParam?: string) => {
  const allowed = new Map<string, SearchResult["type"]>([
    ["bookmarks", "bookmarks"],
    ["notes", "notes"],
    ["diagrams", "diagrams"],
    ["code-snippets", "code-snippets"],
    ["code_snippets", "code-snippets"],
  ]);

  if (!typesParam) {
    return ["bookmarks", "notes", "diagrams", "code-snippets"] as const;
  }

  const requested = typesParam
    .split(",")
    .map((type) => type.trim())
    .filter((type) => type.length > 0);

  const normalized: SearchResult["type"][] = [];
  for (const type of requested) {
    const mapped = allowed.get(type);
    if (!mapped) {
      throw new HTTPException(400, {
        message: `Invalid type '${type}'. Allowed: bookmarks, notes, diagrams, code-snippets`,
      });
    }
    if (!normalized.includes(mapped)) {
      normalized.push(mapped);
    }
  }

  return normalized;
};

const truncate = (value?: string | null, max = 200) => {
  if (!value) return "";
  if (value.length <= max) return value;
  return `${value.slice(0, max)}...`;
};

export class SearchAll extends OpenAPIRoute {
  static schema = {
    tags: ["Search"],
    summary:
      "Unified search across notes, bookmarks, diagrams, and code snippets",
    request: {
      query: z.object({
        q: z.string().min(1).describe("Search query"),
        types: z
          .string()
          .optional()
          .describe(
            "Comma-separated types: bookmarks, notes, diagrams, code-snippets",
          ),
      }),
    },
    responses: {
      "200": {
        description: "Search results retrieved successfully",
        content: {
          "application/json": {
            schema: z.object({
              data: z.array(
                z.object({
                  type: z.string(),
                  id: z.string(),
                  title: z.string(),
                  snippet: z.string().nullable(),
                  updated_at: z.string().nullable(),
                }),
              ),
            }),
          },
        },
      },
      "400": {
        description: "Bad request",
        content: {
          "application/json": {
            schema: z.object({
              status: z.number(),
              message: z.string(),
            }),
          },
        },
      },
      "401": {
        description: "Unauthorized",
        content: {
          "application/json": {
            schema: z.object({
              status: z.number(),
              message: z.string(),
            }),
          },
        },
      },
    },
  };

  async handle(c: AppContext) {
    try {
      const user = c.get("user");
      const authToken = c.get("authToken");
      const supabase = supabaseApiClient(authToken, c);

      const query = c.req.query("q");
      if (!query || query.trim().length === 0) {
        throw new HTTPException(400, { message: "Search query is required" });
      }

      const trimmedQuery = query.trim();
      const types = normalizeTypes(c.req.query("types"));

      const tasks: Promise<SearchResult[]>[] = [];

      if (types.includes("bookmarks")) {
        tasks.push(
          supabase
            .from("bookmarks")
            .select("id,title,url,updated_at")
            .eq("user_id", user.id)
            .or(
              `title.ilike.%${trimmedQuery}%,url.ilike.%${trimmedQuery}%,tags.ilike.%${trimmedQuery}%`,
            )
            .order("time_added", { ascending: false })
            .then(({ data, error }) => {
              if (error) {
                throw new HTTPException(500, {
                  message: "Failed to search bookmarks",
                });
              }
              return (data || []).map((item) => ({
                type: "bookmarks" as const,
                id: item.id,
                title: item.title,
                snippet: item.url ?? "",
                updated_at: item.updated_at ?? null,
              }));
            }),
        );
      }

      if (types.includes("notes")) {
        tasks.push(
          supabase
            .from("notes")
            .select("id,title,content,updated_at")
            .eq("user_id", user.id)
            .or(`title.ilike.%${trimmedQuery}%,content.ilike.%${trimmedQuery}%`)
            .order("updated_at", { ascending: false })
            .then(({ data, error }) => {
              if (error) {
                throw new HTTPException(500, {
                  message: "Failed to search notes",
                });
              }
              return (data || []).map((item) => ({
                type: "notes" as const,
                id: item.id,
                title: item.title,
                snippet: truncate(item.content),
                updated_at: item.updated_at ?? null,
              }));
            }),
        );
      }

      if (types.includes("diagrams")) {
        tasks.push(
          supabase
            .from("diagrams")
            .select("id,title,updated_at,mermaid_text")
            .eq("user_id", user.id)
            .or(
              `title.ilike.%${trimmedQuery}%,mermaid_text.ilike.%${trimmedQuery}%`,
            )
            .order("updated_at", { ascending: false })
            .then(({ data, error }) => {
              if (error) {
                throw new HTTPException(500, {
                  message: "Failed to search diagrams",
                });
              }
              return (data || []).map((item) => ({
                type: "diagrams" as const,
                id: item.id,
                title: item.title,
                snippet: truncate(item.mermaid_text),
                updated_at: item.updated_at ?? null,
              }));
            }),
        );
      }

      if (types.includes("code-snippets")) {
        tasks.push(
          supabase
            .from("code_snippets")
            .select("id,title,code,updated_at")
            .eq("user_id", user.id)
            .or(`title.ilike.%${trimmedQuery}%,code.ilike.%${trimmedQuery}%`)
            .order("updated_at", { ascending: false })
            .then(({ data, error }) => {
              if (error) {
                throw new HTTPException(500, {
                  message: "Failed to search code snippets",
                });
              }
              return (data || []).map((item) => ({
                type: "code-snippets" as const,
                id: item.id,
                title: item.title,
                snippet: truncate(item.code),
                updated_at: item.updated_at ?? null,
              }));
            }),
        );
      }

      const results = (await Promise.all(tasks)).flat();
      results.sort((a, b) => {
        const aTime = a.updated_at ? new Date(a.updated_at).getTime() : 0;
        const bTime = b.updated_at ? new Date(b.updated_at).getTime() : 0;
        return bTime - aTime;
      });

      return c.json({ data: results });
    } catch (error) {
      console.error("Error in SearchAll:", error);
      if (error instanceof HTTPException) {
        throw error;
      }
      throw new HTTPException(500, { message: "Internal server error" });
    }
  }
}
