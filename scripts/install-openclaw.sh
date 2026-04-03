#!/usr/bin/env bash

set -euo pipefail

MODE="strict"
INSTALL_MODE="link"
RESTART_GATEWAY=0
KEEP_TOOLS_PROFILE=0
PLUGIN_PATH=""
PROFILE_NAME=""
declare -a OPENCLAW_SCOPE=()

usage() {
  cat <<'EOF'
Usage: bash scripts/install-openclaw.sh [options]

Installs and configures the Unbrowse OpenClaw plugin so it stays sticky.

Options:
  --mode <strict|fallback>  Routing mode to write into plugin config (default: strict)
  --strict                  Shortcut for --mode strict
  --fallback                Shortcut for --mode fallback
  --link                    Link the local plugin path into OpenClaw (default)
  --copy                    Copy the plugin into OpenClaw instead of linking
  --restart                 Restart the OpenClaw gateway service after config writes
  --keep-tools-profile      Do not unset tools.profile
  --dev                     Target the OpenClaw dev profile
  --profile <name>          Target a named OpenClaw profile
  --plugin-path <path>      Override plugin path
  -h, --help                Show this help
EOF
}

log() {
  printf '[unbrowse-openclaw] %s\n' "$*"
}

warn() {
  printf '[unbrowse-openclaw] warn: %s\n' "$*" >&2
}

die() {
  printf '[unbrowse-openclaw] error: %s\n' "$*" >&2
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode)
      [[ $# -ge 2 ]] || die "--mode requires a value"
      MODE="$2"
      shift 2
      ;;
    --strict)
      MODE="strict"
      shift
      ;;
    --fallback)
      MODE="fallback"
      shift
      ;;
    --link)
      INSTALL_MODE="link"
      shift
      ;;
    --copy)
      INSTALL_MODE="copy"
      shift
      ;;
    --restart)
      RESTART_GATEWAY=1
      shift
      ;;
    --keep-tools-profile)
      KEEP_TOOLS_PROFILE=1
      shift
      ;;
    --dev)
      OPENCLAW_SCOPE=(--dev)
      shift
      ;;
    --profile)
      [[ $# -ge 2 ]] || die "--profile requires a value"
      PROFILE_NAME="$2"
      OPENCLAW_SCOPE=(--profile "$PROFILE_NAME")
      shift 2
      ;;
    --plugin-path)
      [[ $# -ge 2 ]] || die "--plugin-path requires a value"
      PLUGIN_PATH="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      die "unknown argument: $1"
      ;;
  esac
done

if [[ "$MODE" != "strict" && "$MODE" != "fallback" ]]; then
  die "--mode must be strict or fallback"
fi

if [[ -z "$PLUGIN_PATH" ]]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  PLUGIN_PATH="$(cd "$SCRIPT_DIR/.." && pwd)"
fi
PLUGIN_PATH="$(cd "$PLUGIN_PATH" && pwd)"

[[ -f "$PLUGIN_PATH/package.json" ]] || die "package.json not found under $PLUGIN_PATH"
[[ -f "$PLUGIN_PATH/openclaw.plugin.json" ]] || die "openclaw.plugin.json not found under $PLUGIN_PATH"

command -v openclaw >/dev/null 2>&1 || die "openclaw CLI not found on PATH"
command -v node >/dev/null 2>&1 || die "node not found on PATH"

PLUGIN_ID="$(
  node -e '
    const fs = require("node:fs");
    const pkg = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    process.stdout.write(typeof pkg.name === "string" && pkg.name ? pkg.name : "unbrowse-openclaw");
  ' "$PLUGIN_PATH/package.json"
)"

oc() {
  if declare -p OPENCLAW_SCOPE >/dev/null 2>&1 && ((${#OPENCLAW_SCOPE[@]})); then
    openclaw "${OPENCLAW_SCOPE[@]}" "$@"
  else
    openclaw "$@"
  fi
}

resolve_state_dir() {
  if [[ -n "${OPENCLAW_STATE_DIR:-}" ]]; then
    printf '%s' "$OPENCLAW_STATE_DIR"
    return
  fi

  if [[ "${#OPENCLAW_SCOPE[@]}" -gt 0 ]]; then
    case "${OPENCLAW_SCOPE[0]}" in
      --dev)
        printf '%s' "$HOME/.openclaw-dev"
        return
        ;;
      --profile)
        [[ -n "$PROFILE_NAME" ]] || die "profile name missing"
        printf '%s' "$HOME/.openclaw-$PROFILE_NAME"
        return
        ;;
    esac
  fi

  printf '%s' "$HOME/.openclaw"
}

config_get_json() {
  local path="$1"
  local value=""
  value="$(oc config get "$path" --json 2>/dev/null || true)"
  printf '%s' "$value"
}

merge_allowlist() {
  CURRENT_JSON="$1" TARGET_ID="$2" node <<'NODE'
const raw = (process.env.CURRENT_JSON || "").trim();
let current = [];
if (raw) {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) current = parsed.filter((entry) => typeof entry === "string" && entry.trim());
  } catch {}
}
const merged = Array.from(new Set([...current, process.env.TARGET_ID].filter(Boolean)));
process.stdout.write(JSON.stringify(merged));
NODE
}

rewrite_load_paths() {
  CURRENT_JSON="$1" TARGET_ID="$2" TARGET_PATH="$3" node <<'NODE'
const fs = require("node:fs");
const path = require("node:path");

const raw = (process.env.CURRENT_JSON || "").trim();
const targetId = process.env.TARGET_ID || "";
let current = [];

if (raw) {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) current = parsed.filter((entry) => typeof entry === "string" && entry.trim());
  } catch {}
}

