# Security boundary

This plugin is a privileged local bridge. Review it before adding
`unbrowse-openclaw` to OpenClaw's plugin allow-list.

## What it can do

- The default SDK driver makes HTTP requests only after an agent invokes the
  `unbrowse` tool (apart from the configurable startup health check).
- The CLI fallback uses `node:child_process` to start the installed, local
  `unbrowse` package with an argument array. It does not invoke a shell.
- That child inherits OpenClaw's environment so normal `HOME`, proxy,
  `UNBROWSE_*`, and explicitly configured authentication-provider variables
  remain available to Unbrowse. The plugin does not enumerate or transmit the
  environment itself.
- The plugin reads its own packaged prompts, manifest, and skill files. Its
  installer writes OpenClaw plugin configuration and the managed extension.

These behaviors legitimately trigger static rules for process execution,
environment access, file access, and network access. Do not bypass the warning
blindly: verify the package source and integrity, prefer the SDK driver, and use
the documented local-load path when your policy requires source review.

## What it does not do

- No shell command is built from tool input.
- Install and module load do not upload credentials or contact target websites.
- The current tool schema does not expose the removed
  `unbrowse_workflow_record` or `unbrowse_workflow_learn` actions.

Set `healthcheckOnStart: false` if policy requires absolutely no network request
before the first explicit tool call. Set `driver: "sdk"` (the default) to keep
CLI process execution limited to the documented SDK-gap fallbacks.
