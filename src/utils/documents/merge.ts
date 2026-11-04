import { diff3Merge } from "node-diff3";

export interface DocumentSnapshot {
  title: string;
  markdown: string;
  tags: string | null;
  is_favorite: boolean;
}

export interface MarkdownMergeResult {
  markdown: string;
  /** Chunks both sides changed in incompatible ways. Both versions are kept. */
  conflicts: number;
}

export interface DocumentMergeResult {
  document: DocumentSnapshot;
  conflicts: number;
}

/** Word-level merges are quadratic in the worst case; larger chunks keep both sides. */
const MAX_WORD_MERGE_TOKENS = 20_000;

const mergeScalar = <T>(base: T, local: T, remote: T): T => {
  if (local === base) return remote;
  if (remote === base || local === remote) return local;
  // Both sides changed a single value. The writer that is saving now wins; the
  // other value stays recoverable from revision history.
  return local;
};

/** Words, runs of whitespace (including newlines) and single punctuation marks. */
const tokenize = (text: string): string[] =>
  text.match(/\s+|[\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]/gu) ?? [];

/** Returns the merged text, or null when both sides changed the same words. */
function mergeWords(base: string, local: string, remote: string): string | null {
  const baseTokens = tokenize(base);
  const localTokens = tokenize(local);
  const remoteTokens = tokenize(remote);
  if (baseTokens.length + localTokens.length + remoteTokens.length > MAX_WORD_MERGE_TOKENS) {
    return null;
  }

  const merged: string[] = [];
  for (const region of diff3Merge(localTokens, baseTokens, remoteTokens, {
    excludeFalseConflicts: true,
  })) {
    if (region.conflict) return null;
    if (region.ok) merged.push(...region.ok);
  }
  return merged.join("");
}

/** True when every token of `inner` appears in `outer`, in order. */
function containsAll(outer: string[], inner: string[]): boolean {
  let i = 0;
  for (const token of outer) {
    if (i < inner.length && token === inner[i]) i++;
  }
  return i === inner.length;
}

/**
 * When one side's version of a hunk already includes everything the other side
 * wrote (for example a device that kept typing on top of the same edit, or an
 * offline queue replaying an earlier snapshot), the larger version loses nothing.
 */
function supersetOf(local: string, remote: string): string | null {
  const localTokens = tokenize(local);
  const remoteTokens = tokenize(remote);
  if (containsAll(localTokens, remoteTokens)) return local;
  if (containsAll(remoteTokens, localTokens)) return remote;
  return null;
}

/**
 * Three-way Markdown merge.
 *
 * Changes are merged per line hunk (diff3). Where both sides touched the same
 * lines, the hunk is retried word by word, so edits to different parts of one
 * paragraph still combine. If one side's hunk contains all of the other's words,
 * the larger one is used. Otherwise both versions of the hunk are kept (remote
 * first, then local), so nothing is lost.
 */
export function mergeMarkdown(base: string, local: string, remote: string): MarkdownMergeResult {
  if (local === base || local === remote) return { markdown: remote, conflicts: 0 };
  if (remote === base) return { markdown: local, conflicts: 0 };

  const lines: string[] = [];
  let conflicts = 0;
  for (const region of diff3Merge(local.split("\n"), base.split("\n"), remote.split("\n"), {
    excludeFalseConflicts: true,
  })) {
    if (region.ok) {
      lines.push(...region.ok);
      continue;
    }
    if (!region.conflict) continue;

    const { a: localLines, o: baseLines, b: remoteLines } = region.conflict;
    const localChunk = localLines.join("\n");
    const remoteChunk = remoteLines.join("\n");
    const resolved =
      mergeWords(baseLines.join("\n"), localChunk, remoteChunk) ??
      supersetOf(localChunk, remoteChunk);
    if (resolved !== null) {
      lines.push(resolved);
    } else {
      conflicts++;
      lines.push(...remoteLines, ...localLines);
    }
  }

  return { markdown: lines.join("\n"), conflicts };
}

export function mergeDocument(
  base: DocumentSnapshot,
  local: DocumentSnapshot,
  remote: DocumentSnapshot,
): DocumentMergeResult {
  const markdown = mergeMarkdown(base.markdown, local.markdown, remote.markdown);
  return {
    document: {
      title: mergeScalar(base.title, local.title, remote.title),
      markdown: markdown.markdown,
      tags: mergeScalar(base.tags, local.tags, remote.tags),
      is_favorite: mergeScalar(base.is_favorite, local.is_favorite, remote.is_favorite),
    },
    conflicts: markdown.conflicts,
  };
}
