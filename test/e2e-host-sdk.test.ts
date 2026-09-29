import { test } from "node:test";
import assert from "node:assert/strict";

/**
 * Day-6 dominion E2E: load the plugin module exactly the way OpenClaw would,
 * call register() against a fake host api, capture the registered tool, then
 * invoke tool.execute(...) — the full chain with `globalThis.fetch` stubbed
 * at the boundary. Asserts that the SDK driver is the default code path.
 */

type ToolEntry = {
  execute: (toolCallId: string, params: Record<string, unknown>) => Promise<{
    content?: Array<{ text?: string }>;
    details?: Record<string, unknown>;
  }>;
};

function makeFakeApi(tools: ToolEntry[], hooks: unknown[], services: unknown[], pluginConfig: Record<string, unknown>) {
  return {
    pluginConfig,
    logger: { info() {}, warn() {}, error() {} },
    registerTool(tool: ToolEntry) {
      tools.push(tool);
    },
    registerHook(...args: unknown[]) {
      hooks.push(args);
    },
    registerCli(fn: ({ program }: { program: { command: () => unknown } }) => void) {
      const chain = {
        description() { return chain; },
        argument() { return chain; },
        action() { return chain; },
        command() { return chain; },
      };
      fn({ program: { command: () => chain } });
    },
    registerService(service: unknown) {
      services.push(service);
    },
  };
}

test("E2E: host → tool.execute('health') runs through SDK driver by default and hits /health", async () => {
  const calls: Array<{ url: string; method: string }> = [];
  const originalFetch = globalThis.fetch;
  // Stub global fetch — SdkDriver constructed without explicit fetch picks
  // up whatever globalThis.fetch is at the time of the request.
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url;
    calls.push({ url, method: init?.method ?? "GET" });
    return new Response(JSON.stringify({ status: "ok", trace_version: "test" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const mod = await import("../index.ts");
    const tools: ToolEntry[] = [];
    const hooks: unknown[] = [];
    const services: unknown[] = [];

    // No `driver` set → defaults to "sdk". baseUrl provided so SdkDriver
    // hits a known host. healthcheckOnStart off so the registerService
    // hook doesn't auto-call fetch on boot.
    const api = makeFakeApi(tools, hooks, services, {
      routingMode: "strict",
      healthcheckOnStart: false,
      baseUrl: "http://localhost:6969",
      binPath: "/usr/bin/true", // satisfies resolveUnbrowseBin without needing a real bin
    });

    mod.default.register(api as never);
    assert.equal(tools.length, 1, "exactly one tool registered");

    const result = await tools[0]!.execute("call-1", { action: "health" });

    assert.equal(result.details?.ok, true, "tool returned ok=true");
    assert.equal(result.details?.via, "sdk", "execution went through SDK driver");
    assert.equal(result.details?.action, "health");
    assert.equal(calls.length, 1, "exactly one fetch happened");
    assert.match(calls[0]!.url, /\/health$/);
    assert.equal(calls[0]!.method, "GET");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("E2E: SDK gap (skills list) falls through to CLI driver, single tool call yields via=cli", async () => {
  const fetchCalls: string[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url;
    fetchCalls.push(url);
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;

  // Fake CLI script that records being called and returns a fake skills list.
  const { mkdtempSync, writeFileSync, chmodSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const tmp = mkdtempSync(join(tmpdir(), "unbrowse-e2e-fallback-"));
  const fakeCli = join(tmp, "fake-cli.mjs");
  writeFileSync(
    fakeCli,
    [
      "#!/usr/bin/env node",
      "process.stdout.write(JSON.stringify({ skills: ['fake-skill'] }));",
    ].join("\n"),
  );
  chmodSync(fakeCli, 0o755);

  try {
    const mod = await import("../index.ts");
    const tools: ToolEntry[] = [];
    const hooks: unknown[] = [];
    const services: unknown[] = [];

    // driver: "sdk" (default) — but action 'skills' has no SDK method, so
    // the SdkDriver returns exitCode=2 and the host should route to CLI.
    const api = makeFakeApi(tools, hooks, services, {
      routingMode: "strict",
      healthcheckOnStart: false,
      baseUrl: "http://localhost:6969",
      binPath: fakeCli,
    });

    mod.default.register(api as never);
    const result = await tools[0]!.execute("call-skills", { action: "skills" });

    assert.equal(result.details?.ok, true, "fallback CLI succeeded");
    assert.equal(result.details?.via, "cli", "host routed to CLI after SDK gap");
    assert.equal(fetchCalls.length, 0, "no fetch happened — SDK gap short-circuited before HTTP");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
