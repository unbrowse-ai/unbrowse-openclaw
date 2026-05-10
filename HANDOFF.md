# v0.8.0 — Ship Checklist

State: **implementation complete, awaiting human-authorized git + publish.**

## What's in the working tree

```
M  CHANGELOG.md            (0.8.0 entry)
M  README.md               (driver section, SDK leaven purged)
M  index.ts                (SdkDriver wired as default; CLI auto-fallback)
M  package.json            (0.8.0; @unbrowse/sdk file: dep + bundledDependencies; src/ in files)
M  package-lock.json
M  test/plugin.test.ts     (CLI binPath test opted into driver: "cli")
?  HANDOFF.md              (this file)
?  RESEARCH.md
?  src/driver.ts
?  src/driver-sdk.ts
?  test/driver.test.ts
?  test/driver-exhaustiveness.test.ts
?  test/driver-action-parity.test.ts
?  test/driver-sdk.test.ts
?  test/e2e-host-sdk.test.ts
```

## Verification done

- `npm test`: 30/30 green (was 13)
- `npx tsc --noEmit`: clean
- `npm pack` produces a 34-entry tarball that includes `src/` and bundled `node_modules/@unbrowse/sdk/dist/`
- Cold install in tempdir: tarball installs cleanly, both `src/` and `@unbrowse/sdk/dist/` reachable

## What you (Lewis) need to do to ship

> ⚠️ The submodule is on **detached HEAD** at `e559a87`. Check out a branch before committing — otherwise the work sits on a loose object that future garbage collection can drop. Do this first:
>
> ```bash
> cd submodules/openclaw-unbrowse-plugin
> git checkout -b feat/sdk-default-driver
> ```

```bash
cd submodules/openclaw-unbrowse-plugin

# 1. Review and commit in the plugin's own repo
git diff
git add -A
git commit -m "feat: migrate default call path to @unbrowse/sdk (v0.8.0)"
git tag v0.8.0
git push origin <branch> --tags

# 2. (When ready) publish to npm
npm publish

# 3. Bump submodule pointer in the parent repo
cd ../..
git add submodules/openclaw-unbrowse-plugin
git commit -m "chore(submodule): bump unbrowse-openclaw to v0.8.0"
```

## Optional pre-publish smoke

Per CLAUDE.md release protocol, run a live healthcheck against `:6969`:

```bash
# in one shell
unbrowse                         # boots local server on :6969

# in another
node --import tsx -e "
  import('./submodules/openclaw-unbrowse-plugin/src/driver-sdk.ts').then(async ({ SdkDriver }) => {
    const d = new SdkDriver({ baseUrl: 'http://localhost:6969' });
    const r = await d.call({ action: 'health' });
    console.log(r);
  });
"
```

Expected: `{ ok: true, exitCode: 0, stdout: '{"status":"ok",...}' }`.

## What did NOT change

- The OpenClaw plugin manifest schema
- The agent-facing tool action union (still: `resolve`, `search`, `execute`, `login`, `skills`, `skill`, `health`)
- The bootstrap prompt machinery, skill markdown, install script
- The `unbrowse` CLI dependency itself (still `^3.0.0`, kept for the fallback path)

## Rollback

If users hit issues, they can opt back into v0.7.x behavior without downgrading:

```json
{
  "plugins": {
    "entries": {
      "unbrowse-openclaw": {
        "config": { "driver": "cli" }
      }
    }
  }
}
```

This routes every action through the bundled `unbrowse` CLI exactly as v0.7.17 did.
