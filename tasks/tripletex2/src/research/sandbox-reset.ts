import type { ResearchVerificationReport } from "./types";
import {
  formatResetReportForResearch,
  runBestEffortSandboxCleanup,
} from "../sandbox/cleanup";

interface SandboxCredentials {
  base_url: string;
  session_token: string;
}

interface ResearchSandboxResetOptions {
  taskId: string;
  strategyId: string;
  input: Record<string, unknown>;
  credentials: SandboxCredentials;
  now?: () => Date;
}

export async function runResearchSandboxReset(
  options: ResearchSandboxResetOptions,
): Promise<ResearchVerificationReport["sandboxReset"]> {
  void options.input;
  const startedAt = Date.now();
  const { report, reportPath } = await runBestEffortSandboxCleanup({
    credentials: options.credentials,
    now: options.now,
  });
  return formatResetReportForResearch({
    taskId: options.taskId,
    strategyId: options.strategyId,
    report,
    reportPath,
    durationMs: Date.now() - startedAt,
  });
}
