import type { SupabaseClient } from "@supabase/supabase-js";
import { HTTPException } from "hono/http-exception";
import type { Database, Json } from "../../types/database.types";
import { mergeDocument, type DocumentSnapshot } from "./merge";

type DocumentClient = SupabaseClient<Database>;
export type NoteRow = Database["public"]["Tables"]["notes"]["Row"];
type RevisionRow = Database["public"]["Tables"]["document_revisions"]["Row"];

/** Retries when another device commits between our read and our write. */
const MAX_SAVE_ATTEMPTS = 3;

export interface DocumentChanges {
  title?: string;
  markdown?: string;
  tags?: string | null;
  is_favorite?: boolean;
}

export interface RevisionMetadata {
  deviceId?: string;
  changeSummary?: string;
  revisionName?: string;
}

export interface SaveOptions extends RevisionMetadata {
  /** The revision the client's edits started from. Enables automatic merging. */
  baseRevisionId?: string | null;
  /** Legacy optimistic lock: reject with 409 instead of merging. */
  expectedVersion?: number;
}

export interface SaveResult {
  note: NoteRow;
  merged: boolean;
  conflicts: number;
  /**
   * The revision holding exactly what the client sent. A client that kept
   * editing while this save was in flight uses it as its next base, so its
   * next save only merges the newer edits.
   */
  submittedRevisionId: string | null;
}

export class DocumentVersionConflict extends HTTPException {
  constructor(readonly current: NoteRow) {
    super(409, { message: "Version conflict - note was modified by another client" });
  }
}

