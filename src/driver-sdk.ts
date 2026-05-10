import { Unbrowse, UnbrowseApiError, type UnbrowseClientOptions } from "@unbrowse/sdk";
import {
  assertNever,
  commandResultFromError,
  commandResultFromJson,
  type CommandResult,
  type DriverActionInput,
  type UnbrowseDriver,
} from "./driver.ts";

/**
 * Maps the plugin's action union onto the typed `@unbrowse/sdk` surface.
 *
 * Two known SDK gaps (recorded in the Day-2 architecture note):
 *   - `skills` (list): SDK has `getSkill(id)` but no `listSkills()`. Returns
 *     ok:false with a directive stderr; callers fall back to CLI driver.
 *   - `execute` with `endpointId` / `path` / `extract` / `limit` / `pretty`:
 *     the SDK accepts free-form `params` only, so endpoint targeting and
 *     post-processing flags are CLI-only. Driver flags this on the result.
 */
export class SdkDriver implements UnbrowseDriver {
  readonly kind = "sdk" as const;
  readonly client: Unbrowse;

  constructor(options: UnbrowseClientOptions = {}) {
    this.client = new Unbrowse(options);
  }

  async call(input: DriverActionInput): Promise<CommandResult> {
    try {
      switch (input.action) {
        case "health":
          return commandResultFromJson(await this.client.health());

        case "skill":
          return commandResultFromJson(await this.client.getSkill(input.skillId));

        case "skills":
          // SDK gap: no listSkills on the client. Fall back path required.
          return {
            ok: false,
            stdout: "",
            stderr: "sdk_driver: action 'skills' is not supported by @unbrowse/sdk; route to CLI driver",
            exitCode: 2,
            signal: null,
          };

        case "login":
          return commandResultFromJson(await this.client.login({ url: input.url }));

        case "search":
          if (input.domain) {
            return commandResultFromJson(
              await this.client.searchDomain({ intent: input.intent, domain: input.domain, k: input.k }),
            );
          }
          return commandResultFromJson(await this.client.search({ intent: input.intent, k: input.k }));

        case "resolve":
          return commandResultFromJson(
            await this.client.resolve({
              intent: input.intent,
              url: input.url,
              params: input.params,
              confirmUnsafe: input.confirmUnsafe,
              dryRun: input.dryRun,
            }),
          );

        case "execute":
          if (input.endpointId || input.path || input.extract || input.limit !== undefined || input.pretty) {
            return {
              ok: false,
              stdout: "",
              stderr:
                "sdk_driver: action 'execute' with endpointId/path/extract/limit/pretty is not on @unbrowse/sdk; route to CLI driver",
              exitCode: 2,
              signal: null,
            };
          }
          return commandResultFromJson(
            await this.client.execute(input.skillId, {
              params: input.params,
              confirmUnsafe: input.confirmUnsafe,
              dryRun: input.dryRun,
            }),
          );

        default:
          return assertNever(input);
      }
    } catch (err) {
      if (err instanceof UnbrowseApiError) {
        return {
          ok: false,
          stdout: "",
          stderr: `unbrowse_api_error: ${err.message} (status=${err.status}, path=${err.path})`,
          exitCode: 1,
          signal: null,
        };
      }
      return commandResultFromError(err);
    }
  }
}
