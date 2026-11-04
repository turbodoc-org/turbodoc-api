import { describe, expect, test } from "vite-plus/test";
import { mergeDocument, mergeMarkdown } from "./merge";

const base = "# Title\npara one\npara two\npara three";

describe("mergeMarkdown", () => {
  test("returns the other side when only one side changed", () => {
    expect(mergeMarkdown(base, base, "changed")).toEqual({ markdown: "changed", conflicts: 0 });
    expect(mergeMarkdown(base, "changed", base)).toEqual({ markdown: "changed", conflicts: 0 });
    expect(mergeMarkdown(base, "same", "same")).toEqual({ markdown: "same", conflicts: 0 });
  });

  test("merges edits on different lines", () => {
    const result = mergeMarkdown(base, base.replace("one", "ONE"), base.replace("three", "THREE"));
    expect(result).toEqual({ markdown: "# Title\npara ONE\npara two\npara THREE", conflicts: 0 });
  });

  test("merges edits on adjacent lines", () => {
    const result = mergeMarkdown(base, base.replace("one", "ONE"), base.replace("two", "TWO"));
    expect(result).toEqual({ markdown: "# Title\npara ONE\npara TWO\npara three", conflicts: 0 });
  });

  test("merges edits to different words on the same line", () => {
    const result = mergeMarkdown(
      base,
      base.replace("para one", "para one!"),
      base.replace("para one", "PARA one"),
    );
    expect(result).toEqual({ markdown: "# Title\nPARA one!\npara two\npara three", conflicts: 0 });
  });

  test("merges edits at both ends with an edit in the middle", () => {
    const result = mergeMarkdown(base, `X\n${base}\nY`, base.replace("two", "TWO"));
    expect(result).toEqual({
      markdown: "X\n# Title\npara one\npara TWO\npara three\nY",
      conflicts: 0,
    });
  });

  test("keeps the longer version when one side extended the other's insertion", () => {
    const local = `${base}\nhello\nlocal only`;
    const remote = `${base}\nhello`;
    expect(mergeMarkdown(base, local, remote)).toEqual({ markdown: local, conflicts: 0 });
  });

  test("keeps both versions of only the conflicting hunk", () => {
    const result = mergeMarkdown(
      base,
      base.replace("para two", "local rewrite"),
      base.replace("para two", "remote rewrite"),
    );
    expect(result).toEqual({
      markdown: "# Title\npara one\nremote rewrite\nlocal rewrite\npara three",
      conflicts: 1,
    });
  });

  test("keeps both appends at the end of the document", () => {
    const result = mergeMarkdown(base, `${base}\nfrom A`, `${base}\nfrom B`);
    expect(result).toEqual({ markdown: `${base}\nfrom B\nfrom A`, conflicts: 1 });
  });

  test("keeps an edit when the other side deleted the same line", () => {
    const edited = base.replace("para two", "para two edited");
    expect(mergeMarkdown(base, base.replace("\npara two", ""), edited)).toEqual({
      markdown: edited,
      conflicts: 0,
    });
  });

  test("replaying an older snapshot against a newer one keeps the newer text once", () => {
    // Legacy offline queues send several snapshots that share one stale base.
    const older = `${base}\nhello`;
    const newer = `${base}\nhello world`;
    expect(mergeMarkdown(base, older, newer)).toEqual({ markdown: newer, conflicts: 0 });
    expect(mergeMarkdown(base, newer, older)).toEqual({ markdown: newer, conflicts: 0 });
  });

  test("rebasing on a submitted snapshot does not repeat in-flight edits", () => {
    // The client sent `submitted`; the server merged it with a remote edit. The
    // client kept typing and now saves with the submitted snapshot as its base.
    const submitted = `${base}\nhello`;
    const merged = mergeMarkdown(base, submitted, base.replace("one", "ONE")).markdown;
    const result = mergeMarkdown(submitted, `${submitted} world`, merged);
    expect(result).toEqual({
      markdown: "# Title\npara ONE\npara two\npara three\nhello world",
      conflicts: 0,
    });
  });
});

describe("mergeDocument", () => {
  const snapshot = { title: "T", markdown: base, tags: "a", is_favorite: false };

  test("merges each field independently", () => {
    const result = mergeDocument(
      snapshot,
      { ...snapshot, title: "Local title", markdown: base.replace("one", "ONE") },
      { ...snapshot, tags: "a,b", is_favorite: true, markdown: base.replace("three", "THREE") },
    );
    expect(result).toEqual({
      document: {
        title: "Local title",
        markdown: "# Title\npara ONE\npara two\npara THREE",
        tags: "a,b",
        is_favorite: true,
      },
      conflicts: 0,
    });
  });

  test("prefers the local value when both sides changed a scalar", () => {
    const result = mergeDocument(
      snapshot,
      { ...snapshot, title: "Local" },
      { ...snapshot, title: "Remote" },
    );
    expect(result.document.title).toBe("Local");
  });
});
