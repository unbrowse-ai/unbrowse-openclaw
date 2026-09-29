import { test } from "node:test";
import assert from "node:assert/strict";
import { SdkDriver } from "../src/driver-sdk.ts";

/**
 * Tests inject `fetch` at the SDK boundary (per CLAUDE.md: never mock SDK
 * methods; mock at the HTTP boundary). Each fake fetch records the request
 * and returns a deterministic response.
 */
type FetchCall = { url: string; method: string; bodyJson: unknown };

function makeFetch(
  handler: (req: { url: string; method: string; bodyJson: unknown }) => {
    status?: number;
    json?: unknown;
    body?: string;
  },
): { fetch: typeof fetch; calls: FetchCall[] } {
  const calls: FetchCall[] = [];
  const fakeFetch: typeof fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const method = init?.method ?? "GET";
    let bodyJson: unknown = undefined;
    if (init?.body && typeof init.body === "string") {
      try {
        bodyJson = JSON.parse(init.body);
      } catch {
        bodyJson = init.body;
      }
    }
    calls.push({ url, method, bodyJson });
    const out = handler({ url, method, bodyJson });
    const status = out.status ?? 200;
    const body = out.body ?? JSON.stringify(out.json ?? {});
    return new Response(body, {
      status,
      headers: { "content-type": "application/json" },
    });
  };
  return { fetch: fakeFetch, calls };
}

test("SdkDriver — golden: health hits GET /health and returns ok=true", async () => {
  const { fetch: f, calls } = makeFetch(() => ({ json: { status: "ok", trace_version: "5.5.0" } }));
  const driver = new SdkDriver({ baseUrl: "http://localhost:6969", fetch: f });

  const result = await driver.call({ action: "health" });

  assert.equal(result.ok, true);
  assert.equal(result.exitCode, 0);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.method, "GET");
  assert.match(calls[0]!.url, /\/health$/);
  const parsed = JSON.parse(result.stdout) as { status?: string };
  assert.equal(parsed.status, "ok");
});

test("SdkDriver — golden: resolve POSTs to /v1/intent/resolve with intent + url", async () => {
  const { fetch: f, calls } = makeFetch(() => ({
    json: { result: { ok: 1 }, trace: { trace_id: "t_1" }, source: "marketplace" },
  }));
  const driver = new SdkDriver({ baseUrl: "http://localhost:6969", fetch: f });

  const result = await driver.call({
    action: "resolve",
    intent: "find a thing",
    url: "https://example.com/x",
    confirmUnsafe: false,
  });

  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.method, "POST");
  assert.match(calls[0]!.url, /\/v1\/intent\/resolve$/);
  const body = calls[0]!.bodyJson as Record<string, unknown>;
  assert.equal(body.intent, "find a thing");
  const params = body.params as Record<string, unknown>;
  assert.equal(params.url, "https://example.com/x");
});

test("SdkDriver — edge: search with domain branches to /v1/search/domain", async () => {
  const { fetch: f, calls } = makeFetch(() => ({ json: { results: [] } }));
  const driver = new SdkDriver({ baseUrl: "http://localhost:6969", fetch: f });

  const withDomain = await driver.call({ action: "search", intent: "x", domain: "example.com" });
  const withoutDomain = await driver.call({ action: "search", intent: "x" });

  assert.equal(withDomain.ok, true);
  assert.equal(withoutDomain.ok, true);
  assert.equal(calls.length, 2);
  assert.match(calls[0]!.url, /\/v1\/search\/domain$/);
  assert.match(calls[1]!.url, /\/v1\/search$/);
});

test("SdkDriver — edge: skills list returns ok=false and routes to CLI", async () => {
  // No fetch needed — driver short-circuits before any HTTP call.
  const { fetch: f, calls } = makeFetch(() => ({ json: {} }));
  const driver = new SdkDriver({ baseUrl: "http://localhost:6969", fetch: f });

  const result = await driver.call({ action: "skills" });

  assert.equal(result.ok, false);
  assert.equal(result.exitCode, 2);
  assert.match(result.stderr, /route to CLI driver/);
  assert.equal(calls.length, 0);
});

test("SdkDriver — edge: execute with endpointId routes to CLI (SDK gap)", async () => {
  const { fetch: f, calls } = makeFetch(() => ({ json: { result: {}, trace: {} } }));
  const driver = new SdkDriver({ baseUrl: "http://localhost:6969", fetch: f });

  const result = await driver.call({
    action: "execute",
    skillId: "skill_abc",
    endpointId: "ep_1",
  });

  assert.equal(result.ok, false);
  assert.equal(result.exitCode, 2);
  assert.match(result.stderr, /route to CLI driver/);
  assert.equal(calls.length, 0, "must not hit network when SDK gap detected");
});

test("SdkDriver — adversarial: 5xx UnbrowseApiError yields ok=false with status hint (the lost sheep)", async () => {
  const { fetch: f } = makeFetch(() => ({
    status: 503,
    json: { error: "upstream timeout" },
  }));
  const driver = new SdkDriver({ baseUrl: "http://localhost:6969", fetch: f });

  const result = await driver.call({ action: "resolve", intent: "x" });

  assert.equal(result.ok, false);
  assert.equal(result.exitCode, 1);
  assert.match(result.stderr, /unbrowse_api_error/);
  assert.match(result.stderr, /status=503/);
  assert.match(result.stderr, /upstream timeout/);
});

test("SdkDriver — adversarial: network drop (fetch throws) yields ok=false without crashing", async () => {
  const erroringFetch: typeof fetch = async () => {
    throw new TypeError("fetch failed: ECONNREFUSED");
  };
  const driver = new SdkDriver({ baseUrl: "http://localhost:6969", fetch: erroringFetch });

  const result = await driver.call({ action: "health" });

  assert.equal(result.ok, false);
  assert.equal(result.exitCode, 1);
  assert.match(result.stderr, /ECONNREFUSED/);
});
