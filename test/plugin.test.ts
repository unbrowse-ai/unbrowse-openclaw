import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

test("exports plugin metadata", async () => {
  const mod = await import("../index.ts");
  const plugin = mod.default as { id?: string; name?: string; register?: unknown };

  assert.equal(plugin.id, "unbrowse-openclaw");
  assert.equal(plugin.name, "Unbrowse Browser");
  assert.equal(typeof plugin.register, "function");
});

test("strict mode bootstrap guide forbids browser fallback", async () => {
  const mod = await import("../index.ts");
  const guide = mod.__test.buildBootstrapGuide(mod.__test.normalizeConfig({ routingMode: "strict" }));

  assert.match(guide, /strict mode/i);
  assert.match(guide, /Do not use `browser`/);
});

test("fallback mode config keeps browser available", async () => {
  const mod = await import("../index.ts");
  const snippet = mod.__test.buildSuggestedConfig("fallback");

  assert.match(snippet, /"unbrowse-openclaw"/);
  assert.match(snippet, /allow: \["unbrowse-openclaw"\]/);
  assert.match(snippet, /allowBrowserFallback: true/);
  assert.match(snippet, /\/absolute\/path\/to\/unbrowse-openclaw/);
  assert.doesNotMatch(snippet, /submodules\/openclaw-unbrowse-plugin/);
  assert.doesNotMatch(snippet, /slots:/);
  assert.doesNotMatch(snippet, /deny: \["browser"\]/);
});

test("resolve action maps to unbrowse CLI args", async () => {
  const mod = await import("../index.ts");
  const args = mod.__test.buildArgs({
    action: "resolve",
    intent: "get prices",
    url: "https://example.com",
    path: "data.items[]",
    extract: "title,price",
    limit: 5,
    dryRun: true,
  });

  assert.deepEqual(args, [
    "resolve",
    "--intent",
    "get prices",
    "--url",
    "https://example.com",
    "--path",
    "data.items[]",
    "--extract",
    "title,price",
    "--limit",
    "5",
    "--dry-run",
  ]);
});

test("before-agent guidance makes unbrowse the default web path", async () => {
  const mod = await import("../index.ts");
  const guide = mod.__test.buildBootstrapGuide(mod.__test.normalizeConfig({ routingMode: "strict" }));
  const systemPrompt = mod.__test.buildBeforeAgentStartGuidance(
    mod.__test.normalizeConfig({ routingMode: "strict" }),
  );

  assert.match(guide, /Use `unbrowse` as the default web path/);
  assert.match(systemPrompt, /`unbrowse` tool is the preferred website path/);
  assert.match(systemPrompt, /Strict mode is on/);
});

test("strict mode block reason points agents back to the Unbrowse path", async () => {
  const mod = await import("../index.ts");
  const reason = mod.__test.buildBrowserFallbackBlockReason();

  assert.match(reason, /`browser` is disabled/);
  assert.match(reason, /Use `unbrowse`/);
});

test("trusted install guide explains the local-load path", async () => {
  const mod = await import("../index.ts");
  const guide = mod.__test.buildTrustedInstallGuide("strict");

  assert.match(guide, /Trusted local-load path/);
  assert.match(guide, /node:child_process/);
  assert.match(guide, /process\.env/);
  assert.match(guide, /allow: \["unbrowse-openclaw"\]/);
});

test("plugin manifest ships the browser-routing skill", () => {
  const manifest = JSON.parse(
    readFileSync(new URL("../openclaw.plugin.json", import.meta.url), "utf8"),
  ) as { skills?: string[] };

  assert.deepEqual(manifest.skills, ["./skills"]);
  assert.match(
    readFileSync(new URL("../skills/unbrowse-browser/SKILL.md", import.meta.url), "utf8"),
    /Route website tasks through the Unbrowse-backed browser path/,
  );
});

test("package exposes the npm installer bin", () => {
  const pkg = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  ) as { bin?: Record<string, string>; dependencies?: Record<string, string> };

  assert.equal(pkg.bin?.["unbrowse-openclaw"], "./bin/unbrowse-openclaw.mjs");
  assert.equal(pkg.dependencies?.unbrowse, "^2.10.2");
  assert.equal(pkg.dependencies?.bs58, "^6.0.0");
  assert.equal(pkg.dependencies?.["@solana/kit"], "^6.6.0");
  assert.equal(pkg.dependencies?.["@cascade-fyi/splits-sdk"], "^0.11.1");
});

