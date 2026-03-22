#!/usr/bin/env bun

import path from "node:path";

import { buildTaskPacket } from "../src/research/packet-builder";
import type { ResearchTaskPacket, ResearchVerificationReport } from "../src/research/types";
import {
  ResearchVerificationFailure,
  runSandboxVerification,
} from "../src/research/verifier";
import { readJsonFile, tripletex2Root } from "../src/research/store";
import { loadSandboxCredentials } from "../src/sandbox-credentials";
import { callSandboxClient, createSandboxClient } from "../src/sandbox/client";
import {
  formatResetReportForResearch,
  runBestEffortSandboxCleanup,
} from "../src/sandbox/cleanup";
import { applySandboxPlan } from "../src/sandbox/plan";
import { runSandboxTask } from "../src/sandbox/run";
import type { SandboxPlan } from "../src/sandbox/types";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];
  const subcommand = args[1];

  if (command === "request") {
    const credentials = await requireSandboxCredentials();
    const method = requirePositional(args, 1, "METHOD");
    const requestPath = requirePositional(args, 2, "PATH");
    const response = await callSandboxClient(
      createSandboxClient(credentials),
      parseMethod(method),
      requestPath,
      {
        ...(readQueryFlags(args).size > 0
          ? { query: Object.fromEntries(readQueryFlags(args)) }
          : {}),
        ...(await readBodyFlags(args)),
      },
    );
    printJson(response);
    return;
  }

  if (command === "inspect" && subcommand === "get") {
    const credentials = await requireSandboxCredentials();
    const requestPath = requirePositional(args, 2, "PATH");
    const response = await callSandboxClient(
      createSandboxClient(credentials),
      "GET",
      requestPath,
      readQueryFlags(args).size > 0
        ? { query: Object.fromEntries(readQueryFlags(args)) }
        : {},
    );
    printJson(response);
    return;
  }

  if (command === "apply") {
    const credentials = await requireSandboxCredentials();
    const planPath = requireFlag(args, "--plan");
    const plan = await readJsonFile<SandboxPlan>(resolveFilePath(planPath));
    const result = await applySandboxPlan({
      plan,
      credentials,
      planPath: resolveFilePath(planPath),
      dryRun: hasFlag(args, "--dry-run"),
    });
    printJson({
      reportPath: result.reportPath,
      dryRun: result.report.dryRun,
      createdRefs: result.report.createdRefs,
      stepStatuses: result.report.steps.map((step) => ({
        stepId: step.stepId,
        status: step.status,
      })),
    });
    return;
  }

  if (command === "reset") {
    const credentials = await requireSandboxCredentials();
    const startedAt = Date.now();
    const result = await runBestEffortSandboxCleanup({
      credentials,
      dryRun: hasFlag(args, "--dry-run"),
    });
    const taskId = optionalFlag(args, "--task") ?? "all";
    const strategyId = optionalFlag(args, "--strategy") ?? "all";
    const legacy = formatResetReportForResearch({
      taskId,
      strategyId,
      report: result.report,
      reportPath: result.reportPath,
      durationMs: Date.now() - startedAt,
    });
    printJson({
      reportPath: result.reportPath,
      summary: result.report.summary,
      discoveredRefs: result.report.discoveredRefs.length,
      stdout: legacy.stdout.trim(),
      stderr: legacy.stderr.trim(),
    });
    return;
  }

  if (command === "run") {
    const credentials = await requireSandboxCredentials();
    const taskId = requireFlag(args, "--task");
    const strategyId = requireFlag(args, "--strategy");
    const inputPath = requireFlag(args, "--input-file");
    const rawInput = await readJsonFile<Record<string, unknown>>(resolveFilePath(inputPath));
    const { prompt: inputPrompt, ...payload } = rawInput;
    const result = await runSandboxTask({
      taskId,
      strategyId,
      payload,
      credentials,
      ...(typeof inputPrompt === "string" ? { prompt: inputPrompt } : {}),
    });
    printJson({
      artifactPath: result.artifactPath,
      stageDirectory: result.stageDirectory,
      runId: result.artifact.runId,
      runtimeStatus: result.artifact.execution.runtimeStatus,
      apiCallCount: result.artifact.execution.apiCallCount,
      createdEntityIds: result.artifact.execution.result?.createdEntityIds ?? {},
    });
    return;
  }

  if (command === "verify") {
    const credentials = await requireSandboxCredentials();
    const taskId = requireFlag(args, "--task");
    const strategyId = requireFlag(args, "--strategy");
    const inputPath = requireFlag(args, "--input-file");
    const packetPath = optionalFlag(args, "--packet");
    const setupPlanPath = optionalFlag(args, "--setup-plan");
    const rawVerifyInput = await readJsonFile<Record<string, unknown>>(resolveFilePath(inputPath));
    const { prompt: verifyPrompt, ...input } = rawVerifyInput;
    const packetResult = packetPath
      ? {
          packetPath: resolveFilePath(packetPath),
          packet: await readJsonFile<ResearchTaskPacket>(resolveFilePath(packetPath)),
        }
      : await buildTaskPacket({ taskId });
    const sandboxResetOverride = hasFlag(args, "--no-reset")
      ? createSkippedResetRecord("sandbox reset skipped by operator request")
      : await runCompatibilityReset(taskId, strategyId, credentials);

    let applyReportPath: string | undefined;
    if (setupPlanPath) {
      const plan = await readJsonFile<SandboxPlan>(resolveFilePath(setupPlanPath));
      const applyResult = await applySandboxPlan({
        plan,
        credentials,
        planPath: resolveFilePath(setupPlanPath),
      });
      applyReportPath = applyResult.reportPath;
      if (applyResult.report.steps.some((step) => step.status === "failed")) {
        throw new Error(`Sandbox setup plan failed: ${applyReportPath}`);
      }
    }

    const result = await runSandboxVerification({
      packet: packetResult.packet,
      packetPath: packetResult.packetPath,
      strategyId,
      input,
      ...(typeof verifyPrompt === "string" ? { prompt: verifyPrompt } : {}),
      candidateId: optionalFlag(args, "--candidate-id") ?? strategyId,
      sandboxResetOverride,
    });
    printJson({
      reportPath: result.reportPath,
      applyReportPath,
      verdict: result.report.verdict,
      artifactPath: result.report.artifactPath,
      stageDirectory: result.report.stageDirectory,
    });
    return;
  }

  throw new Error(
    [
      "Usage:",
      "  bun scripts/sandbox.ts request <METHOD> <PATH> [--query key=value] [--body-file path | --body-json json]",
      "  bun scripts/sandbox.ts inspect get <PATH> [--query key=value]",
      "  bun scripts/sandbox.ts apply --plan <plan-path> [--dry-run]",
      "  bun scripts/sandbox.ts reset [--dry-run] [--task 06] [--strategy 06.create-employee.v1]",
      "  bun scripts/sandbox.ts run --task <task-id> --strategy <strategy-id> --input-file <json>",
      "  bun scripts/sandbox.ts verify --task <task-id> --strategy <strategy-id> --input-file <json> [--packet <packet-path>] [--setup-plan <plan-path>] [--no-reset]",
    ].join("\n"),
  );
}

