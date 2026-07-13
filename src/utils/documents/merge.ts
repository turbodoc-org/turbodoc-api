export interface DocumentSnapshot {
  title: string;
  markdown: string;
  tags: string | null;
  is_favorite: boolean;
}

const mergeScalar = <T>(base: T, local: T, remote: T): T => {
  if (local === base) return remote;
  if (remote === base || local === remote) return local;
  // A deterministic last-writer choice keeps clients moving without a manual
  // conflict screen. Markdown receives a more granular merge below.
  return local;
};

const changedRange = (base: string[], changed: string[]) => {
  let start = 0;
  while (start < base.length && start < changed.length && base[start] === changed[start]) start++;
  let baseEnd = base.length;
  let changedEnd = changed.length;
  while (baseEnd > start && changedEnd > start && base[baseEnd - 1] === changed[changedEnd - 1]) {
    baseEnd--;
    changedEnd--;
  }
  return { start, baseEnd, replacement: changed.slice(start, changedEnd) };
};

/** Three-way line merge. Non-overlapping offline edits are retained automatically. */
export function mergeMarkdown(base: string, local: string, remote: string): string {
  if (local === base) return remote;
  if (remote === base || local === remote) return local;

  const baseLines = base.split("\n");
  const localChange = changedRange(baseLines, local.split("\n"));
  const remoteChange = changedRange(baseLines, remote.split("\n"));
  const overlaps =
    localChange.start < remoteChange.baseEnd && remoteChange.start < localChange.baseEnd;

  if (overlaps) {
    // Preserve both edits without conflict markers. Stable directive/block IDs in
    // schema v2 will make this branch increasingly rare and more granular.
    return `${remote.trimEnd()}\n\n${local.trimStart()}`;
  }

  const changes = [localChange, remoteChange].sort((a, b) => b.start - a.start);
  const merged = [...baseLines];
  for (const change of changes) {
    merged.splice(change.start, change.baseEnd - change.start, ...change.replacement);
  }
  return merged.join("\n");
}

export function mergeDocument(
  base: DocumentSnapshot,
  local: DocumentSnapshot,
  remote: DocumentSnapshot,
): DocumentSnapshot {
  return {
    title: mergeScalar(base.title, local.title, remote.title),
    markdown: mergeMarkdown(base.markdown, local.markdown, remote.markdown),
    tags: mergeScalar(base.tags, local.tags, remote.tags),
    is_favorite: mergeScalar(base.is_favorite, local.is_favorite, remote.is_favorite),
  };
}
