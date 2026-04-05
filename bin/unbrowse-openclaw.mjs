#!/usr/bin/env node

import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageDir = path.resolve(__dirname, "..");
const installScript = path.join(packageDir, "scripts", "install-openclaw.sh");

function printHelp() {
  process.stdout.write(`unbrowse-openclaw

Usage:
  unbrowse-openclaw install [options]
  npx unbrowse-openclaw install [options]

Commands:
  install    Install and configure the OpenClaw plugin with sticky Unbrowse routing

Notes:
  - Package installs default to --copy so npx/global runs do not leave a broken linked path.
  - The package depends on the npm \`unbrowse\` CLI/runtime automatically.
  - OpenClaw must already be installed.
`);
}

const args = process.argv.slice(2);
const command = args[0];

if (!command || command === "-h" || command === "--help" || command === "help") {
  printHelp();
  process.exit(0);
}

if (command !== "install") {
  process.stderr.write(`Unknown command: ${command}\n`);
  printHelp();
  process.exit(1);
}

if (!existsSync(installScript)) {
  process.stderr.write(`Missing installer: ${installScript}\n`);
  process.exit(1);
}

const forwarded = args.slice(1);
const hasInstallMode = forwarded.includes("--copy") || forwarded.includes("--link");
const installArgs = [installScript, ...(hasInstallMode ? [] : ["--copy"]), ...forwarded];

// Find a bash-compatible shell — required for the installer script.
// On Windows, Git for Windows provides bash at common paths.
function findShell() {
  if (process.platform !== "win32") return "bash";
  const candidates = [
    "bash",
    "C:\\Program Files\\Git\\bin\\bash.exe",
    "C:\\Program Files (x86)\\Git\\bin\\bash.exe",
  ];
  for (const shell of candidates) {
    const check = spawnSync(shell, ["--version"], { stdio: "ignore" });
    if (check.status === 0) return shell;
  }
  return null;
}

const shell = findShell();
if (!shell) {
  process.stderr.write(
    `Error: bash not found. On Windows, install Git for Windows (https://git-scm.com) which includes bash.\n` +
    `Alternatively, install manually:\n` +
    `  1. npm install -g unbrowse-openclaw\n` +
    `  2. Copy node_modules/unbrowse-openclaw to %USERPROFILE%\\.openclaw\\extensions\\unbrowse-openclaw\n` +
    `  3. Run: openclaw config set plugins.allow '["unbrowse-openclaw"]' --strict-json\n` +
    `  4. Run: openclaw config set plugins.entries.unbrowse-openclaw.enabled true --strict-json\n`
  );
  process.exit(1);
}

const result = spawnSync(shell, installArgs, {
  cwd: packageDir,
  stdio: "inherit",
});

if (result.error) {
  process.stderr.write(`${String(result.error)}\n`);
  process.exit(1);
}

process.exit(result.status ?? 1);
