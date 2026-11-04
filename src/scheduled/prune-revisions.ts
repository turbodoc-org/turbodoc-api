import { createClient } from "@supabase/supabase-js";
import type { Database } from "../types/database.types";

/**
 * Thin out document history older than 30 days (see the
 * prune_document_revisions migration). Runs at most this many batches per
 * call so a large backlog is worked through over several runs.
 */
const MAX_BATCHES = 4;
const BATCH_SIZE = 5000;

export async function pruneDocumentRevisions(env: Cloudflare.Env) {
  const supabase = createClient<Database>(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY);
  let total = 0;
  for (let batch = 0; batch < MAX_BATCHES; batch++) {
    const { data, error } = await supabase.rpc("prune_document_revisions", {
      p_limit: BATCH_SIZE,
    });
    if (error) {
      console.error("Revision pruning failed:", error);
      return;
    }
    total += data ?? 0;
    if ((data ?? 0) < BATCH_SIZE) break;
  }
  if (total > 0) console.log(`Pruned ${total} old document revisions`);
}