function pluginIdForPath(input) {
  try {
    const pkgPath = path.join(input, "package.json");
    if (!fs.existsSync(pkgPath)) return null;
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    const pkgName = typeof pkg.name === "string" ? pkg.name.replace(/^@[^/]+\//, "") : "";
    return pkgName || null;
  } catch {
    return null;
  }
}

const rewritten = current.filter((entry) => pluginIdForPath(entry) !== targetId);
process.stdout.write(JSON.stringify(Array.from(new Set(rewritten))));
NODE
}

merge_plugin_config() {
  CURRENT_JSON="$1" MODE_VALUE="$2" node <<'NODE'
const raw = (process.env.CURRENT_JSON || "").trim();
const mode = process.env.MODE_VALUE === "fallback" ? "fallback" : "strict";
let current = {};
if (raw) {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) current = parsed;
  } catch {}
}
const timeoutMs = Number.isInteger(current.timeoutMs) ? current.timeoutMs : 120000;
const merged = {
  ...current,
  routingMode: mode,
  preferInBootstrap: true,
  allowBrowserFallback: mode === "fallback",
  timeoutMs,
};
process.stdout.write(JSON.stringify(merged));
NODE
}

replace_install_target() {
  local source_path="$1"
  local target_path="$2"
  local backup_path=""

  mkdir -p "$(dirname "$target_path")"

  if [[ -e "$target_path" || -L "$target_path" ]]; then
    backup_path="${TMPDIR:-/tmp}/$(basename "$target_path").bak.$(date +%s)"
    mv "$target_path" "$backup_path"
    log "moved existing install aside: $backup_path"
  fi

  mv "$source_path" "$target_path"
}

cleanup_stale_backups() {
  local target_path="$1"
  local stale_path=""

  while IFS= read -r stale_path; do
    [[ -n "$stale_path" ]] || continue
    local relocated_path="${TMPDIR:-/tmp}/$(basename "$stale_path")"
    mv "$stale_path" "$relocated_path"
    log "moved stale backup aside: $relocated_path"
  done < <(find "$(dirname "$target_path")" -maxdepth 1 -mindepth 1 -name "$(basename "$target_path").bak.*" -print 2>/dev/null || true)
}

copy_plugin_into_target() {
  local source_dir="$1"
  local target_dir="$2"
  local stage_dir

  stage_dir="$(mktemp -d "${TMPDIR:-/tmp}/unbrowse-openclaw-copy.XXXXXX")"
  cp -R "$source_dir" "$stage_dir/package"
  replace_install_target "$stage_dir/package" "$target_dir"
  rmdir "$stage_dir" 2>/dev/null || true
}

install_target_dependencies() {
  local target_dir="$1"
  log "installing runtime dependencies in $target_dir"
  (
    cd "$target_dir"
    npm install --omit=dev --no-audit --no-fund
  )
}

link_plugin_into_target() {
  local source_dir="$1"
  local target_dir="$2"
  local link_dir

  link_dir="$(mktemp -d "${TMPDIR:-/tmp}/unbrowse-openclaw-link.XXXXXX")"
  rm -rf "$link_dir"
  ln -s "$source_dir" "$link_dir"
  replace_install_target "$link_dir" "$target_dir"
}

inspect_profile_footguns() {
  local by_provider_json agents_json
  by_provider_json="$(config_get_json "tools.byProvider")"
  agents_json="$(config_get_json "agents.list")"

  CURRENT_JSON="$by_provider_json" node <<'NODE'
const raw = (process.env.CURRENT_JSON || "").trim();
if (!raw) process.exit(0);
try {
  const parsed = JSON.parse(raw);
  const offenders = Object.entries(parsed ?? {})
    .filter(([, value]) => value && typeof value === "object" && typeof value.profile === "string" && value.profile.trim())
    .map(([key, value]) => `${key}:${value.profile}`);
  if (offenders.length > 0) {
    process.stderr.write(
      `[unbrowse-openclaw] warn: tools.byProvider profiles may still hide plugin tools: ${offenders.join(", ")}\n`,
    );
  }
} catch {}
NODE

  CURRENT_JSON="$agents_json" node <<'NODE'
const raw = (process.env.CURRENT_JSON || "").trim();
if (!raw) process.exit(0);
try {
  const parsed = JSON.parse(raw);
  const offenders = Array.isArray(parsed)
    ? parsed
        .map((entry, index) => {
          const profile = entry?.tools?.profile;
          const id = typeof entry?.id === "string" && entry.id ? entry.id : `index:${index}`;
          return typeof profile === "string" && profile.trim() ? `${id}:${profile}` : null;
        })
        .filter(Boolean)
    : [];
  if (offenders.length > 0) {
    process.stderr.write(
      `[unbrowse-openclaw] warn: per-agent tools.profile values may still hide plugin tools: ${offenders.join(", ")}\n`,
    );
  }
} catch {}
NODE
}

