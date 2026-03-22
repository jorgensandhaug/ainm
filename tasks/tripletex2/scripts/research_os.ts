#!/usr/bin/env bun

import path from "node:path";

import {
  loadCandidateStore,
} from "../src/research/candidate-store";
import { buildTaskPacket } from "../src/research/packet-builder";
import {
  DEFAULT_RESEARCH_QUEUE_PATH,
  getTopReadyQueueEntries,
  loadResearchTaskQueue,
} from "../src/research/queue";
import { readJsonFile, tripletex2Root } from "../src/research/store";
import type { ResearchTaskPacket } from "../src/research/types";
import {
  ResearchVerificationFailure,
  runSandboxVerification,
} from "../src/research/verifier";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];
  const subcommand = args[1];

  if (command === "queue" && subcommand === "show") {
    const queue = await loadResearchTaskQueue(DEFAULT_RESEARCH_QUEUE_PATH);
    printJson(queue);
    return;
  }

  if (command === "queue" && subcommand === "top") {
    const count = readIntegerFlag(args, "--count", 3);
    const queue = await loadResearchTaskQueue(DEFAULT_RESEARCH_QUEUE_PATH);
    printJson(getTopReadyQueueEntries(queue, count));
    return;
  }

  if (command === "packet" && subcommand === "build") {
    const taskId = requireFlag(args, "--task");
    const result = await buildTaskPacket({ taskId });
    printJson({
      taskId,
      packetPath: result.packetPath,
      baselineCallBudget: result.packet.baselineCallBudget,
    });
    return;
  }

  if (command === "candidates" && subcommand === "list") {
    const taskId = optionalFlag(args, "--task");
    const store = await loadCandidateStore();
    printJson(
      taskId
        ? store.entries.filter((entry) => entry.taskId === taskId)
        : store.entries,
    );
    return;
  }

  if (command === "verify") {
    const packetPath = requireFlag(args, "--packet");
    const strategyId = requireFlag(args, "--strategy");
    const packet = await readJsonFile<ResearchTaskPacket>(resolveFilePath(packetPath));
    const inputPath =
      optionalFlag(args, "--input-file") ?? packet.proof?.inputPath;
    if (!inputPath) {
      throw new Error(
        `No input file was provided and packet ${packet.packetId} does not declare proof.inputPath.`,
      );
    }
    const input = await readJsonFile<Record<string, unknown>>(
      resolveFilePath(inputPath),
    );
    const promptFilePath = optionalFlag(args, "--prompt-file");
    const promptOverride = promptFilePath
      ? await Bun.file(resolveFilePath(promptFilePath)).text()
      : undefined;
    const result = await runSandboxVerification({
      packet,
      packetPath: resolveFilePath(packetPath),
      strategyId,
      input,
      promptOverride,
      candidateId: optionalFlag(args, "--candidate-id") ?? strategyId,
    });
    printJson({
      reportPath: result.reportPath,
      verdict: result.report.verdict,
      artifactPath: result.report.artifactPath,
      stageDirectory: result.report.stageDirectory,
    });
    return;
  }

  throw new Error(
    [
      "Usage:",
      "  bun scripts/research_os.ts queue show",
      "  bun scripts/research_os.ts queue top --count 3",
      "  bun scripts/research_os.ts packet build --task 06",
      "  bun scripts/research_os.ts candidates list [--task 06]",
      "  bun scripts/research_os.ts verify --packet <packet-path> --strategy <strategy-id> [--input-file <json>] [--prompt-file <txt>]",
    ].join("\n"),
  );
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

function readIntegerFlag(
  argv: readonly string[],
  flag: string,
  defaultValue: number,
): number {
  const rawValue = optionalFlag(argv, flag);
  if (rawValue === undefined) {
    return defaultValue;
  }

  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Flag "${flag}" must be a positive integer.`);
  }

  return parsed;
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
