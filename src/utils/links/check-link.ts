import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../types/database.types";

/**
 * Broken-link detection for bookmarks.
 *
 * "failed" counts toward flagging a bookmark as broken (two in a row => broken,
 * see record_bookmark_link_checks). We only call a link failed when the
 * evidence is unambiguous: 404/410, persistent 5xx, or the host can't be
 * reached at all. 401/403/429 and other 4xx responses are what healthy sites
 * send to automated requests (bot protection, logins, rate limits), so they
 * count as reachable.
 */
export type LinkCheckOutcome = "ok" | "failed" | "unsupported";

export type LinkCheckResult = {
  outcome: LinkCheckOutcome;
  statusCode: number | null;
  error: string | null;
};

const CHECK_TIMEOUT_MS = 15_000;

const GONE_STATUSES = new Set([404, 410]);

const REQUEST_HEADERS = {
  // Many sites reject requests without a browser-like UA; identify ourselves too.
  "User-Agent":
    "Mozilla/5.0 (compatible; TurbodocLinkChecker/1.0; +https://turbodoc.ai) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

/** Classify an HTTP response. Exported for tests. */
export function classifyResponse(status: number, headers: Headers): LinkCheckResult {
  if (GONE_STATUSES.has(status)) {
    return { outcome: "failed", statusCode: status, error: null };
  }
  if (status >= 500) {
    // Cloudflare's bot challenge can come back as a 503; that's not a dead site.
    if (headers.get("cf-mitigated") === "challenge") {
      return { outcome: "ok", statusCode: status, error: null };
    }
    return { outcome: "failed", statusCode: status, error: null };
  }
  return { outcome: "ok", statusCode: status, error: null };
}

/**
 * Errors that mean *we* couldn't run the check (e.g. the Worker ran out of
 * subrequests), as opposed to the site being unreachable. These must never
 * count against the link.
 */
function isLocalLimitError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /too many subrequests|subrequest limit/i.test(message);
}

function describeFetchError(error: unknown) {
  if (error instanceof Error) {
    if (error.name === "TimeoutError" || error.name === "AbortError") return "Timed out";
    return error.message.slice(0, 200) || error.name;
  }
  return String(error).slice(0, 200);
}

/**
 * Check one URL. Returns null when the check couldn't be performed and should
 * be retried later without recording anything.
 */
export async function checkLink(rawUrl: string): Promise<LinkCheckResult | null> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { outcome: "failed", statusCode: null, error: "Invalid URL" };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return {
      outcome: "unsupported",
      statusCode: null,
      error: `Unsupported scheme ${url.protocol}`,
    };
  }

  try {
    // GET rather than HEAD: plenty of servers answer HEAD with 404/405 while
    // serving GET fine. The body is discarded unread.
    const res = await fetch(url.toString(), {
      method: "GET",
      redirect: "follow",
      headers: REQUEST_HEADERS,
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
    });
    await res.body?.cancel().catch(() => {});
    return classifyResponse(res.status, res.headers);
  } catch (error) {
    if (isLocalLimitError(error)) {
      console.warn(`Link check skipped for ${rawUrl}:`, error);
      return null;
    }
    return { outcome: "failed", statusCode: null, error: describeFetchError(error) };
  }
}

export type LinkCheckRecord = LinkCheckResult & { id: string; url: string };

/** Persist results via record_bookmark_link_checks (one round trip per batch). */
export async function recordLinkChecks(
  supabase: SupabaseClient<Database>,
  records: LinkCheckRecord[],
) {
  if (!records.length) return;
  const { error } = await supabase.rpc("record_bookmark_link_checks", {
    results: records.map((r) => ({
      id: r.id,
      url: r.url,
      outcome: r.outcome,
      status_code: r.statusCode,
      error: r.error,
    })),
  });
  if (error) throw error;
}
