import { z } from "zod";
import { HTTPException } from "hono/http-exception";
import { AppContext } from "../types/app-context";
import { Database, Json } from "../types/database.types";
import { supabaseApiClient } from "../utils/clients/supabase/api";
import { enqueueBookmarkWorkflow } from "../utils/workflows/enqueue-bookmark";

const PROTOCOL_VERSION = "2025-06-18";

type ToolContext = {
  c: AppContext;
  supabase: ReturnType<typeof supabaseApiClient>;
  userId: string;
};

type JsonRpcRequest = {
  jsonrpc: "2.0";
  id?: string | number | null;
  method?: string;
  params?: unknown;
};

type Tool = {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (args: Record<string, unknown>, ctx: ToolContext) => Promise<unknown>;
};

const stringSchema = (description: string, extra: Record<string, unknown> = {}) => ({
  type: "string",
  description,
  ...extra,
});

const numberSchema = (description: string) => ({ type: "number", description });
const booleanSchema = (description: string) => ({ type: "boolean", description });
const arraySchema = (description: string, items: Record<string, unknown> = {}) => ({
  type: "array",
  description,
  items,
});

const objectSchema = (
  properties: Record<string, unknown>,
  required: string[] = [],
): Record<string, unknown> => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});

const IdSchema = z.object({ id: z.string().min(1) });

const ListBookmarksSchema = z.object({
  status: z.enum(["all", "unread", "read", "archived"]).optional().default("all"),
  is_favorite: z.boolean().optional(),
  tag: z.string().optional(),
  days: z.number().int().positive().optional(),
  sort: z
    .enum(["date_newest", "date_oldest", "alpha_asc", "alpha_desc"])
    .optional()
    .default("date_newest"),
});

const BookmarkInputSchema = z.object({
  title: z.string().min(1),
  url: z.string().url(),
  tags: z.string().optional(),
  status: z.enum(["unread", "read", "archived"]).optional().default("unread"),
  is_favorite: z.boolean().optional(),
});

const UpdateBookmarkSchema = BookmarkInputSchema.partial().extend({
  id: z.string().min(1),
});

const ListNotesSchema = z.object({
  limit: z.number().int().positive().max(100).optional().default(50),
  offset: z.number().int().min(0).optional().default(0),
  search: z.string().optional(),
  is_favorite: z.boolean().optional(),
  tag: z.string().optional(),
  days: z.number().int().positive().optional(),
  sort: z
    .enum(["date_newest", "date_oldest", "alpha_asc", "alpha_desc", "modified"])
    .optional()
    .default("date_newest"),
});

const NoteInputSchema = z.object({
  title: z.string().optional().default(""),
  content: z.string().optional().default(""),
  tags: z.string().optional(),
  is_favorite: z.boolean().optional(),
});

const UpdateNoteSchema = NoteInputSchema.partial().extend({
  id: z.string().min(1),
  version: z.number().int().positive().optional(),
});

const CodeSnippetInputSchema = z.object({
  title: z.string().min(1),
  code: z.string().min(1),
  language: z.string().optional().default("javascript"),
  theme: z.string().optional().default("dracula"),
  background_type: z.string().optional().default("gradient"),
  background_value: z
    .string()
    .optional()
    .default("linear-gradient(135deg, #667eea 0%, #764ba2 100%)"),
  padding: z.number().optional().default(64),
  show_line_numbers: z.boolean().optional().default(true),
  font_family: z.string().optional().default("Fira Code"),
  font_size: z.number().optional().default(14),
  window_style: z.string().optional().default("mac"),
});

const UpdateCodeSnippetSchema = CodeSnippetInputSchema.partial().extend({
  id: z.string().min(1),
});

const DiagramInputSchema = z.object({
  title: z.string().min(1),
  diagram_type: z.enum(["canvas", "mermaid"]).optional().default("canvas"),
  mermaid_source: z.string().optional(),
  shapes: z.array(z.unknown()).optional().default([]),
  connections: z.array(z.unknown()).optional().default([]),
  thumbnail: z.string().optional(),
});

const UpdateDiagramSchema = DiagramInputSchema.partial().extend({
  id: z.string().min(1),
  mermaid_source: z.string().nullable().optional(),
});

const BookmarkOperationSchema = z.object({
  operation: z.enum(["create", "update", "delete"]),
  id: z.string().optional(),
  title: z.string().optional(),
  url: z.string().url().optional(),
  tags: z.string().optional(),
  status: z.enum(["unread", "read", "archived"]).optional(),
  is_favorite: z.boolean().optional(),
});

