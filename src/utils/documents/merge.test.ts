import { describe, expect, it } from "vite-plus/test";
import { mergeMarkdown } from "./merge";

describe("mergeMarkdown", () => {
  it("keeps non-overlapping offline edits", () => {
    const base = "first\nsecond\nthird";
    expect(mergeMarkdown(base, "FIRST\nsecond\nthird", "first\nsecond\nTHIRD")).toBe(
      "FIRST\nsecond\nTHIRD",
    );
  });

  it("keeps both overlapping edits without conflict markers", () => {
    const merged = mergeMarkdown("hello", "hello from iPhone", "hello from web");
    expect(merged).toContain("hello from web");
    expect(merged).toContain("hello from iPhone");
    expect(merged).not.toContain("<<<<<<<");
  });
});
