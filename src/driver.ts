/**
 * The firmament between OpenClaw host wiring and the Unbrowse call mechanics.
 *
 * Above this interface: `index.ts` — `definePluginEntry`, `register(api)`, prompt injection,
 *   config normalization, tool registration. Knows nothing about HTTP or child_process.
 *
 * Below this interface: `driver-sdk.ts` and `driver-cli.ts`. One implements the typed
 *   `@unbrowse/sdk` call path (new wine); the other wraps the legacy CLI spawn (old skin,
 *   kept whole for the two SDK gaps: `skills` listing and `execute` with --endpointId/--extract).
 *
 * Drivers MUST NOT leak transport details (HTTP status, exit codes, fetch errors) above
 * the firmament. Everything coalesces into `CommandResult`.
 */

export type DriverActionInput =
  | { action: "health" }
  | { action: "skill"; skillId: string }
  | { action: "skills" }
  | { action: "login"; url: string }
  | { action: "search"; intent: string; domain?: string; k?: number }
  | {
      action: "resolve";
      intent: string;
      url?: string;
      params?: Record<string, unknown>;
      confirmUnsafe?: boolean;
      dryRun?: boolean;
    }
  | {
      action: "execute";
      skillId: string;
      endpointId?: string;
      params?: Record<string, unknown>;
      path?: string;
      extract?: string;
      limit?: number;
      pretty?: boolean;
      confirmUnsafe?: boolean;
      dryRun?: boolean;
    };

export type DriverAction = DriverActionInput["action"];

export type CommandResult = {
  ok: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
};

export interface UnbrowseDriver {
  readonly kind: "sdk" | "cli";
  call(input: DriverActionInput, options?: { timeoutMs?: number; signal?: AbortSignal }): Promise<CommandResult>;
}

export function commandResultFromJson(value: unknown): CommandResult {
  return {
    ok: true,
    stdout: typeof value === "string" ? value : JSON.stringify(value),
    stderr: "",
    exitCode: 0,
    signal: null,
  };
}

export function commandResultFromError(err: unknown): CommandResult {
  let message: string;
  if (err instanceof Error) {
    message = err.message || err.name || "Error";
  } else if (typeof err === "symbol") {
    message = err.description ? `Symbol(${err.description})` : "Symbol()";
  } else {
    try {
      message = String(err);
    } catch {
      message = "[unrepresentable error]";
    }
  }
  return {
    ok: false,
    stdout: "",
    stderr: message,
    exitCode: 1,
    signal: null,
  };
}

/**
 * Exhaustiveness witness. The compiler narrows `x` to `never` in a fully-covered
 * `switch (input.action)`; if a future contributor adds a new action to
 * `DriverAction` without handling it in the driver, TS errors here.
 */
export function assertNever(x: never, hint = "Unhandled DriverAction"): never {
  throw new Error(`${hint}: ${JSON.stringify(x)}`);
}