async function runCompatibilityReset(
  taskId: string,
  strategyId: string,
  credentials: NonNullable<Awaited<ReturnType<typeof loadSandboxCredentials>>>,
): Promise<ResearchVerificationReport["sandboxReset"]> {
  const startedAt = Date.now();
  const result = await runBestEffortSandboxCleanup({ credentials });
  return formatResetReportForResearch({
    taskId,
    strategyId,
    report: result.report,
    reportPath: result.reportPath,
    durationMs: Date.now() - startedAt,
  });
}

async function requireSandboxCredentials() {
  const credentials = await loadSandboxCredentials();
  if (!credentials) {
    throw new Error(
      "Sandbox credentials were not found in environment variables or tasks/tripletex2/.sandbox.env.",
    );
  }
  return credentials;
}

function resolveFilePath(filePath: string): string {
  return path.isAbsolute(filePath)
    ? filePath
    : path.resolve(tripletex2Root, filePath);
}

function optionalFlag(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  if (index === -1) {
    return undefined;
  }
  return argv[index + 1];
}

function requireFlag(argv: readonly string[], flag: string): string {
  const value = optionalFlag(argv, flag);
  if (!value) {
    throw new Error(`Flag "${flag}" is required.`);
  }
  return value;
}

function hasFlag(argv: readonly string[], flag: string): boolean {
  return argv.includes(flag);
}

function requirePositional(argv: readonly string[], index: number, label: string): string {
  const value = argv[index];
  if (!value) {
    throw new Error(`${label} is required.`);
  }
  return value;
}

function parseMethod(value: string): "GET" | "POST" | "PUT" | "DELETE" {
  const normalized = value.trim().toUpperCase();
  if (
    normalized === "GET" ||
    normalized === "POST" ||
    normalized === "PUT" ||
    normalized === "DELETE"
  ) {
    return normalized;
  }
  throw new Error(`Unsupported HTTP method "${value}".`);
}

function readQueryFlags(argv: readonly string[]): Map<string, string> {
  const queries = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== "--query") {
      continue;
    }
    const pair = argv[index + 1];
    if (!pair || !pair.includes("=")) {
      throw new Error(`Flag "--query" expects key=value.`);
    }
    const equalsIndex = pair.indexOf("=");
    queries.set(pair.slice(0, equalsIndex), pair.slice(equalsIndex + 1));
    index += 1;
  }
  return queries;
}

async function readBodyFlags(
  argv: readonly string[],
): Promise<{ body?: unknown }> {
  const bodyFile = optionalFlag(argv, "--body-file");
  const bodyJson = optionalFlag(argv, "--body-json");
  if (bodyFile && bodyJson) {
    throw new Error(`Use only one of "--body-file" and "--body-json".`);
  }
  if (bodyFile) {
    return {
      body: await readJsonFile<unknown>(resolveFilePath(bodyFile)),
    };
  }
  if (bodyJson) {
    return {
      body: JSON.parse(bodyJson) as unknown,
    };
  }
  return {};
}

function createSkippedResetRecord(
  message: string,
): ResearchVerificationReport["sandboxReset"] {
  return {
    command: "sandbox reset skipped",
    exitCode: 0,
    stdout: `${message}\n`,
    stderr: "",
    highlights: [message],
  };
}

function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

void main().catch((error) => {
  if (error instanceof ResearchVerificationFailure) {
    printJson({
      error: error.message,
      reportPath: error.reportPath,
      failureStage: error.report.failureStage,
      verdict: error.report.verdict,
      sandboxReset: error.report.sandboxReset,
    });
    process.exit(1);
  }
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
