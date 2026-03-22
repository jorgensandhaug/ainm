import path from "node:path";

import { loadActiveStrategySelectionConfig } from "../registry/active-strategy-selection";
import { DEFAULT_ACTIVE_STRATEGY_SELECTION_CONFIG_PATH } from "../registry/tasks";
import { runDeterministicSolvePipeline } from "../runtime/solve-pipeline";
import type { RunArtifactV1 } from "../runtime/contracts";
import { resolveResearchPath } from "../research/store";
import { type SandboxCredentials } from "./client";

export async function runSandboxTask(input: {
  taskId: string;
  strategyId: string;
  payload: Record<string, unknown>;
  credentials: SandboxCredentials;
  prompt?: string;
  now?: () => Date;
  reportRoot?: string;
}): Promise<{
  artifact: RunArtifactV1;
  artifactPath: string;
  stageDirectory: string;
}> {
  const createdAt = resolveNow(input.now).toISOString();
  const runId = createRunId(input.taskId, input.strategyId, createdAt);
  const reportDirectory = path.join(
    input.reportRoot ?? resolveResearchPath("sandbox", "runs"),
    runId,
  );
  const selectionConfig = await createSelectionOverride(input.taskId, input.strategyId);
  const result = await runDeterministicSolvePipeline(
    {
      prompt: input.prompt ?? [
        `Sandbox operator run for task ${input.taskId}.`,
        `Strategy under test: ${input.strategyId}.`,
        "Task understanding is pinned manually for this run.",
      ].join(" "),
      files: [],
      tripletexCredentials: {
        baseUrl: input.credentials.base_url,
        sessionToken: input.credentials.session_token,
        credentialSource: "tripletex2.sandbox-env",
      },
    },
    {
      mode: "sandbox",
      selectionConfigOverride: selectionConfig,
      runContext: {
        runId,
        stageDirectory: path.join(reportDirectory, "stage"),
        artifactRoot: path.join(reportDirectory, "artifacts"),
      },
      taskUnderstanding: {
        result: {
          status: "resolved",
          taskId: input.taskId,
          input: input.payload,
        },
        taskSource: "manual-label",
        inputSource: "manual",
        notes: [
          `Sandbox operator ran explicit strategy ${input.strategyId}.`,
        ],
      },
      now: input.now,
    },
  );
  return {
    artifact: result.artifact,
    artifactPath: result.artifactPath,
    stageDirectory: result.stageDirectory,
  };
}

async function createSelectionOverride(
  taskId: string,
  strategyId: string,
) {
  const loaded = await loadActiveStrategySelectionConfig(
    DEFAULT_ACTIVE_STRATEGY_SELECTION_CONFIG_PATH,
  );
  return {
    ...loaded.config,
    selectionConfigId: `${loaded.config.selectionConfigId}.sandbox.${taskId}.${sanitizeId(strategyId)}`,
    taskStrategies: {
      ...loaded.config.taskStrategies,
      [taskId]: strategyId,
    },
  };
}

function createRunId(
  taskId: string,
  strategyId: string,
  createdAt: string,
): string {
  return `sandbox-${taskId}-${sanitizeId(strategyId)}-${createdAt.replaceAll(":", "-").replaceAll(".", "-")}`;
}

function sanitizeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-");
}

function resolveNow(now?: () => Date): Date {
  return now ? now() : new Date();
}