const NoteOperationSchema = z.object({
  operation: z.enum(["create", "update", "delete"]),
  id: z.string().optional(),
  title: z.string().optional(),
  content: z.string().optional(),
  tags: z.string().optional(),
  is_favorite: z.boolean().optional(),
  version: z.number().int().positive().optional(),
});

const jsonResult = (data: unknown) => ({
  content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  structuredContent: data,
  isError: false,
});

const toolError = (message: string, data?: unknown) => ({
  content: [{ type: "text", text: message }],
  structuredContent: data === undefined ? { error: message } : { error: message, data },
  isError: true,
});

const jsonRpcResult = (id: JsonRpcRequest["id"], result: unknown) => ({
  jsonrpc: "2.0",
  id,
  result,
});

const jsonRpcError = (id: JsonRpcRequest["id"], code: number, message: string, data?: unknown) => ({
  jsonrpc: "2.0",
  id: id ?? null,
  error: { code, message, ...(data === undefined ? {} : { data }) },
});

const fetchOgData = async (url: string) => {
  const response = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; TurbodocBot/1.0)" },
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) return { ogImage: null, title: null };

  const html = await response.text();
  let ogImage: string | null = null;
  const ogImageMatch = html.match(
    /<meta\s+property=["']og:image["']\s+content=["']([^"']+)["'][^>]*>/i,
  );
  if (ogImageMatch?.[1]) {
    ogImage = ogImageMatch[1];
    if (ogImage.startsWith("/")) {
      const urlObj = new URL(url);
      ogImage = `${urlObj.protocol}//${urlObj.host}${ogImage}`;
    } else if (ogImage.startsWith("//")) {
      const urlObj = new URL(url);
      ogImage = `${urlObj.protocol}${ogImage}`;
    }
  }

  const ogTitleMatch = html.match(
    /<meta\s+property=["']og:title["']\s+content=["']([^"']+)["'][^>]*>/i,
  );
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title = ogTitleMatch?.[1] ?? titleMatch?.[1]?.trim() ?? null;

  return { ogImage, title };
};

const tools: Tool[] = [
  {
    name: "list_bookmarks",
    title: "List bookmarks",
    description: "List bookmarks for the authenticated user with REST API filters.",
    inputSchema: objectSchema({
      status: stringSchema("Status filter", { enum: ["all", "unread", "read", "archived"] }),
      is_favorite: booleanSchema("Filter to favorites only"),
      tag: stringSchema("Filter by tag substring"),
      days: numberSchema("Only bookmarks added in the last N days"),
      sort: stringSchema("Sort order", {
        enum: ["date_newest", "date_oldest", "alpha_asc", "alpha_desc"],
      }),
    }),
    async handler(args, { supabase, userId }) {
      const input = ListBookmarksSchema.parse(args);
      let query = supabase.from("bookmarks").select("*").eq("user_id", userId);

      if (input.status !== "all") query = query.eq("status", input.status);
      if (input.is_favorite === true) query = query.eq("is_favorite", true);
      if (input.tag) query = query.ilike("tags", `%${input.tag}%`);
      if (input.days) {
        const daysAgo = new Date();
        daysAgo.setDate(daysAgo.getDate() - input.days);
        query = query.gte("time_added", Math.floor(daysAgo.getTime() / 1000));
      }

      const sortMap = {
        date_newest: ["time_added", false],
        date_oldest: ["time_added", true],
        alpha_asc: ["title", true],
        alpha_desc: ["title", false],
      } as const;
      const [column, ascending] = sortMap[input.sort];
      const { data, error } = await query.order(column, { ascending });
      if (error) throw new HTTPException(500, { message: "Failed to fetch bookmarks" });
      return { data: data || [] };
    },
  },
  {
    name: "get_bookmark",
    title: "Get bookmark",
    description: "Get one bookmark by ID.",
    inputSchema: objectSchema({ id: stringSchema("Bookmark ID") }, ["id"]),
    async handler(args, { supabase, userId }) {
      const { id } = IdSchema.parse(args);
      const { data, error } = await supabase
        .from("bookmarks")
        .select("*")
        .eq("id", id)
        .eq("user_id", userId)
        .single();
      if (error || !data) throw new HTTPException(404, { message: "Bookmark not found" });
      return { data };
    },
  },
  {
    name: "search_bookmarks",
    title: "Search bookmarks",
    description: "Search bookmarks by title, URL, or tags.",
    inputSchema: objectSchema({ q: stringSchema("Search query") }, ["q"]),
    async handler(args, { supabase, userId }) {
      const { q } = z.object({ q: z.string().trim().min(1) }).parse(args);
      const { data, error } = await supabase
        .from("bookmarks")
        .select("*")
        .eq("user_id", userId)
        .or(`title.ilike.%${q}%,url.ilike.%${q}%,tags.ilike.%${q}%`)
        .order("time_added", { ascending: false });
      if (error) throw new HTTPException(500, { message: "Failed to search bookmarks" });
      return { data: data || [], query: q };
    },
  },
  {
    name: "create_bookmark",
    title: "Create bookmark",
    description: "Create a bookmark and enqueue content processing.",
    inputSchema: objectSchema(
      {
        title: stringSchema("Bookmark title"),
        url: stringSchema("Bookmark URL", { format: "uri" }),
        tags: stringSchema("Pipe- or comma-separated tags"),
        status: stringSchema("Bookmark status", { enum: ["unread", "read", "archived"] }),
        is_favorite: booleanSchema("Whether the bookmark is favorite"),
      },
      ["title", "url"],
    ),
    async handler(args, { c, supabase, userId }) {
      const input = BookmarkInputSchema.parse(args);
      const insertData: Database["public"]["Tables"]["bookmarks"]["Insert"] = {
        user_id: userId,
        title: input.title,
        url: input.url,
        tags: input.tags,
        status: input.status,
        is_favorite: input.is_favorite,
        time_added: Math.floor(Date.now() / 1000),
      };
      const { data, error } = await supabase.from("bookmarks").insert(insertData).select().single();
      if (error) throw new HTTPException(500, { message: "Failed to create bookmark" });
      const instanceId = await enqueueBookmarkWorkflow(c, {
        bookmarkId: data.id,
        userId,
        url: data.url,
      });
      if (instanceId) {
        await supabase
          .from("bookmarks")
          .update({ workflow_instance_id: instanceId })
          .eq("id", data.id);
      }
      return { data: { ...data, workflow_instance_id: instanceId ?? data.workflow_instance_id } };
    },
  },
  {
    name: "update_bookmark",
    title: "Update bookmark",
    description: "Update a bookmark. Changing the URL re-enqueues content processing.",
    inputSchema: objectSchema(
      {
        id: stringSchema("Bookmark ID"),
        title: stringSchema("Bookmark title"),
        url: stringSchema("Bookmark URL", { format: "uri" }),
        tags: stringSchema("Pipe- or comma-separated tags"),
        status: stringSchema("Bookmark status", { enum: ["unread", "read", "archived"] }),
        is_favorite: booleanSchema("Whether the bookmark is favorite"),
      },
      ["id"],
    ),
    async handler(args, { c, supabase, userId }) {
      const input = UpdateBookmarkSchema.parse(args);
      const updateData: Database["public"]["Tables"]["bookmarks"]["Update"] = {};
      if (input.title !== undefined) updateData.title = input.title;
      if (input.url !== undefined) {
        updateData.url = input.url;
        updateData.summary = null;
        updateData.content_status = "pending";
        updateData.content_processed_at = null;
      }
      if (input.tags !== undefined) updateData.tags = input.tags;
      if (input.status !== undefined) updateData.status = input.status;
      if (input.is_favorite !== undefined) updateData.is_favorite = input.is_favorite;
      const { data, error } = await supabase
        .from("bookmarks")
        .update(updateData)
        .eq("id", input.id)
        .eq("user_id", userId)
        .select()
        .single();
      if (error || !data) throw new HTTPException(404, { message: "Bookmark not found" });
      if (input.url !== undefined) {
        const instanceId = await enqueueBookmarkWorkflow(c, {
          bookmarkId: data.id,
          userId,
          url: data.url,
        });
        if (instanceId) {
          await supabase
            .from("bookmarks")
            .update({ workflow_instance_id: instanceId })
            .eq("id", data.id);
        }
      }
      return { data };
    },
  },
  {
    name: "delete_bookmark",
    title: "Delete bookmark",
    description: "Delete one bookmark by ID.",
    inputSchema: objectSchema({ id: stringSchema("Bookmark ID") }, ["id"]),
    async handler(args, { supabase, userId }) {
      const { id } = IdSchema.parse(args);
      const { data, error } = await supabase
        .from("bookmarks")
        .delete()
        .eq("id", id)
        .eq("user_id", userId)
        .select()
        .single();
      if (error || !data) throw new HTTPException(404, { message: "Bookmark not found" });
      return { message: "Bookmark deleted successfully" };
    },
  },
  {
    name: "batch_bookmarks",
    title: "Batch bookmarks",
    description: "Run up to 100 bookmark create, update, and delete operations sequentially.",
    inputSchema: objectSchema(
      {
        operations: arraySchema("Bookmark operations", {
          type: "object",
          properties: {
            operation: { type: "string", enum: ["create", "update", "delete"] },
            id: { type: "string" },
            title: { type: "string" },
            url: { type: "string", format: "uri" },
            tags: { type: "string" },
            status: { type: "string", enum: ["unread", "read", "archived"] },
            is_favorite: { type: "boolean" },
          },
          required: ["operation"],
        }),
      },
      ["operations"],
    ),
    async handler(args, ctx) {
      const { operations } = z
        .object({ operations: z.array(BookmarkOperationSchema).min(1).max(100) })
        .parse(args);
      const results = [];
      for (const op of operations) {
        try {
          if (op.operation === "delete") {
            results.push({
              success: true,
              operation: "delete",
              id: op.id,
              ...(await callToolRecord("delete_bookmark", op, ctx)),
            });
          } else if (op.operation === "create") {
            results.push({
              success: true,
              operation: "create",
              ...(await callToolRecord("create_bookmark", op, ctx)),
            });
          } else {
            results.push({
              success: true,
              operation: "update",
              ...(await callToolRecord("update_bookmark", op, ctx)),
            });
          }
        } catch (error) {
          results.push({
            success: false,
            operation: op.operation,
            id: op.id,
            error: error instanceof Error ? error.message : "Unknown error occurred",
          });
        }
      }
      return {
        results,
        summary: {
          total: operations.length,
          successful: results.filter((result) => result.success).length,
          failed: results.filter((result) => !result.success).length,
        },
      };
    },
  },
  {
    name: "get_bookmark_og_image",
    title: "Get bookmark Open Graph image",
    description: "Fetch Open Graph image and title metadata for a URL.",
    inputSchema: objectSchema({ url: stringSchema("URL", { format: "uri" }) }, ["url"]),
    async handler(args) {
      const { url } = z.object({ url: z.string().url() }).parse(args);
      return fetchOgData(url);
    },
  },
  {
    name: "list_notes",
    title: "List notes",
    description: "List notes for the authenticated user with REST API filters.",
    inputSchema: objectSchema({
      limit: numberSchema("Maximum notes to return, up to 100"),
      offset: numberSchema("Number of notes to skip"),
      search: stringSchema("Search by title or content"),
      is_favorite: booleanSchema("Filter to favorites only"),
      tag: stringSchema("Filter by tag substring"),
      days: numberSchema("Only notes created in the last N days"),
      sort: stringSchema("Sort order", {
        enum: ["date_newest", "date_oldest", "alpha_asc", "alpha_desc", "modified"],
      }),
    }),
    async handler(args, { supabase, userId }) {
      const input = ListNotesSchema.parse(args);
      let query = supabase.from("notes").select("*", { count: "exact" }).eq("user_id", userId);
      if (input.search)
        query = query.or(`title.ilike.%${input.search}%,content.ilike.%${input.search}%`);
      if (input.is_favorite === true) query = query.eq("is_favorite", true);
      if (input.tag) query = query.ilike("tags", `%${input.tag}%`);
      if (input.days) {
        const daysAgo = new Date();
        daysAgo.setDate(daysAgo.getDate() - input.days);
        query = query.gte("created_at", daysAgo.toISOString());
      }
      const sortMap = {
        date_newest: ["updated_at", false],
        date_oldest: ["updated_at", true],
        alpha_asc: ["title", true],
        alpha_desc: ["title", false],
        modified: ["updated_at", false],
      } as const;
      const [column, ascending] = sortMap[input.sort];
      const { data, error, count } = await query
        .order(column, { ascending })
        .range(input.offset, input.offset + input.limit - 1);
      if (error) throw new HTTPException(500, { message: "Failed to fetch notes" });
      return { data: data || [], count: count || 0 };
    },
  },
  {
    name: "get_note",
    title: "Get note",
    description: "Get one note by ID.",
    inputSchema: objectSchema({ id: stringSchema("Note ID") }, ["id"]),
    async handler(args, { supabase, userId }) {
      const { id } = IdSchema.parse(args);
      const { data, error } = await supabase
        .from("notes")
        .select("*")
        .eq("id", id)
        .eq("user_id", userId)
        .single();
      if (error || !data) throw new HTTPException(404, { message: "Note not found" });
      return { data };
    },
  },
  {
    name: "create_note",
    title: "Create note",
    description: "Create a note.",
    inputSchema: objectSchema({
      title: stringSchema("Note title"),
      content: stringSchema("Note content"),
      tags: stringSchema("Comma-separated tags"),
      is_favorite: booleanSchema("Whether the note is favorite"),
    }),
    async handler(args, { supabase, userId }) {
      const input = NoteInputSchema.parse(args);
      const insertData: Database["public"]["Tables"]["notes"]["Insert"] = {
        user_id: userId,
        title: input.title,
        content: input.content,
        tags: input.tags,
        is_favorite: input.is_favorite,
        version: 1,
      };
      const { data, error } = await supabase.from("notes").insert(insertData).select().single();
      if (error) throw new HTTPException(500, { message: "Failed to create note" });
      return { data };
    },
  },
  {
    name: "update_note",
    title: "Update note",
    description: "Update a note. Pass version to enforce optimistic locking.",
    inputSchema: objectSchema(
      {
        id: stringSchema("Note ID"),
        title: stringSchema("Note title"),
        content: stringSchema("Note content"),
        tags: stringSchema("Comma-separated tags"),
        is_favorite: booleanSchema("Whether the note is favorite"),
        version: numberSchema("Current note version for optimistic locking"),
      },
      ["id"],
    ),
    async handler(args, { supabase, userId }) {
      const input = UpdateNoteSchema.parse(args);
      if (input.version !== undefined) {
        const { data: currentNote, error } = await supabase
          .from("notes")
          .select("*")
          .eq("id", input.id)
          .eq("user_id", userId)
          .single();
        if (error || !currentNote) throw new HTTPException(404, { message: "Note not found" });
        if (currentNote.version !== input.version) {
          throw new HTTPException(409, {
            message: "Version conflict - note was modified by another client",
            cause: { data: currentNote },
          });
        }
      }
      const updateData: Database["public"]["Tables"]["notes"]["Update"] = {};
      if (input.title !== undefined) updateData.title = input.title;
      if (input.content !== undefined) updateData.content = input.content;
      if (input.tags !== undefined) updateData.tags = input.tags;
      if (input.is_favorite !== undefined) updateData.is_favorite = input.is_favorite;
      if (input.version !== undefined) updateData.version = input.version + 1;
      if (Object.keys(updateData).length === 0) {
        throw new HTTPException(400, { message: "No fields provided to update" });
      }
      const { data, error } = await supabase
        .from("notes")
        .update(updateData)
        .eq("id", input.id)
        .eq("user_id", userId)
        .select()
        .single();
      if (error || !data) throw new HTTPException(404, { message: "Note not found" });
      return { data };
    },
  },
  {
    name: "delete_note",
    title: "Delete note",
    description: "Delete one note by ID.",
    inputSchema: objectSchema({ id: stringSchema("Note ID") }, ["id"]),
    async handler(args, { supabase, userId }) {
      const { id } = IdSchema.parse(args);
      const { error } = await supabase.from("notes").delete().eq("id", id).eq("user_id", userId);
      if (error) throw new HTTPException(500, { message: "Failed to delete note" });
      return { message: "Note deleted successfully", id };
    },
  },
  {
    name: "batch_notes",
    title: "Batch notes",
    description: "Run up to 100 note create, update, and delete operations sequentially.",
    inputSchema: objectSchema(
      {
        operations: arraySchema("Note operations", {
          type: "object",
          properties: {
            operation: { type: "string", enum: ["create", "update", "delete"] },
            id: { type: "string" },
            title: { type: "string" },
            content: { type: "string" },
            tags: { type: "string" },
            is_favorite: { type: "boolean" },
            version: { type: "number" },
          },
          required: ["operation"],
        }),
      },
      ["operations"],
    ),
    async handler(args, ctx) {
      const { operations } = z
        .object({ operations: z.array(NoteOperationSchema).min(1).max(100) })
        .parse(args);
      const results = [];
      for (const op of operations) {
        try {
          if (op.operation === "delete") {
            results.push({
              success: true,
              operation: "delete",
              id: op.id,
              ...(await callToolRecord("delete_note", op, ctx)),
            });
          } else if (op.operation === "create") {
            results.push({
              success: true,
              operation: "create",
              ...(await callToolRecord("create_note", op, ctx)),
            });
          } else {
            results.push({
              success: true,
              operation: "update",
              ...(await callToolRecord("update_note", op, ctx)),
            });
          }
        } catch (error) {
          results.push({
            success: false,
            operation: op.operation,
            id: op.id,
            error: error instanceof Error ? error.message : "Unknown error occurred",
          });
        }
      }
      return {
        results,
        summary: {
          total: operations.length,
          successful: results.filter((result) => result.success).length,
          failed: results.filter((result) => !result.success).length,
        },
      };
    },
  },
  {
    name: "list_code_snippets",
    title: "List code snippets",
    description: "List code snippets for the authenticated user.",
    inputSchema: objectSchema({}),
    async handler(_args, { supabase, userId }) {
      const { data, error } = await supabase
        .from("code_snippets")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      if (error) throw new HTTPException(500, { message: "Failed to fetch code snippets" });
      return { data: data || [] };
    },
  },
  {
    name: "get_code_snippet",
    title: "Get code snippet",
    description: "Get one code snippet by ID.",
    inputSchema: objectSchema({ id: stringSchema("Code snippet ID") }, ["id"]),
    async handler(args, { supabase, userId }) {
      const { id } = IdSchema.parse(args);
      const { data, error } = await supabase
        .from("code_snippets")
        .select("*")
        .eq("id", id)
        .eq("user_id", userId)
        .single();
      if (error || !data) throw new HTTPException(404, { message: "Code snippet not found" });
      return { data };
    },
  },
  {
    name: "create_code_snippet",
    title: "Create code snippet",
    description: "Create a code snippet.",
    inputSchema: objectSchema(
      {
        title: stringSchema("Snippet title"),
        code: stringSchema("Code content"),
        language: stringSchema("Programming language"),
        theme: stringSchema("Syntax theme"),
        background_type: stringSchema("Background type"),
        background_value: stringSchema("Background CSS value"),
        padding: numberSchema("Padding around code"),
        show_line_numbers: booleanSchema("Whether to show line numbers"),
        font_family: stringSchema("Code font family"),
        font_size: numberSchema("Font size in pixels"),
        window_style: stringSchema("Window style"),
      },
      ["title", "code"],
    ),
    async handler(args, { supabase, userId }) {
      const input = CodeSnippetInputSchema.parse(args);
      const insertData: Database["public"]["Tables"]["code_snippets"]["Insert"] = {
        user_id: userId,
        ...input,
      };
      const { data, error } = await supabase
        .from("code_snippets")
        .insert(insertData)
        .select()
        .single();
      if (error) throw new HTTPException(500, { message: "Failed to create code snippet" });
      return { data };
    },
  },
  {
    name: "update_code_snippet",
    title: "Update code snippet",
    description: "Update a code snippet.",
    inputSchema: objectSchema(
      {
        id: stringSchema("Code snippet ID"),
        title: stringSchema("Snippet title"),
        code: stringSchema("Code content"),
        language: stringSchema("Programming language"),
        theme: stringSchema("Syntax theme"),
        background_type: stringSchema("Background type"),
        background_value: stringSchema("Background CSS value"),
        padding: numberSchema("Padding around code"),
        show_line_numbers: booleanSchema("Whether to show line numbers"),
        font_family: stringSchema("Code font family"),
        font_size: numberSchema("Font size in pixels"),
        window_style: stringSchema("Window style"),
      },
      ["id"],
    ),
    async handler(args, { supabase, userId }) {
      const input = UpdateCodeSnippetSchema.parse(args);
      const { id, ...updateData } = input;
      const { data, error } = await supabase
        .from("code_snippets")
        .update(updateData)
        .eq("id", id)
        .eq("user_id", userId)
        .select()
        .single();
      if (error || !data) throw new HTTPException(404, { message: "Code snippet not found" });
      return { data };
    },
  },
  {
    name: "delete_code_snippet",
    title: "Delete code snippet",
    description: "Delete one code snippet by ID.",
    inputSchema: objectSchema({ id: stringSchema("Code snippet ID") }, ["id"]),
    async handler(args, { supabase, userId }) {
      const { id } = IdSchema.parse(args);
      const { data, error } = await supabase
        .from("code_snippets")
        .delete()
        .eq("id", id)
        .eq("user_id", userId)
        .select()
        .single();
      if (error || !data) throw new HTTPException(404, { message: "Code snippet not found" });
      return { message: "Code snippet deleted successfully" };
    },
  },
  {
    name: "list_diagrams",
    title: "List diagrams",
    description: "List diagrams for the authenticated user, including canvas and Mermaid diagrams.",
    inputSchema: objectSchema({}),
    async handler(_args, { supabase, userId }) {
      const { data, error } = await supabase
        .from("diagrams")
        .select("*")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false });
      if (error) throw new HTTPException(500, { message: "Failed to fetch diagrams" });
      return { data: data || [] };
    },
  },
  {
    name: "get_diagram",
    title: "Get diagram",
    description: "Get one diagram by ID.",
    inputSchema: objectSchema({ id: stringSchema("Diagram ID") }, ["id"]),
    async handler(args, { supabase, userId }) {
      const { id } = IdSchema.parse(args);
      const { data, error } = await supabase
        .from("diagrams")
        .select("*")
        .eq("id", id)
        .eq("user_id", userId)
        .single();
      if (error || !data) throw new HTTPException(404, { message: "Diagram not found" });
      return { data };
    },
  },
  {
    name: "create_diagram",
    title: "Create diagram",
    description:
      "Create a canvas or Mermaid diagram. Use diagram_type=mermaid with mermaid_source for Mermaid.js.",
    inputSchema: objectSchema(
      {
        title: stringSchema("Diagram title"),
        diagram_type: stringSchema("Diagram format", { enum: ["canvas", "mermaid"] }),
        mermaid_source: stringSchema("Mermaid.js source"),
        shapes: arraySchema("Canvas diagram shapes"),
        connections: arraySchema("Canvas diagram connections"),
        thumbnail: stringSchema("Base64 encoded thumbnail image"),
      },
      ["title"],
    ),
    async handler(args, { supabase, userId }) {
      const input = DiagramInputSchema.parse(args);
      const insertData: Database["public"]["Tables"]["diagrams"]["Insert"] = {
        user_id: userId,
        title: input.title,
        diagram_type: input.diagram_type,
        mermaid_source: input.diagram_type === "mermaid" ? input.mermaid_source || "" : null,
        shapes: input.shapes as Json,
        connections: input.connections as Json,
        thumbnail: input.thumbnail,
      };
      const { data, error } = await supabase.from("diagrams").insert(insertData).select().single();
      if (error) throw new HTTPException(500, { message: "Failed to create diagram" });
      return { data };
    },
  },
  {
    name: "update_diagram",
    title: "Update diagram",
    description: "Update a canvas or Mermaid diagram.",
    inputSchema: objectSchema(
      {
        id: stringSchema("Diagram ID"),
        title: stringSchema("Diagram title"),
        diagram_type: stringSchema("Diagram format", { enum: ["canvas", "mermaid"] }),
        mermaid_source: stringSchema("Mermaid.js source"),
        shapes: arraySchema("Canvas diagram shapes"),
        connections: arraySchema("Canvas diagram connections"),
        thumbnail: stringSchema("Base64 encoded thumbnail image"),
      },
      ["id"],
    ),
    async handler(args, { supabase, userId }) {
      const input = UpdateDiagramSchema.parse(args);
      const updateData: Database["public"]["Tables"]["diagrams"]["Update"] = {};
      if (input.title !== undefined) updateData.title = input.title;
      if (input.diagram_type !== undefined) updateData.diagram_type = input.diagram_type;
      if (input.mermaid_source !== undefined) updateData.mermaid_source = input.mermaid_source;
      if (input.shapes !== undefined) updateData.shapes = input.shapes as Json;
      if (input.connections !== undefined) updateData.connections = input.connections as Json;
      if (input.thumbnail !== undefined) updateData.thumbnail = input.thumbnail;
      const { data, error } = await supabase
        .from("diagrams")
        .update(updateData)
        .eq("id", input.id)
        .eq("user_id", userId)
        .select()
        .single();
      if (error || !data) throw new HTTPException(404, { message: "Diagram not found" });
      return { data };
    },
  },
  {
    name: "delete_diagram",
    title: "Delete diagram",
    description: "Delete one diagram by ID.",
    inputSchema: objectSchema({ id: stringSchema("Diagram ID") }, ["id"]),
    async handler(args, { supabase, userId }) {
      const { id } = IdSchema.parse(args);
      const { data, error } = await supabase
        .from("diagrams")
        .delete()
        .eq("id", id)
        .eq("user_id", userId)
        .select()
        .single();
      if (error || !data) throw new HTTPException(404, { message: "Diagram not found" });
      return { message: "Diagram deleted successfully" };
    },
  },
  {
    name: "duplicate_diagram",
    title: "Duplicate diagram",
    description: "Duplicate an existing diagram.",
    inputSchema: objectSchema({ id: stringSchema("Diagram ID") }, ["id"]),
    async handler(args, { supabase, userId }) {
      const { id } = IdSchema.parse(args);
      const { data: originalDiagram, error: fetchError } = await supabase
        .from("diagrams")
        .select("*")
        .eq("id", id)
        .eq("user_id", userId)
        .single();
      if (fetchError || !originalDiagram) {
        throw new HTTPException(404, { message: "Diagram not found" });
      }
      const insertData: Database["public"]["Tables"]["diagrams"]["Insert"] = {
        user_id: userId,
        title: `${originalDiagram.title} (Copy)`,
        diagram_type: originalDiagram.diagram_type,
        mermaid_source: originalDiagram.mermaid_source,
        shapes: originalDiagram.shapes,
        connections: originalDiagram.connections,
        thumbnail: originalDiagram.thumbnail,
      };
      const { data, error } = await supabase.from("diagrams").insert(insertData).select().single();
      if (error) throw new HTTPException(500, { message: "Failed to duplicate diagram" });
      return { data };
    },
  },
  {
    name: "list_tags",
    title: "List tags",
    description: "List the most-used bookmark tags for the authenticated user.",
    inputSchema: objectSchema({}),
    async handler(_args, { supabase, userId }) {
      const { data: bookmarks, error } = await supabase
        .from("bookmarks")
        .select("tags")
        .eq("user_id", userId)
        .not("tags", "is", null)
        .neq("tags", "");
      if (error) throw new HTTPException(500, { message: "Failed to fetch tags" });
      const tagCounts = new Map<string, number>();
      bookmarks?.forEach((bookmark) => {
        bookmark.tags
          ?.split("|")
          .map((tag) => tag.trim())
          .filter(Boolean)
          .forEach((tag) => tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1));
      });
      const data = Array.from(tagCounts.entries())
        .map(([tag, count]) => ({ tag, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 25);
      return { data };
    },
  },
];

const toolByName = new Map(tools.map((tool) => [tool.name, tool]));

const callTool = async (name: string, args: Record<string, unknown>, ctx: ToolContext) => {
  const tool = toolByName.get(name);
  if (!tool) throw new HTTPException(404, { message: `Unknown tool: ${name}` });
  return tool.handler(args, ctx);
};

const callToolRecord = async (name: string, args: Record<string, unknown>, ctx: ToolContext) =>
  (await callTool(name, args, ctx)) as Record<string, unknown>;

const makeToolContext = (c: AppContext): ToolContext => ({
  c,
  supabase: supabaseApiClient(c.get("authToken"), c),
  userId: c.get("user").id,
});

export const handleMcpRequest = async (c: AppContext) => {
  const request = (await c.req.json()) as JsonRpcRequest;

  if (request.jsonrpc !== "2.0" || !request.method) {
    return c.json(jsonRpcError(request.id, -32600, "Invalid JSON-RPC request"), 400);
  }

  if (request.id === undefined) {
    return new Response(null, { status: 202 });
  }

  if (request.method === "initialize") {
    return c.json(
      jsonRpcResult(request.id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: {
          name: "turbodoc-api",
          title: "Turbodoc API MCP Server",
          version: "1.0.0",
        },
        instructions:
          "Use these tools to manage Turbodoc bookmarks, notes, code snippets, and canvas or Mermaid diagrams for the authenticated user.",
      }),
      200,
      { "MCP-Protocol-Version": PROTOCOL_VERSION },
    );
  }

  if (request.method === "tools/list") {
    return c.json(
      jsonRpcResult(request.id, {
        tools: tools.map(({ name, title, description, inputSchema }) => ({
          name,
          title,
          description,
          inputSchema,
        })),
      }),
    );
  }

  if (request.method === "tools/call") {
    const params = z
      .object({
        name: z.string(),
        arguments: z.record(z.string(), z.unknown()).optional().default({}),
      })
      .parse(request.params);

    const tool = toolByName.get(params.name);
    if (!tool) {
      return c.json(jsonRpcError(request.id, -32602, `Unknown tool: ${params.name}`), 400);
    }

    try {
      const data = await tool.handler(params.arguments, makeToolContext(c));
      return c.json(jsonRpcResult(request.id, jsonResult(data)));
    } catch (error) {
      if (error instanceof z.ZodError) {
        return c.json(
          jsonRpcResult(request.id, toolError("Invalid tool arguments", z.treeifyError(error))),
        );
      }
      if (error instanceof HTTPException) {
        return c.json(
          jsonRpcResult(
            request.id,
            toolError(
              error.message,
              error.status === 409 ? (error.cause as { data?: unknown })?.data : undefined,
            ),
          ),
        );
      }
      console.error("MCP tool error:", error);
      return c.json(jsonRpcResult(request.id, toolError("Internal server error")));
    }
  }

  return c.json(jsonRpcError(request.id, -32601, `Method not found: ${request.method}`), 404);
};
