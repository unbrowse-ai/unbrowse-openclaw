# Changelog

## 0.8.0

### Migrated to typed `@unbrowse/sdk` for the default call path

- The plugin's `unbrowse` tool now routes through `@unbrowse/sdk` (`SdkDriver`) instead of spawning the `unbrowse` CLI for every action. Default config is `driver: "sdk"`.
- The legacy CLI path is preserved as a fallback for two known SDK gaps: `action: "skills"` (no `listSkills` on the SDK) and `action: "execute"` with `endpointId` / `path` / `extract` / `limit` / `pretty` (post-processing flags are CLI-only). When the SDK driver detects either case it returns `exitCode=2` and the host falls through to `runCommand` automatically. No agent action required.
- New `driver: "cli"` config opts back to the v0.7.x behavior for users who hit edge cases. `binPath` keeps working in both modes.
- Tool result details now include `via: "sdk" | "cli"` so callers can trace which path executed.
- Hardened `commandResultFromError` against `Symbol`, `null`, `undefined`, plain objects, and empty-message Errors — the coercer used to crash on `String(Symbol)`.
- New module layout: `src/driver.ts` (interface + helpers), `src/driver-sdk.ts` (typed SDK adapter). Existing `index.ts` keeps the OpenClaw host wiring, prompt builders, and CLI invocation helpers.
- Test suite extended from 13 → 30 cases — adds parity drift detection between the firmament and the tool surface, type-level exhaustiveness over the action union, SDK driver edge/adversarial cases, and two host-level E2E tests proving SDK-default routing and CLI fallback both work end to end.

## Unreleased

- fix npm release packaging so published tarballs keep `bin/` + `scripts/`, restoring `npx unbrowse-openclaw install --restart`
- bypass OpenClaw's `plugins install` dangerous-code block by writing the managed extension install + config directly
- add tarball regression coverage for package metadata, shipped files, and runtime dependencies before publish
- add a package bin so the published npm package installs with `npx unbrowse-openclaw install` instead of requiring a repo checkout
- add `scripts/install-openclaw.sh` so install is one command instead of a plugin install plus manual config surgery
- clean out the stale monorepo-era files so this repo is just the standalone OpenClaw plugin package
- use OpenClaw's global `--yes` flag when available, with clean fallback for older builds that still prompt once for trust
- add `print-trusted-install` so the README's trusted local-load path is real, not aspirational
- include `plugins.allow` in the generated config snippet so plugin enablement works on first paste
- clean up README/examples/generated config so they point at the standalone package instead of the old submodule path
- resolve the bundled `unbrowse` executable from the dependency's real `bin` field so copied installs can actually run `openclaw unbrowse-plugin health`
- add a repo `LICENSE` file so the published npm package matches its declared license metadata
- align plugin id with the published npm package name `unbrowse-openclaw` so OpenClaw install/update/config references stay consistent
- ship a native `unbrowse-browser` skill plus `before_agent_start` guidance so OpenClaw treats Unbrowse as the default web path instead of just another tool
- in strict mode, block the built-in `browser` tool via `before_tool_call`
- bump bundled `unbrowse` runtime to `1.1.5` so broken `keytar` native bindings demote to the encrypted file vault instead of crashing auth-backed runs

## 0.7.13

- npm package renamed to `unbrowse-openclaw`
- README simplified around what the plugin does and the real install path

## 0.7.12

- initial OpenClaw plugin scaffold
- Unbrowse-backed agent tool
- bootstrap guidance for preferring Unbrowse over the built-in browser tool
- strict/fallback routing presets plus generated OpenClaw config snippets
- dedicated bootstrap prompt template for agent decisioning
- plugin CLI helpers for health, bootstrap preview, and config printing
- README install/config docs aligned with OpenClaw plugin and tool-policy docs
- package prepared for scoped npm publish
