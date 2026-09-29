import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

function extractActionLiterals(source: string, startMarker: string): string[] {
  const idx = source.indexOf(startMarker);
  assert.ok(idx >= 0, `marker not found: ${startMarker}`);
  // Walk from the marker until the first `;` at brace-depth 0 — the close
  // of the type declaration.
  let depth = 0;
  let end = source.length;
  for (let i = idx; i < source.length; i++) {
    const ch = source[i];
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
    else if (ch === ";" && depth === 0) {
      end = i;
      break;
    }
  }
  const slice = source.slice(idx, end);
  // Collect every lowercase-word string literal in the scope. Both shapes
  // (discriminated union: `| { action: "health" } | ...` and inline union:
  // `action: "a" | "b" | ...`) reduce to the same set of literals here.
  const literals = Array.from(slice.matchAll(/"([a-z_]+)"/g)).map((m) => m[1]!);
  return Array.from(new Set(literals)).sort();
}

test("driver.ts and index.ts agree on the DriverAction set (firmament parity)", () => {
  const driverSrc = readFileSync(join(root, "src", "driver.ts"), "utf8");
  const indexSrc = readFileSync(join(root, "index.ts"), "utf8");

  const driverActions = extractActionLiterals(driverSrc, "export type DriverActionInput");
  const indexActions = extractActionLiterals(indexSrc, "type ToolParams");

  assert.ok(driverActions.length > 0, "driver.ts: failed to extract any actions");
  assert.ok(indexActions.length > 0, "index.ts: failed to extract any actions");
  assert.deepEqual(
    driverActions,
    indexActions,
    `firmament drift: driver.ts has [${driverActions.join(",")}], index.ts has [${indexActions.join(",")}]`,
  );
});
