import { test } from "node:test";
import assert from "node:assert/strict";
import {
  commandResultFromError,
  commandResultFromJson,
  type CommandResult,
  type DriverActionInput,
  type UnbrowseDriver,
} from "../src/driver.ts";

class RecordingDriver implements UnbrowseDriver {
  readonly kind = "sdk" as const;
  readonly calls: DriverActionInput[] = [];

  async call(input: DriverActionInput): Promise<CommandResult> {
    this.calls.push(input);
    if (input.action === "health") {
      return commandResultFromJson({ status: "ok", version: "0.0.0-test" });
    }
    return commandResultFromError(new Error(`unimplemented: ${input.action}`));
  }
}

test("UnbrowseDriver — interface accepts the full action union", async () => {
  const driver: UnbrowseDriver = new RecordingDriver();

  const inputs: DriverActionInput[] = [
    { action: "health" },
    { action: "skills" },
    { action: "skill", skillId: "skill_abc" },
    { action: "login", url: "https://example.com" },
    { action: "search", intent: "find me a thing", domain: "example.com", k: 5 },
    { action: "resolve", intent: "do the task", url: "https://example.com/x", confirmUnsafe: false },
    { action: "execute", skillId: "skill_abc", endpointId: "ep_1", path: "$.items", limit: 10 },
  ];

  for (const input of inputs) {
    const result = await driver.call(input);
    assert.equal(typeof result.ok, "boolean");
    assert.equal(typeof result.stdout, "string");
    assert.equal(typeof result.stderr, "string");
    assert.ok(result.exitCode === null || typeof result.exitCode === "number");
  }
});

test("UnbrowseDriver — health returns ok=true with stdout JSON", async () => {
  const driver = new RecordingDriver();
  const result = await driver.call({ action: "health" });

  assert.equal(result.ok, true);
  assert.equal(result.exitCode, 0);
  assert.equal(result.stderr, "");
  const parsed = JSON.parse(result.stdout) as { status?: string };
  assert.equal(parsed.status, "ok");
  assert.equal(driver.calls.length, 1);
  assert.equal(driver.calls[0]?.action, "health");
});

test("UnbrowseDriver — kind is sdk or cli", () => {
  const driver: UnbrowseDriver = new RecordingDriver();
  assert.ok(driver.kind === "sdk" || driver.kind === "cli");
});

test("commandResultFromError — wraps errors into a non-ok CommandResult", () => {
  const result = commandResultFromError(new Error("boom"));
  assert.equal(result.ok, false);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /boom/);
  assert.equal(result.exitCode, 1);
});

test("commandResultFromError — non-Error throwables (the lost sheep)", () => {
  // Symbol used to crash the coercer via String(Symbol). It must not now.
  const sym = commandResultFromError(Symbol("oops"));
  assert.equal(sym.ok, false);
  assert.match(sym.stderr, /oops/);

  // null / undefined yield stable strings (regression guard).
  assert.equal(commandResultFromError(null).stderr, "null");
  assert.equal(commandResultFromError(undefined).stderr, "undefined");

  // Plain object — current behavior pinned to detect drift.
  assert.equal(commandResultFromError({ code: "E_X" }).stderr, "[object Object]");

  // Empty-message Error falls back to the name rather than producing an empty stderr.
  const emptyErr = commandResultFromError(new Error(""));
  assert.equal(emptyErr.stderr, "Error");

  // Primitive coercions stay readable.
  assert.equal(commandResultFromError(42).stderr, "42");
  assert.equal(commandResultFromError("boom-string").stderr, "boom-string");
});
