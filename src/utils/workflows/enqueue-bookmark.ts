import type { AppContext } from "../../types/app-context";
import type { BookmarkWorkflowParams } from "../../workflows/bookmark-workflow";

// Fire-and-forget: start the BookmarkWorkflow for a bookmark. Errors here
// must never fail the HTTP request — the digest simply falls back to title-only
// for this bookmark if the workflow never runs.
export async function enqueueBookmarkWorkflow(
  c: AppContext,
  params: BookmarkWorkflowParams,
): Promise<string | undefined> {
  try {
    const instance = await c.env.BOOKMARK_WORKFLOW?.create({ params });
    return instance?.id;
  } catch (error) {
    console.error("Failed to enqueue BookmarkWorkflow:", error);
  }
}
