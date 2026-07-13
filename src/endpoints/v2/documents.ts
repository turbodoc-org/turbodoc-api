import { OpenAPIRoute } from "chanfana";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { AppContext } from "../../types/app-context";
import type { Database } from "../../types/database.types";
import { supabaseApiClient } from "../../utils/clients/supabase/api";
import { mergeDocument, type DocumentSnapshot } from "../../utils/documents/merge";

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

const snapshot = (value: {
  title: string;
  content: string;
  tags: string | null;
  is_favorite: boolean | null;
}): DocumentSnapshot => ({
  title: value.title,
  markdown: value.content,
  tags: value.tags,
  is_favorite: value.is_favorite ?? false,
});

type NoteRow = Database["public"]["Tables"]["notes"]["Row"];

const asDocument = (note: NoteRow) => {
  const { content, ...metadata } = note;
  return { ...metadata, markdown: content };
};

async function addRevision(
  supabase: ReturnType<typeof supabaseApiClient>,
  userId: string,
  document: Database["public"]["Tables"]["notes"]["Row"],
  metadata: { device_id?: string; change_summary?: string; revision_name?: string },
) {
  const revision: Database["public"]["Tables"]["document_revisions"]["Insert"] = {
    document_id: document.id,
    user_id: userId,
    revision_number: document.version,
    title: document.title,
    markdown: document.content,
    tags: document.tags,
    is_favorite: document.is_favorite ?? false,
    device_id: metadata.device_id,
    change_summary: metadata.change_summary,
    name: metadata.revision_name,
  };
  const { data, error } = await supabase
    .from("document_revisions")
    .insert(revision)
    .select()
    .single();
  if (error) throw new HTTPException(500, { message: "Failed to create revision" });
  await supabase
    .from("notes")
    .update({ head_revision_id: data.id })
    .eq("id", document.id)
    .eq("user_id", userId);
  return data;
}

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
    request: { body: { content: { "application/json": { schema: documentInput } } } },
  };
  async handle(c: AppContext) {
    const user = c.get("user");
    const input = documentInput.parse(await c.req.json());
    const supabase = supabaseApiClient(c.get("authToken"), c);
    const { data, error } = await supabase
      .from("notes")
      .insert({
        user_id: user.id,
        title: input.title ?? "",
        content: input.markdown ?? "",
        tags: input.tags,
        is_favorite: input.is_favorite ?? false,
        version: 1,
        schema_version: 1,
        last_edited_by_device: input.device_id,
      })
      .select()
      .single();
    if (error || !data) throw new HTTPException(500, { message: "Failed to create document" });
    const revision = await addRevision(supabase, user.id, data, input);
    return c.json({ data: { ...asDocument(data), head_revision_id: revision.id } }, 201);
  }
}

export class UpdateDocument extends OpenAPIRoute {
  static schema = {
    tags: ["Documents"],
    summary: "Update and automatically merge a Markdown document",
    request: { body: { content: { "application/json": { schema: documentInput } } } },
  };
  async handle(c: AppContext) {
    const user = c.get("user");
    const input = documentInput.parse(await c.req.json());
    const supabase = supabaseApiClient(c.get("authToken"), c);
    const { id } = c.req.param();
    const { data: current, error } = await supabase
      .from("notes")
      .select("*")
      .eq("id", id!)
      .eq("user_id", user.id)
      .single();
    if (error || !current) throw new HTTPException(404, { message: "Document not found" });

    const remote = snapshot(current);
    let next: DocumentSnapshot = {
      title: input.title ?? remote.title,
      markdown: input.markdown ?? remote.markdown,
      tags: input.tags === undefined ? remote.tags : input.tags,
      is_favorite: input.is_favorite ?? remote.is_favorite,
    };
    let merged = false;
    if (input.base_revision_id && input.base_revision_id !== current.head_revision_id) {
      const { data: base } = await supabase
        .from("document_revisions")
        .select("*")
        .eq("id", input.base_revision_id)
        .eq("document_id", id!)
        .eq("user_id", user.id)
        .single();
      if (base) {
        next = mergeDocument(
          {
            title: base.title,
            markdown: base.markdown,
            tags: base.tags,
            is_favorite: base.is_favorite,
          },
          next,
          remote,
        );
        merged = true;
      }
    }

    const nextVersion = current.version + 1;
    const { data: updated, error: updateError } = await supabase
      .from("notes")
      .update({
        title: next.title,
        content: next.markdown,
        tags: next.tags,
        is_favorite: next.is_favorite,
        version: nextVersion,
        last_edited_by_device: input.device_id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id!)
      .eq("user_id", user.id)
      .eq("version", current.version)
      .select()
      .single();
    if (updateError || !updated)
      throw new HTTPException(409, { message: "Concurrent update; retry with latest head" });
    const revision = await addRevision(supabase, user.id, updated, input);
    return c.json({ data: { ...asDocument(updated), head_revision_id: revision.id }, merged });
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
    const { data: revision, error } = await supabase
      .from("document_revisions")
      .select("*")
      .eq("id", revisionId!)
      .eq("document_id", id!)
      .eq("user_id", user.id)
      .single();
    if (error || !revision) throw new HTTPException(404, { message: "Revision not found" });
    const { data: current } = await supabase
      .from("notes")
      .select("*")
      .eq("id", id!)
      .eq("user_id", user.id)
      .single();
    if (!current) throw new HTTPException(404, { message: "Document not found" });
    const { data: restored, error: restoreError } = await supabase
      .from("notes")
      .update({
        title: revision.title,
        content: revision.markdown,
        tags: revision.tags,
        is_favorite: revision.is_favorite,
        version: current.version + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id!)
      .eq("user_id", user.id)
      .eq("version", current.version)
      .select()
      .single();
    if (restoreError || !restored)
      throw new HTTPException(409, { message: "Document changed during restore" });
    const newRevision = await addRevision(supabase, user.id, restored, {
      change_summary: `Restored revision ${revision.revision_number}`,
      revision_name: `Restore of ${revision.name ?? `v${revision.revision_number}`}`,
    });
    return c.json({ data: { ...asDocument(restored), head_revision_id: newRevision.id } });
  }
}
