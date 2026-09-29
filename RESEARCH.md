# Reference Research — OpenClaw plugin templates

Captured during the v0.8.0 migration to typed `@unbrowse/sdk`. Three real OpenClaw plugins on GitHub were sampled for manifest shape, capability exposure, transport pattern, and packaging.

## Canonical docs

`https://github.com/openclaw/openclaw/tree/main/docs/plugins`

Key references:

- `docs/plugins/manifest.md` — `openclaw.plugin.json` schema
- `docs/plugins/sdk-entrypoints.md` — loader contract: every plugin exports a default entry object. SDK helpers: `definePluginEntry({ id, name, description, kind?, configSchema?, register(api) })` (the canonical shape for tool/provider/hook plugins), `defineChannelPluginEntry`, `defineSetupPluginEntry`. Plain-function default exports `(api) => void` are accepted as legacy.
- `docs/plugins/sdk-overview.md`, `sdk-setup.md`, `sdk-testing.md`

`package.json` entry-pointing:

```json
"openclaw": {
  "extensions": ["./src/index.ts"],
  "runtimeExtensions": ["./dist/index.js"]
}
```

`runtimeExtensions` is preferred for installed npm packages. Missing declared runtime artifacts fail discovery (no silent fallback).

## Reference plugin A — `agentcontrol/openclaw-plugin`

`https://github.com/agentcontrol/openclaw-plugin`

- **Closest analog to the unbrowse-openclaw migration.** Wraps a remote service via HTTP, no CLI spawn.
- Manifest: `id`, `name`, `description`, `configSchema`, `uiHints` (no `skills`, no `version`).
- Default export: `definePluginEntry(...)` from `openclaw/plugin-sdk/plugin-entry`, dynamically resolved via `createRequire` so the plugin doesn't hard-fail on host versions that don't ship the helper.
- **No `peerDependencies` on `openclaw`.** Imports types via `import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core"`.
- Transport: `fetch` to a configured `serverUrl` with `apiKey`. Thin client.
- Tests: `vitest`. Ships TS source (`index.ts` listed in `files`).
- **Pattern we copied:** `import type` + dynamic helper resolution. **Pattern we did not copy:** dropping the `peerDependency` on `openclaw` — kept ours for now to avoid touching install-time validation.

## Reference plugin B — `cdot65/prisma-airs-plugin-openclaw`

`https://github.com/cdot65/prisma-airs-plugin-openclaw`

- **Cleanest exemplar of the typed-SDK wrapper pattern.**
- Manifest: `id`, `name`, `description`, `version`, `entrypoint: "index.ts"`, `hooks: ["hooks"]`, `configSchema`, `uiHints`.
- Default export: plain `(api) => void` registers tools, gateway methods, CLI commands, and event hooks via `api.registerTool`, `api.registerGatewayMethod`, `api.registerCli`, `api.on(event, handler, { priority })`. No CLI spawn anywhere.
- Transport: `import { init } from "@cdot65/prisma-airs-sdk"`, then internal `scan()` wrapper. Every hook calls into the SDK.
- No `peerDependencies` on `openclaw`. Ships TS source.
- **Pattern we copied:** SdkDriver wraps `Unbrowse` from `@unbrowse/sdk`, all 7 actions dispatch to typed methods, `UnbrowseApiError` caught explicitly and coalesced into a structured `CommandResult`.

## Reference plugin C — `cosformula/openclaw-mlx-audio`

`https://github.com/cosformula/openclaw-mlx-audio`

- Service + tool + skill hybrid. Manifest closest in shape to ours: includes `skills: ["skills/mlx-audio"]`, `version`, `displayName`, rich `configSchema` and `uiHints`.
- Default export: `(api) => void` calling `api.registerService`, `api.registerTool`, `api.registerCommand`, `api.on`.
- Transport: spawns Python subprocess + proxies HTTP. **This is the CLI-spawn anti-pattern we moved away from.**
- Tests: `node --test` against compiled `dist/test/*.test.js`. Ships prebuilt `dist/index.js` via `runtimeExtensions`.
- **Pattern we copied:** the manifest's `skills: [...]` + `configSchema` + `uiHints` shape (this matched ours from the start). **Pattern we explicitly avoided:** the spawn-based transport.

## What v0.8.0 inherited from each

| Source | What we adopted |
|---|---|
| openclaw docs (`sdk-entrypoints.md`) | confirmed `register(api)` default-export shape; legacy plain-function form is fine |
| agentcontrol plugin | `import type` for SDK types; resilient dynamic resolution patterns |
| prisma-airs plugin | typed-SDK wrapper as the only call path; explicit error type handling and coalesce-to-result pattern |
| mlx-audio plugin | manifest shape (`skills` + rich `configSchema` + `uiHints`); `node --test` test runner choice |

## What v0.8.0 deliberately diverged

- Kept `peerDependencies.openclaw` (none of the references ship it). Removing this is a follow-up — not load-bearing for the SDK swap.
- Did not flip to `runtimeExtensions: ["./dist/index.js"]` — the plugin still ships TS source via `extensions: ["./index.ts"]` and depends on the host's `tsx` loader. If startup latency becomes a concern, ship `dist/`.
- Kept the CLI driver alive as a runtime fallback rather than deleting it. Two SDK gaps (`skills` listing, `execute` with `endpointId`/extract flags) make this load-bearing today.