export const snapshotOf = (value: {
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

const revisionSnapshot = (revision: RevisionRow): DocumentSnapshot => ({
  title: revision.title,
  markdown: revision.markdown,
  tags: revision.tags,
  is_favorite: revision.is_favorite,
});

const applyChanges = (from: DocumentSnapshot, changes: DocumentChanges): DocumentSnapshot => ({
  title: changes.title ?? from.title,
  markdown: changes.markdown ?? from.markdown,
  tags: changes.tags === undefined ? from.tags : changes.tags,
  is_favorite: changes.is_favorite ?? from.is_favorite,
});

const sameSnapshot = (a: DocumentSnapshot, b: DocumentSnapshot) =>
  a.title === b.title &&
  a.markdown === b.markdown &&
  a.tags === b.tags &&
  a.is_favorite === b.is_favorite;

/** Read by the notes_record_revision trigger, which records the revision. */
const revisionMeta = (
  kind: "edit" | "merge" | "restore",
  metadata: RevisionMetadata,
  mergeParentId?: string | null,
): Json => {
  const meta: Record<string, string> = { kind };
  if (mergeParentId) meta.merge_parent_id = mergeParentId;
  if (metadata.deviceId) meta.device_id = metadata.deviceId;
  if (metadata.changeSummary) meta.change_summary = metadata.changeSummary;
  if (metadata.revisionName) meta.name = metadata.revisionName;
  return meta;
};

async function fetchNote(supabase: DocumentClient, userId: string, id: string) {
  const { data, error } = await supabase
    .from("notes")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new HTTPException(500, { message: "Failed to fetch document" });
  if (!data) throw new HTTPException(404, { message: "Document not found" });
  return data;
}

async function fetchRevision(
  supabase: DocumentClient,
  userId: string,
  documentId: string,
  revisionId: string,
) {
  const { data, error } = await supabase
    .from("document_revisions")
    .select("*")
    .eq("id", revisionId)
    .eq("document_id", documentId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new HTTPException(500, { message: "Failed to fetch revision" });
  return data;
}

/**
 * Save changes to a document. When the client's base revision is behind the
 * current head, its changes are merged three-way with everything committed
 * since, instead of overwriting them.
 */
export async function saveDocument(
  supabase: DocumentClient,
  userId: string,
  id: string,
  changes: DocumentChanges,
  options: SaveOptions = {},
): Promise<SaveResult> {
  let base: RevisionRow | null | undefined;
  let submittedRevisionId: string | null = null;

  for (let attempt = 0; attempt < MAX_SAVE_ATTEMPTS; attempt++) {
    const current = await fetchNote(supabase, userId, id);
    if (options.expectedVersion !== undefined && current.version !== options.expectedVersion) {
      throw new DocumentVersionConflict(current);
    }

    const remote = snapshotOf(current);
    const baseIsBehind =
      !!options.baseRevisionId && options.baseRevisionId !== current.head_revision_id;
    if (baseIsBehind && base === undefined) {
      base = await fetchRevision(supabase, userId, id, options.baseRevisionId!);
      if (!base) console.warn(`Unknown base revision ${options.baseRevisionId} for ${id}`);
    }

    let next: DocumentSnapshot;
    let merged = false;
    let conflicts = 0;
    if (baseIsBehind && base) {
      // Omitted fields mean "unchanged since my base", not "unchanged since head".
      const local = applyChanges(revisionSnapshot(base), changes);
      if (sameSnapshot(local, revisionSnapshot(base))) {
        // No edits since the base: nothing to merge, and the base already is
        // the client's snapshot.
        return { note: current, merged: true, conflicts: 0, submittedRevisionId: base.id };
      }
      if (!submittedRevisionId) {
        const { data, error } = await supabase
          .from("document_revisions")
          .insert({
            document_id: id,
            user_id: userId,
            revision_number: null,
            kind: "submitted",
            parent_revision_id: base.id,
            title: local.title,
            markdown: local.markdown,
            tags: local.tags,
            is_favorite: local.is_favorite,
            device_id: options.deviceId,
          })
          .select("id")
          .single();
        if (error || !data) {
          throw new HTTPException(500, { message: "Failed to record submitted revision" });
        }
        submittedRevisionId = data.id;
      }
      const result = mergeDocument(revisionSnapshot(base), local, remote);
      next = result.document;
      conflicts = result.conflicts;
      merged = true;
    } else {
      next = applyChanges(remote, changes);
    }

    if (sameSnapshot(next, remote)) {
      // Nothing new to record (the head already contains these changes).
      return {
        note: current,
        merged,
        conflicts,
        submittedRevisionId: submittedRevisionId ?? current.head_revision_id,
      };
    }

    const { data: updated, error } = await supabase
      .from("notes")
      .update({
        title: next.title,
        content: next.markdown,
        tags: next.tags,
        is_favorite: next.is_favorite,
        last_edited_by_device: options.deviceId ?? current.last_edited_by_device,
        revision_meta: revisionMeta(merged ? "merge" : "edit", options, submittedRevisionId),
      })
      .eq("id", id)
      .eq("user_id", userId)
      .eq("version", current.version)
      .select()
      .maybeSingle();
    if (error) throw new HTTPException(500, { message: "Failed to update document" });
    if (updated) {
      return {
        note: updated,
        merged,
        conflicts,
        submittedRevisionId: submittedRevisionId ?? updated.head_revision_id,
      };
    }
    // Another write landed between our read and update. Merge against it.
    if (options.expectedVersion !== undefined) {
      throw new DocumentVersionConflict(await fetchNote(supabase, userId, id));
    }
    if (!options.baseRevisionId) {
      // Without a base there is nothing to merge from: the latest content wins,
      // and the overwritten version remains in history.
      options = { ...options, baseRevisionId: current.head_revision_id };
    }
  }
  throw new HTTPException(409, { message: "Document is changing too quickly; retry" });
}

/**
 * Create a document. A client-supplied ID makes offline creates idempotent:
 * replaying the same create returns the existing document.
 */
export async function createDocument(
  supabase: DocumentClient,
  userId: string,
  document: DocumentSnapshot,
  options: RevisionMetadata & { id?: string } = {},
): Promise<{ note: NoteRow; created: boolean }> {
  const { data, error } = await supabase
    .from("notes")
    .insert({
      ...(options.id ? { id: options.id } : {}),
      user_id: userId,
      title: document.title,
      content: document.markdown,
      tags: document.tags,
      is_favorite: document.is_favorite,
      schema_version: 1,
      last_edited_by_device: options.deviceId,
      revision_meta: revisionMeta("edit", options),
    })
    .select()
    .single();
  if (!error && data) return { note: data, created: true };
  if (options.id && error?.code === "23505") {
    return { note: await fetchNote(supabase, userId, options.id), created: false };
  }
  throw new HTTPException(500, { message: "Failed to create document" });
}

/** Make a historical revision the new head. History is never rewritten. */
export async function restoreDocumentRevision(
  supabase: DocumentClient,
  userId: string,
  id: string,
  revisionId: string,
): Promise<NoteRow> {
  const revision = await fetchRevision(supabase, userId, id, revisionId);
  if (!revision) throw new HTTPException(404, { message: "Revision not found" });
  const label = revision.revision_number === null ? "draft" : `v${revision.revision_number}`;

  for (let attempt = 0; attempt < MAX_SAVE_ATTEMPTS; attempt++) {
    const current = await fetchNote(supabase, userId, id);
    const { data: restored, error } = await supabase
      .from("notes")
      .update({
        title: revision.title,
        content: revision.markdown,
        tags: revision.tags,
        is_favorite: revision.is_favorite,
        revision_meta: revisionMeta("restore", {
          changeSummary: `Restored revision ${revision.revision_number ?? revision.id}`,
          revisionName: `Restore of ${revision.name ?? label}`,
        }),
      })
      .eq("id", id)
      .eq("user_id", userId)
      .eq("version", current.version)
      .select()
      .maybeSingle();
    if (error) throw new HTTPException(500, { message: "Failed to restore revision" });
    if (restored) return restored;
  }
  throw new HTTPException(409, { message: "Document changed during restore" });
}
