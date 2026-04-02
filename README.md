# unbrowse-openclaw

Use Unbrowse as the default web path inside OpenClaw.

This plugin:

- adds a native `unbrowse` tool
- teaches agents to prefer it for website tasks
- can block the built-in `browser` tool in strict mode
- installs cleanly from npm with one command

## Install

```bash
npx unbrowse-openclaw install --restart
```

Global install:

```bash
npm install -g unbrowse-openclaw
unbrowse-openclaw install --restart
```

What the installer does:

- copies or links the plugin into OpenClaw's managed extensions dir
- rewrites `plugins.load.paths` so this plugin resolves to the managed install, not a stale checkout
- merges `plugins.allow` with `unbrowse-openclaw`
- enables the plugin entry
- writes sticky plugin config with `routingMode`, `preferInBootstrap`, and timeout
- unsets global `tools.profile` unless you pass `--keep-tools-profile`
- optionally restarts the gateway
- auto-confirms OpenClaw's plugin trust prompt on newer OpenClaw builds; older builds still ask once

Why the script exists: `openclaw plugins install` alone is not enough. On current OpenClaw builds it also hard-blocks this plugin because the runtime legitimately uses `child_process` to launch the local `unbrowse` CLI. The installer avoids that path, writes the managed install directly, sets `plugins.allow`, switches strict/fallback mode, and removes the `tools.profile` footgun that can hide plugin tools completely.

## Installer flags

```bash
npx unbrowse-openclaw install --mode strict --restart
npx unbrowse-openclaw install --mode fallback
npx unbrowse-openclaw install --dev --restart
npx unbrowse-openclaw install --profile work --restart
npx unbrowse-openclaw install --keep-tools-profile
```

The published package depends on `unbrowse`, so the local Unbrowse CLI/runtime is installed automatically from npm.

## Verify

```bash
openclaw plugins info unbrowse-openclaw
openclaw unbrowse-plugin health
openclaw unbrowse-plugin print-bootstrap
openclaw unbrowse-plugin print-config strict
openclaw unbrowse-plugin print-config fallback
openclaw unbrowse-plugin print-trusted-install
```

Expected result:

- `unbrowse` is visible in the tool list
- bootstrap guidance says to use Unbrowse first
- strict mode blocks the built-in `browser` tool

## Routing modes

### Strict

Normal web tasks go through Unbrowse. The built-in `browser` tool is blocked.

- [examples/openclaw.strict.json5](./examples/openclaw.strict.json5)

### Fallback

Prefer Unbrowse first. Keep the built-in `browser` tool available for true UI-only work.

- [examples/openclaw.fallback.json5](./examples/openclaw.fallback.json5)

## Manual config

If you want to load a local checkout directly instead of using the npm installer:

```json5
{
  plugins: {
    allow: ["unbrowse-openclaw"],
    load: { paths: ["/absolute/path/to/unbrowse-openclaw"] },
    entries: {
      "unbrowse-openclaw": {
        enabled: true,
        config: {
          routingMode: "strict",
          preferInBootstrap: true,
          timeoutMs: 120000
        }
      }
    }
  }
}
```

If `tools.profile` is set, plugin tools may disappear entirely:

```bash
openclaw config unset tools.profile
```

## Why install scanners warn

- `node:child_process` because the plugin launches the local `unbrowse` CLI
- `process.env` because it passes local config like `UNBROWSE_URL` into that child process
- local file reads because it loads bundled prompt, skill, and config files from its own directory
- install/load does not contact external websites; network traffic starts only after an agent explicitly calls `unbrowse`

## Tool surface

Tool action shape:

```json
{
  "action": "resolve",
  "intent": "get pricing page API data",
  "url": "https://example.com"
}
```

Actions:

- `resolve`
- `search`
- `execute`
- `login`
- `skills`
- `skill`
- `health`

Integration hooks:

- bootstrap guidance
- `before_agent_start` prompt hint each run
- shipped `unbrowse-browser` skill
- strict-mode `before_tool_call` blocking for `browser`

## Dev

```bash
npm test
npm run typecheck
npm pack --dry-run
```
