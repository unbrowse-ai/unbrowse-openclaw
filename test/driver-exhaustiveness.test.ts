import { test } from "node:test";
import assert from "node:assert/strict";
import { assertNever, type DriverAction, type DriverActionInput } from "../src/driver.ts";

/**
 * Compile-time luminary: this dispatch covers every variant of `DriverAction`.
 * If a future contributor adds a new action to the union without adding a case
 * here, `assertNever(input)` raises a TS2345 at build time. The runtime
 * assertion below also fails fast.
 */
function dispatch(input: DriverActionInput): DriverAction {
  switch (input.action) {
    case "health":
    case "skills":
    case "skill":
    case "login":
    case "search":
    case "resolve":
    case "execute":
      return input.action;
    default:
      return assertNever(input);
  }
}

test("DriverAction — exhaustive switch covers every variant", () => {
  const variants: DriverActionInput[] = [
    { action: "health" },
    { action: "skills" },
    { action: "skill", skillId: "s" },
    { action: "login", url: "https://x" },
    { action: "search", intent: "i" },
    { action: "resolve", intent: "i" },
    { action: "execute", skillId: "s" },
  ];
  for (const v of variants) {
    assert.equal(dispatch(v), v.action);
  }
});

test("assertNever — throws on a manufactured non-never call", () => {
  // Narrow escape: cast to `never` to exercise the throw path at runtime.
  // No real caller can do this; it exists to prove the throw fires.
  assert.throws(
    () => assertNever({ action: "ghost" } as unknown as never),
    /Unhandled DriverAction/,
  );
});