STATE_DIR="$(resolve_state_dir)"
EXTENSIONS_DIR="$STATE_DIR/extensions"
TARGET_PATH="$EXTENSIONS_DIR/$PLUGIN_ID"
PLUGIN_VERSION="$(
  node -e '
    const fs = require("node:fs");
    const pkg = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    process.stdout.write(typeof pkg.version === "string" ? pkg.version : "0.0.0");
  ' "$PLUGIN_PATH/package.json"
)"

log "installing plugin from $PLUGIN_PATH into $TARGET_PATH ($INSTALL_MODE, mode=$MODE)"
cleanup_stale_backups "$TARGET_PATH"
if [[ "$INSTALL_MODE" == "copy" ]]; then
  copy_plugin_into_target "$PLUGIN_PATH" "$TARGET_PATH"
  install_target_dependencies "$TARGET_PATH"
else
  link_plugin_into_target "$PLUGIN_PATH" "$TARGET_PATH"
fi

ALLOWLIST_JSON="$(merge_allowlist "$(config_get_json "plugins.allow")" "$PLUGIN_ID")"
LOAD_PATHS_JSON="$(rewrite_load_paths "$(config_get_json "plugins.load.paths")" "$PLUGIN_ID" "$TARGET_PATH")"
ENTRY_CONFIG_JSON="$(merge_plugin_config "$(config_get_json "plugins.entries.$PLUGIN_ID.config")" "$MODE")"
CURRENT_TOOLS_PROFILE="$(config_get_json "tools.profile")"
INSTALL_RECORD_JSON="$(
  SOURCE_PATH_VALUE="$PLUGIN_PATH" TARGET_PATH_VALUE="$TARGET_PATH" VERSION_VALUE="$PLUGIN_VERSION" INSTALL_MODE_VALUE="$INSTALL_MODE" node <<'NODE'
const installMode = process.env.INSTALL_MODE_VALUE || "copy";
const targetPath = process.env.TARGET_PATH_VALUE || "";
const sourcePath = installMode === "copy" ? targetPath : process.env.SOURCE_PATH_VALUE || targetPath;
const version = process.env.VERSION_VALUE || "0.0.0";
const record = {
  source: "path",
  sourcePath,
  installPath: targetPath,
  version,
  installedAt: new Date().toISOString(),
};
process.stdout.write(JSON.stringify(record));
NODE
)"

log "merging plugins.allow"
oc config set plugins.allow "$ALLOWLIST_JSON" --strict-json

log "cleaning plugins.load.paths"
oc config set plugins.load.paths "$LOAD_PATHS_JSON" --strict-json

log "enabling plugin entry"
oc config set "plugins.entries.$PLUGIN_ID.enabled" "true" --strict-json
oc config set "plugins.entries.$PLUGIN_ID.config" "$ENTRY_CONFIG_JSON" --strict-json
oc config set "plugins.installs.$PLUGIN_ID" "$INSTALL_RECORD_JSON" --strict-json

if [[ "$KEEP_TOOLS_PROFILE" -eq 0 ]]; then
  if [[ -n "$CURRENT_TOOLS_PROFILE" ]]; then
    log "unsetting tools.profile so plugin tools stay visible"
    oc config unset tools.profile >/dev/null
  fi
else
  warn "keeping tools.profile; plugin tools may stay hidden"
fi

inspect_profile_footguns

if [[ "$RESTART_GATEWAY" -eq 1 ]]; then
  if oc gateway restart; then
    log "gateway restarted"
  else
    warn "gateway restart failed; run 'openclaw ${OPENCLAW_SCOPE[*]} gateway restart' manually"
  fi
else
  log "restart not requested; run 'openclaw ${OPENCLAW_SCOPE[*]} gateway restart' after install"
fi

printf '\n'
log "done"
log "plugin: $PLUGIN_ID"
log "mode: $MODE"
log "path: $PLUGIN_PATH"
if [[ "$KEEP_TOOLS_PROFILE" -eq 0 ]]; then
  if [[ -n "$CURRENT_TOOLS_PROFILE" ]]; then
    log "tools.profile: removed"
  else
    log "tools.profile: not set"
  fi
fi
