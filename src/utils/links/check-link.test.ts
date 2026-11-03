import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { checkLink, classifyResponse } from "./check-link";

const noHeaders = new Headers();

describe("classifyResponse", () => {
  test.each([200, 204, 301, 302, 304])("%i is ok", (status) => {
    expect(classifyResponse(status, noHeaders).outcome).toBe("ok");
  });

  test.each([401, 403, 429])("%i (bot protection / auth / rate limit) is not broken", (status) => {
    expect(classifyResponse(status, noHeaders).outcome).toBe("ok");
  });

  test.each([404, 410])("%i is a failure", (status) => {
    expect(classifyResponse(status, noHeaders)).toEqual({
      outcome: "failed",
      statusCode: status,
      error: null,
    });
  });

  test.each([500, 502, 503, 504])("%i is a failure", (status) => {
    expect(classifyResponse(status, noHeaders).outcome).toBe("failed");
  });

  test("a Cloudflare challenge 503 is not a failure", () => {
    const headers = new Headers({ "cf-mitigated": "challenge" });
    expect(classifyResponse(503, headers).outcome).toBe("ok");
  });
});

describe("checkLink", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("non-http schemes are unsupported, not broken", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect((await checkLink("mailto:someone@example.com"))?.outcome).toBe("unsupported");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("an unparseable URL is a failure", async () => {
    expect(await checkLink("not a url")).toEqual({
      outcome: "failed",
      statusCode: null,
      error: "Invalid URL",
    });
  });

  test("an unreachable host is a failure with the error message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("DNS lookup failed")));
    expect(await checkLink("https://gone.example")).toEqual({
      outcome: "failed",
      statusCode: null,
      error: "DNS lookup failed",
    });
  });

  test("a timeout is reported as such", async () => {
    const timeout = new DOMException("The operation timed out.", "TimeoutError");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(timeout));
    expect((await checkLink("https://slow.example"))?.error).toBe("Timed out");
  });

  test("running out of Worker subrequests is not held against the link", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Too many subrequests.")));
    expect(await checkLink("https://example.com")).toBeNull();
  });

  test("uses the response status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("nope", { status: 404 })));
    expect((await checkLink("https://example.com/missing"))?.outcome).toBe("failed");
  });
});