test("npm pack tarball keeps the installer entrypoints and runtime deps", () => {
  const packageDir = fileURLToPath(new URL("..", import.meta.url));
  const packDir = mkdtempSync(join(tmpdir(), "unbrowse-openclaw-pack-"));
  const extractDir = mkdtempSync(join(tmpdir(), "unbrowse-openclaw-tar-"));

  try {
    const pack = spawnSync("npm", ["pack", "--json", "--pack-destination", packDir], {
      cwd: packageDir,
      encoding: "utf8",
    });

    assert.equal(pack.status, 0, pack.stderr || pack.stdout);

    const [tarball] = JSON.parse(pack.stdout) as Array<{
      filename: string;
      files: Array<{ path: string }>;
    }>;

    assert.ok(tarball);
    assert.ok(tarball.files.some((entry) => entry.path === "bin/unbrowse-openclaw.mjs"));
    assert.ok(tarball.files.some((entry) => entry.path === "scripts/install-openclaw.sh"));

    const unpack = spawnSync("tar", ["-xzf", join(packDir, tarball.filename), "-C", extractDir], {
      encoding: "utf8",
    });

    assert.equal(unpack.status, 0, unpack.stderr || unpack.stdout);

    const packedPkg = JSON.parse(readFileSync(join(extractDir, "package", "package.json"), "utf8")) as {
      bin?: Record<string, string>;
      files?: string[];
      dependencies?: Record<string, string>;
    };

    assert.equal(packedPkg.bin?.["unbrowse-openclaw"], "./bin/unbrowse-openclaw.mjs");
    assert.ok(packedPkg.files?.includes("bin"));
    assert.ok(packedPkg.files?.includes("scripts"));
    assert.equal(packedPkg.dependencies?.unbrowse, "^2.10.2");
    assert.equal(packedPkg.dependencies?.bs58, "^6.0.0");
    assert.equal(packedPkg.dependencies?.["@solana/kit"], "^6.6.0");
    assert.equal(packedPkg.dependencies?.["@cascade-fyi/splits-sdk"], "^0.11.1");
  } finally {
    rmSync(packDir, { force: true, recursive: true });
    rmSync(extractDir, { force: true, recursive: true });
  }
});

test("resolveUnbrowseBin follows the installed package bin entry", async () => {
  const mod = await import("../index.ts");
  const unbrowsePkgPath = new URL("../node_modules/unbrowse/package.json", import.meta.url);
  const unbrowsePkg = JSON.parse(readFileSync(unbrowsePkgPath, "utf8")) as { bin?: string | Record<string, string> };
  const declaredBin =
    typeof unbrowsePkg.bin === "string"
      ? unbrowsePkg.bin
      : unbrowsePkg.bin?.unbrowse;

  assert.equal(typeof declaredBin, "string");
  assert.equal(
    mod.__test.resolveUnbrowseBin(mod.__test.normalizeConfig({})),
    new URL(`../node_modules/unbrowse/${declaredBin}`, import.meta.url).pathname,
  );
});

test("plugin tool executes against an explicit binPath", async () => {
  const mod = await import("../index.ts");
  const tools: Array<{ execute: (toolCallId: string, params: Record<string, unknown>) => Promise<unknown> }> = [];
  const hooks: unknown[] = [];
  const services: unknown[] = [];
  const scriptDir = mkdtempSync(join(tmpdir(), "unbrowse-openclaw-bin-"));
  const fakeCliPath = join(scriptDir, "fake-unbrowse.mjs");

  writeFileSync(
    fakeCliPath,
    [
      "#!/usr/bin/env node",
      "const action = process.argv[2] ?? 'unknown';",
      "process.stdout.write(JSON.stringify({ message: `fake ${action} ok`, args: process.argv.slice(2) }));",
    ].join("\n"),
  );
  chmodSync(fakeCliPath, 0o755);

  const api = {
    pluginConfig: { routingMode: "strict", healthcheckOnStart: false, binPath: fakeCliPath },
    logger: { info() {}, warn() {} },
    registerTool(tool: { execute: (toolCallId: string, params: Record<string, unknown>) => Promise<unknown> }) {
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

  mod.default.register(api as never);
  assert.equal(tools.length, 1);
  assert.equal(hooks.length, 3);
  assert.equal(services.length, 1);

  const result = await tools[0].execute("tool-call", { action: "health" }) as {
    details?: { ok?: boolean; result?: { args?: string[] } };
    content?: Array<{ text?: string }>;
  };

  assert.equal(result.details?.ok, true);
  assert.deepEqual(result.details?.result?.args, ["health"]);
  assert.match(result.content?.[0]?.text ?? "", /fake health ok/);
});

test("bundled unbrowse bin resolves from package metadata", async () => {
  const mod = await import("../index.ts");
  const unbrowsePkg = JSON.parse(
    readFileSync(new URL("../node_modules/unbrowse/package.json", import.meta.url), "utf8"),
  ) as { bin?: string | Record<string, string> };
  const declaredBin =
    typeof unbrowsePkg.bin === "string"
      ? unbrowsePkg.bin
      : typeof unbrowsePkg.bin?.unbrowse === "string"
        ? unbrowsePkg.bin.unbrowse
        : "";
  const binPath = mod.__test.resolveUnbrowseBin(mod.__test.normalizeConfig({}));

  assert.equal(
    binPath,
    new URL(`../node_modules/unbrowse/${declaredBin || "bin/unbrowse-wrapper.mjs"}`, import.meta.url)
      .pathname,
  );
});
