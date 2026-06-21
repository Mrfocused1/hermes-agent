export interface BuildResult {
  ok: boolean;
  log: string;
}

export interface VerifyArgs {
  build: () => Promise<BuildResult>;
  fix: (errorLog: string) => Promise<void>;
  maxRetries: number;
}

export type VerifyOutcome =
  | { status: "ok" }
  | { status: "escalate"; lastLog: string };

/**
 * Build, and on failure ask the fixer to patch, capped at maxRetries.
 * The build result is ground truth (a real build / real logs), never a
 * model's self-report. Returns "escalate" when retries are exhausted.
 */
export async function verifyAndRetry(args: VerifyArgs): Promise<VerifyOutcome> {
  let result = await args.build();
  let attempts = 0;
  while (!result.ok && attempts < args.maxRetries) {
    await args.fix(result.log);
    attempts++;
    result = await args.build();
  }
  return result.ok ? { status: "ok" } : { status: "escalate", lastLog: result.log };
}
