import { OpenAPIRoute } from "chanfana";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { AppContext } from "../../types/app-context";
import { supabaseApiClient } from "../../utils/clients/supabase/api";
import {
  createDocument,
  restoreDocumentRevision,
  saveDocument,
  type NoteRow,
} from "../../utils/documents/save";

const documentInput = z.object({
  title: z.string().optional(),
  markdown: z.string().optional(),
  tags: z.string().nullable().optional(),
  is_favorite: z.boolean().optional(),
  base_revision_id: z.string().uuid().nullable().optional(),
  device_id: z.string().max(200).optional(),
  change_summary: z.string().max(500).optional(),
  revision_name: z.string().max(200).optional(),
});

const createDocumentInput = documentInput.extend({
  /** Client-generated ID, so an offline create can be replayed safely. */
  id: z.string().uuid().optional(),
});

const asDocument = (note: NoteRow) => {
  const { content, revision_meta: _revisionMeta, ...metadata } = note;
  return { ...metadata, markdown: content };
};

export class ListDocuments extends OpenAPIRoute {
  static schema = { tags: ["Documents"], summary: "List Markdown documents" };
  async handle(c: AppContext) {
    const user = c.get("user");
    const supabase = supabaseApiClient(c.get("authToken"), c);
    const { search, is_favorite, tag } = c.req.query();
    let query = supabase.from("notes").select("*", { count: "exact" }).eq("user_id", user.id);
    if (search) query = query.or(`title.ilike.%${search}%,content.ilike.%${search}%`);
    if (is_favorite === "true") query = query.eq("is_favorite", true);
    if (tag) query = query.ilike("tags", `%${tag}%`);
    const { data, error, count } = await query.order("updated_at", { ascending: false });
    if (error) throw new HTTPException(500, { message: "Failed to list documents" });
    return c.json({ data: data.map(asDocument), count: count ?? data.length });
  }
}

export class GetDocument extends OpenAPIRoute {
  static schema = { tags: ["Documents"], summary: "Get a Markdown document" };
  async handle(c: AppContext) {
    const user = c.get("user");
    const supabase = supabaseApiClient(c.get("authToken"), c);
    const { id } = c.req.param();
    const { data, error } = await supabase
      .from("notes")
      .select("*")
      .eq("id", id!)
      .eq("user_id", user.id)
      .single();
    if (error || !data) throw new HTTPException(404, { message: "Document not found" });
    return c.json({ data: asDocument(data) });
  }
}

export class CreateDocument extends OpenAPIRoute {
  static schema = {
    tags: ["Documents"],
    summary: "Create a Markdown document",
    description:
      "Pass a client-generated `id` to make the create idempotent: replaying it returns the existing document with status 200.",
    request: { body: { content: { "application/json": { schema: createDocumentInput } } } },
  };
  async handle(c: AppContext) {
    const user = c.get("user");
    const input = createDocumentInput.parse(await c.req.json());
    const supabase = supabaseApiClient(c.get("authToken"), c);
    const { note, created } = await createDocument(
      supabase,
      user.id,
      {
        title: input.title ?? "",
        markdown: input.markdown ?? "",
        tags: input.tags ?? null,
        is_favorite: input.is_favorite ?? false,
      },
      {
        id: input.id,
        deviceId: input.device_id,
        changeSummary: input.change_summary,
        revisionName: input.revision_name,
      },
    );
    return c.json({ data: asDocument(note) }, created ? 201 : 200);
  }
}

export class UpdateDocument extends OpenAPIRoute {
  static schema = {
    tags: ["Documents"],
    summary: "Update and automatically merge a Markdown document",
    description:
      "Send `base_revision_id`: the head revision your edits started from. If the document changed since, your changes are merged with the newer ones instead of replacing them. The response includes `merged`, `conflicts` (hunks where both versions were kept) and `submitted_revision_id`: use it as your next `base_revision_id` if you kept editing while this request was in flight; otherwise adopt the returned document and use its `head_revision_id`.",
    request: { body: { content: { "application/json": { schema: documentInput } } } },
  };
  async handle(c: AppContext) {
    const user = c.get("user");
    const input = documentInput.parse(await c.req.json());
    const supabase = supabaseApiClient(c.get("authToken"), c);
    const { id } = c.req.param();
    const result = await saveDocument(
      supabase,
      user.id,
      id!,
      {
        title: input.title,
        markdown: input.markdown,
        tags: input.tags,
        is_favorite: input.is_favorite,
      },
      {
        baseRevisionId: input.base_revision_id,
        deviceId: input.device_id,
        changeSummary: input.change_summary,
        revisionName: input.revision_name,
      },
    );
    return c.json({
      data: asDocument(result.note),
      merged: result.merged,
      conflicts: result.conflicts,
      submitted_revision_id: result.submittedRevisionId,
    });
  }
}

export class DeleteDocument extends OpenAPIRoute {
  static schema = { tags: ["Documents"], summary: "Delete a document and its history" };
  async handle(c: AppContext) {
    const user = c.get("user");
    const supabase = supabaseApiClient(c.get("authToken"), c);
    const { id } = c.req.param();
    const { error } = await supabase.from("notes").delete().eq("id", id!).eq("user_id", user.id);
    if (error) throw new HTTPException(500, { message: "Failed to delete document" });
    return c.json({ message: "Document deleted" });
  }
}

export class ListDocumentRevisions extends OpenAPIRoute {
  static schema = { tags: ["Documents"], summary: "List document revision history" };
  async handle(c: AppContext) {
    const user = c.get("user");
    const supabase = supabaseApiClient(c.get("authToken"), c);
    const { id } = c.req.param();
    const { data, error } = await supabase
      .from("document_revisions")
      .select("*")
      .eq("document_id", id!)
      .eq("user_id", user.id)
      // Submitted snapshots are merge bases, not points in the history.
      .neq("kind", "submitted")
      .order("revision_number", { ascending: false });
    if (error) throw new HTTPException(500, { message: "Failed to list revisions" });
    return c.json({ data });
  }
}

export class NameDocumentRevision extends OpenAPIRoute {
  static schema = { tags: ["Documents"], summary: "Name a revision" };
  async handle(c: AppContext) {
    const user = c.get("user");
    const { name } = z.object({ name: z.string().min(1).max(200) }).parse(await c.req.json());
    const supabase = supabaseApiClient(c.get("authToken"), c);
    const { id, revisionId } = c.req.param();
    const { data, error } = await supabase
      .from("document_revisions")
      .update({ name })
      .eq("id", revisionId!)
      .eq("document_id", id!)
      .eq("user_id", user.id)
      .select()
      .single();
    if (error) throw new HTTPException(404, { message: "Revision not found" });
    return c.json({ data });
  }
}

export class RestoreDocumentRevision extends OpenAPIRoute {
  static schema = { tags: ["Documents"], summary: "Restore a revision as a new head" };
  async handle(c: AppContext) {
    const user = c.get("user");
    const supabase = supabaseApiClient(c.get("authToken"), c);
    const { id, revisionId } = c.req.param();
    const restored = await restoreDocumentRevision(supabase, user.id, id!, revisionId!);
    return c.json({ data: asDocument(restored) });
  }
}
