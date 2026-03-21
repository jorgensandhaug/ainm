import path from "node:path";
import { isDeepStrictEqual } from "node:util";

import {
  DEFAULT_ACTIVE_STRATEGY_SELECTION_CONFIG_PATH,
} from "../registry/tasks";
import { loadActiveStrategySelectionConfig } from "../registry/active-strategy-selection";
import type { RunArtifactV1, TripletexClient } from "../runtime/contracts";
import { runDeterministicSolvePipeline } from "../runtime/solve-pipeline";
import { createTripletexClient } from "../runtime/tripletex-client";
import { loadSandboxCredentials } from "../sandbox-credentials";
import {
  DEFAULT_CANDIDATE_STORE_PATH,
  loadCandidateStore,
  upsertCandidateRecord,
  writeCandidateStore,
} from "./candidate-store";
import { resolveResearchPath, writeJsonFile } from "./store";
import {
  type CandidateRecord,
  type CandidateStatus,
  type ResearchTaskPacket,
  type ResearchVerificationCheckResult,
  type ResearchVerificationPlan,
  type ResearchVerificationReport,
  type ResearchVerificationAssertion,
  RESEARCH_VERIFICATION_REPORT_SCHEMA_VERSION,
} from "./types";
import { runResearchSandboxReset } from "./sandbox-reset";

export interface RunSandboxVerificationOptions {
  packet: ResearchTaskPacket;
  packetPath?: string;
  strategyId: string;
  input: Record<string, unknown>;
  candidateId?: string;
  candidateStorePath?: string;
  reportRoot?: string;
  now?: () => Date;
  sandboxResetOverride?: ResearchVerificationReport["sandboxReset"];
}

export interface RunSandboxVerificationResult {
  report: ResearchVerificationReport;
  reportPath: string;
}

export class ResearchVerificationFailure extends Error {
  readonly reportPath: string;
  readonly report: ResearchVerificationReport;

  constructor(
    message: string,
    reportPath: string,
    report: ResearchVerificationReport,
  ) {
    super(message);
    this.name = "ResearchVerificationFailure";
    this.reportPath = reportPath;
    this.report = report;
  }
}

export async function runSandboxVerification(
  options: RunSandboxVerificationOptions,
): Promise<RunSandboxVerificationResult> {
  const sandboxCredentials = await loadSandboxCredentials();
  if (!sandboxCredentials) {
    throw new Error(
      "Sandbox credentials were not found in environment variables or tasks/tripletex2/.sandbox.env.",
    );
  }

  const createdAt = resolveNow(options.now).toISOString();
  const reportId = createReportId(options.packet.taskId, createdAt, options.strategyId);
  const reportDirectory = path.join(
    options.reportRoot ?? resolveResearchPath("verifications"),
    `task-${options.packet.taskId}`,
    reportId,
  );
  const reportPath = path.join(reportDirectory, `${reportId}.json`);
  const candidateId = options.candidateId ?? options.strategyId;
  const baselineCallBudget = options.packet.baselineCallBudget;
  const verificationPlan = options.packet.proof?.verificationPlan;
  if (!verificationPlan) {
    throw new Error(
      `Task packet ${options.packet.packetId} does not include a verification plan.`,
    );
  }

  const sandboxReset =
    options.sandboxResetOverride ??
    (await runSandboxReset({
      base_url: sandboxCredentials.base_url,
      session_token: sandboxCredentials.session_token,
      taskId: options.packet.taskId,
      strategyId: options.strategyId,
      input: options.input,
      now: options.now,
    }));
  if (sandboxReset.exitCode !== 0) {
    const failure = await writeVerificationFailureReport({
      candidateStorePath:
        options.candidateStorePath ?? DEFAULT_CANDIDATE_STORE_PATH,
      createdAt,
      reportId,
      reportPath,
      packet: options.packet,
      packetPath: options.packetPath,
      strategyId: options.strategyId,
      candidateId,
      stageDirectory: path.join(reportDirectory, "stage"),
      artifactPath: "",
      sandboxReset,
      failureStage: "reset",
      baselineCallBudget,
      message: buildSandboxResetFailureMessage(sandboxReset),
    });
    throw new ResearchVerificationFailure(
      failure.report.verdict.message,
      failure.reportPath,
      failure.report,
    );
  }

  const selectionConfig = await createSelectionOverride(
    options.packet.taskId,
    options.strategyId,
  );
  const runContext = {
    runId: reportId,
    stageDirectory: path.join(reportDirectory, "stage"),
    artifactRoot: path.join(reportDirectory, "artifacts"),
  };
  const solveResult = await runDeterministicSolvePipeline(
    {
      prompt: createVerificationPrompt(options.packet, options.strategyId),
      files: [],
      tripletexCredentials: {
        baseUrl: sandboxCredentials.base_url,
        sessionToken: sandboxCredentials.session_token,
        credentialSource: "tripletex2.sandbox-env",
      },
    },
    {
      mode: "sandbox",
      selectionConfigOverride: selectionConfig,
      runContext,
      taskUnderstanding: {
        result: {
          status: "resolved",
          taskId: options.packet.taskId,
          input: options.input,
        },
        taskSource: "manual-label",
        inputSource: "manual",
        notes: [
          `Research OS verifier ran one explicit challenger strategy (${options.strategyId}) in a reset sandbox.`,
        ],
      },
    },
  );

  const inspection = await evaluateVerificationPlan({
    plan: verificationPlan,
    artifact: solveResult.artifact,
    tripletex: createInspectionClient(sandboxCredentials),
  });
  const withinBudget =
    baselineCallBudget === undefined
      ? true
      : solveResult.artifact.execution.apiCallCount <= baselineCallBudget;
  const correctnessPassed =
    solveResult.artifact.execution.runtimeStatus === "completed" &&
    inspection.status === "passed";
  const verdictStatus = selectCandidateStatus(correctnessPassed, withinBudget);

  const report: ResearchVerificationReport = {
    schemaVersion: RESEARCH_VERIFICATION_REPORT_SCHEMA_VERSION,
    reportId,
    createdAt,
    taskId: options.packet.taskId,
    strategyId: options.strategyId,
    candidateId,
    ...(options.packetPath ? { packetPath: options.packetPath } : {}),
    stageDirectory: solveResult.stageDirectory,
    artifactPath: solveResult.artifactPath,
    sandboxReset,
    challengeRun: {
      runtimeStatus: solveResult.artifact.execution.runtimeStatus,
      apiCallCount: solveResult.artifact.execution.apiCallCount,
      ...(baselineCallBudget !== undefined ? { baselineCallBudget } : {}),
      withinBudget,
    },
    inspection,
    verdict: {
      status: verdictStatus,
      correctnessPassed,
      withinBudget,
      message: buildVerdictMessage(
        solveResult.artifact,
        correctnessPassed,
        withinBudget,
        baselineCallBudget,
      ),
    },
  };
  await persistVerificationReport({
    candidateStorePath: options.candidateStorePath ?? DEFAULT_CANDIDATE_STORE_PATH,
    packet: options.packet,
    packetPath: options.packetPath,
    reportPath,
    report,
  });

  return {
    report,
    reportPath,
  };
}

export async function evaluateVerificationPlan(input: {
  plan: ResearchVerificationPlan;
  artifact: RunArtifactV1;
  tripletex: Pick<TripletexClient, "get">;
}): Promise<ResearchVerificationReport["inspection"]> {
  const context = {
    artifact: input.artifact,
    input: input.artifact.input?.value ?? {},
    result: input.artifact.execution?.result ?? {},
    task: input.artifact.task ?? {},
    strategy: input.artifact.strategy ?? {},
  };
  let apiCallCount = 0;

  const checks: ResearchVerificationCheckResult[] = [];

  for (const check of input.plan.checks) {
    const requestPath = renderTemplate(check.pathTemplate, context);
    const requestQuery =
      check.query === undefined
        ? undefined
        : Object.fromEntries(
            Object.entries(check.query).map(([key, value]) => [
              key,
              renderTemplate(value, context),
            ]),
          );

    try {
      apiCallCount += 1;
      const response = await input.tripletex.get<Record<string, unknown>>(requestPath, {
        query: requestQuery,
      } as any);
      const selectedValue =
        check.type === "object"
          ? resolveObjectCheckTarget(check.responsePath, response)
          : resolveCollectionCheckTarget(check, response, context);
      const assertions = buildAssertionResults(
        check.assertions,
        selectedValue,
        context,
      );
      const status = assertions.every((assertion) => assertion.passed)
        ? "passed"
        : "failed";

      checks.push({
        checkId: check.checkId,
        description: check.description,
        status,
        requestPath,
        ...(requestQuery ? { requestQuery } : {}),
        assertions,
        selectedValue,
      });
    } catch (error) {
      checks.push({
        checkId: check.checkId,
        description: check.description,
        status: "failed",
        requestPath,
        ...(requestQuery ? { requestQuery } : {}),
        assertions: [],
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    status: checks.every((check) => check.status === "passed")
      ? "passed"
      : "failed",
    apiCallCount,
    checks,
  };
}

function resolveObjectCheckTarget(
  responsePath: string | undefined,
  response: Record<string, unknown>,
): unknown {
  return responsePath ? getPathValue(response, responsePath) : response;
}

function resolveCollectionCheckTarget(
  check: ResearchVerificationPlan["checks"][number] & { type: "collection" },
  response: Record<string, unknown>,
  context: Record<string, unknown>,
): unknown {
  const collection = getPathValue(response, check.collectionPath);
  if (!Array.isArray(collection)) {
    throw new Error(
      `Collection check "${check.checkId}" expected "${check.collectionPath}" to resolve to an array.`,
    );
  }
  if (collection.length === 0) {
    throw new Error(`Collection check "${check.checkId}" returned no values to inspect.`);
  }
  if (!check.matchPath) {
    return collection[0];
  }

  const expectedValue = check.matchFromPath
    ? getPathValue(context, check.matchFromPath)
    : undefined;
  const matched = collection.find((entry) =>
    isDeepStrictEqual(getPathValue(entry, check.matchPath!), expectedValue),
  );
  if (matched === undefined) {
    throw new Error(
      `Collection check "${check.checkId}" did not find a value where "${check.matchPath}" matched "${check.matchFromPath}".`,
    );
  }

  return matched;
}

function buildAssertionResults(
  assertions: readonly ResearchVerificationAssertion[],
  selectedValue: unknown,
  context: Record<string, unknown>,
): ResearchVerificationCheckResult["assertions"] {
  return assertions.map((assertion) => {
    const actualValue = getPathValue(selectedValue, assertion.actualPath);
    const expectedValue = getPathValue(context, assertion.equalsFromPath);
    return {
      actualPath: assertion.actualPath,
      expectedPath: assertion.equalsFromPath,
      actualValue,
      expectedValue,
      passed: isDeepStrictEqual(actualValue, expectedValue),
    };
  });
}

function renderTemplate(
  template: string,
  context: Record<string, unknown>,
): string {
  return template.replaceAll(/\{\{\s*([^}]+?)\s*\}\}/g, (_match, rawPath) => {
    const value = getPathValue(context, String(rawPath).trim());
    if (
      typeof value === "object" &&
      value !== null
    ) {
      throw new Error(
        `Template path "${String(rawPath).trim()}" resolved to a non-scalar value.`,
      );
    }
    if (value === undefined) {
      throw new Error(`Template path "${String(rawPath).trim()}" resolved to undefined.`);
    }

    return String(value);
  });
}

function getPathValue(root: unknown, dottedPath: string): unknown {
  if (dottedPath.length === 0) {
    return root;
  }

  return dottedPath.split(".").reduce<unknown>((current, segment) => {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (Array.isArray(current)) {
      const index = Number(segment);
      return Number.isInteger(index) ? current[index] : undefined;
    }
    if (typeof current !== "object") {
      return undefined;
    }

    return (current as Record<string, unknown>)[segment];
  }, root);
}

function createVerificationPrompt(
  packet: ResearchTaskPacket,
  strategyId: string,
): string {
  return [
    `Research OS verifier run for task ${packet.taskId} (${packet.taskName}).`,
    `Strategy under test: ${strategyId}.`,
    "Task understanding is pinned manually for this run.",
    "This prompt exists only to give the deterministic runtime a stable request fingerprint.",
  ].join(" ");
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
    selectionConfigId: `${loaded.config.selectionConfigId}.verify.${taskId}.${sanitizeId(strategyId)}`,
    taskStrategies: {
      ...loaded.config.taskStrategies,
      [taskId]: strategyId,
    },
  };
}

function createInspectionClient(credentials: {
  base_url: string;
  session_token: string;
}): Pick<TripletexClient, "get"> {
  return createTripletexClient({
    baseUrl: credentials.base_url,
    credentials: {
      sessionToken: credentials.session_token,
      credentialSource: "tripletex2.sandbox-env",
    },
  });
}

async function runSandboxReset(input: {
  base_url: string;
  session_token: string;
  taskId: string;
  strategyId: string;
  input: Record<string, unknown>;
  now?: () => Date;
}): Promise<ResearchVerificationReport["sandboxReset"]> {
  return runResearchSandboxReset({
    credentials: {
      base_url: input.base_url,
      session_token: input.session_token,
    },
    taskId: input.taskId,
    strategyId: input.strategyId,
    input: input.input,
    now: input.now,
  });
}

async function writeVerificationFailureReport(input: {
  candidateStorePath: string;
  createdAt: string;
  reportId: string;
  reportPath: string;
  packet: ResearchTaskPacket;
  packetPath?: string;
  strategyId: string;
  candidateId: string;
  stageDirectory: string;
  artifactPath: string;
  sandboxReset: ResearchVerificationReport["sandboxReset"];
  failureStage: NonNullable<ResearchVerificationReport["failureStage"]>;
  baselineCallBudget?: number;
  message: string;
}): Promise<RunSandboxVerificationResult> {
  const report: ResearchVerificationReport = {
    schemaVersion: RESEARCH_VERIFICATION_REPORT_SCHEMA_VERSION,
    reportId: input.reportId,
    createdAt: input.createdAt,
    taskId: input.packet.taskId,
    strategyId: input.strategyId,
    candidateId: input.candidateId,
    ...(input.packetPath ? { packetPath: input.packetPath } : {}),
    stageDirectory: input.stageDirectory,
    artifactPath: input.artifactPath,
    sandboxReset: input.sandboxReset,
    failureStage: input.failureStage,
    challengeRun: {
      runtimeStatus: "not-run",
      apiCallCount: 0,
      ...(input.baselineCallBudget !== undefined
        ? { baselineCallBudget: input.baselineCallBudget }
        : {}),
      withinBudget: false,
    },
    inspection: {
      status: "failed",
      apiCallCount: 0,
      checks: [],
    },
    verdict: {
      status: "needs-review",
      correctnessPassed: false,
      withinBudget: false,
      message: input.message,
    },
  };
  await persistVerificationReport({
    candidateStorePath: input.candidateStorePath,
    packet: input.packet,
    packetPath: input.packetPath,
    reportPath: input.reportPath,
    report,
  });
  return {
    report,
    reportPath: input.reportPath,
  };
}

function buildSandboxResetFailureMessage(
  sandboxReset: ResearchVerificationReport["sandboxReset"],
): string {
  return [
    "Sandbox reset failed before challenger verification started.",
    `Command: ${sandboxReset.command}`,
    `Exit code: ${sandboxReset.exitCode}`,
    ...(sandboxReset.durationMs !== undefined
      ? [`Duration: ${sandboxReset.durationMs}ms`]
      : []),
    ...(sandboxReset.highlights && sandboxReset.highlights.length > 0
      ? sandboxReset.highlights
      : fallbackResetLines(sandboxReset)),
  ]
    .filter((part) => part.length > 0)
    .join("\n");
}

function extractResetHighlights(stdout: string, stderr: string): string[] {
  const candidates = `${stdout}\n${stderr}`
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => {
      return (
        line.startsWith("reset summary:") ||
        line.startsWith("reset blocker:") ||
        line.startsWith("reset aborted after") ||
        line.includes("unsupported reset target:") ||
        line.includes(" failed:")
      );
    });

  return Array.from(new Set(candidates)).slice(0, 12);
}

function fallbackResetLines(
  sandboxReset: ResearchVerificationReport["sandboxReset"],
): string[] {
  return [
    ...sandboxReset.stderr
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean),
    ...sandboxReset.stdout
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(-5),
  ].slice(0, 12);
}

async function persistVerificationReport(input: {
  candidateStorePath: string;
  packet: ResearchTaskPacket;
  packetPath?: string;
  reportPath: string;
  report: ResearchVerificationReport;
}): Promise<void> {
  await writeJsonFile(input.reportPath, input.report);
  await updateCandidateStoreFromVerification(input);
}

export async function updateCandidateStoreFromVerification(input: {
  candidateStorePath: string;
  packet: ResearchTaskPacket;
  packetPath?: string;
  reportPath: string;
  report: ResearchVerificationReport;
}): Promise<void> {
  const store = await loadCandidateStore(input.candidateStorePath);
  const existing = store.entries.find(
    (entry) => entry.candidateId === input.report.candidateId,
  );
  const packetStrategy =
    input.packet.availableStrategies.find(
      (strategy) => strategy.strategyId === input.report.strategyId,
    ) ??
    (input.packet.activeStrategy?.strategyId === input.report.strategyId
      ? input.packet.activeStrategy
      : undefined);
  const nextRecord: CandidateRecord = {
    candidateId: input.report.candidateId,
    taskId: input.packet.taskId,
    strategyId: input.report.strategyId,
    ...(existing?.strategyPath
      ? { strategyPath: existing.strategyPath }
      : packetStrategy?.strategyPath
        ? { strategyPath: packetStrategy.strategyPath }
        : {}),
    ...(existing?.strategyName
      ? { strategyName: existing.strategyName }
      : packetStrategy?.strategyName
        ? { strategyName: packetStrategy.strategyName }
        : {}),
    status: input.report.verdict.status,
    ...(input.packetPath ? { packetPath: input.packetPath } : {}),
    latestVerificationReportPath: input.reportPath,
    latestSandboxVerdict: {
      correctnessPassed: input.report.verdict.correctnessPassed,
      withinBudget: input.report.verdict.withinBudget,
      apiCallCount: input.report.challengeRun.apiCallCount,
      ...(input.report.challengeRun.baselineCallBudget !== undefined
        ? { baselineCallBudget: input.report.challengeRun.baselineCallBudget }
        : {}),
      verificationReportPath: input.reportPath,
    },
    notes: dedupeNotes([
      ...(existing?.notes ?? []),
      input.report.verdict.message,
    ]),
    createdAt: existing?.createdAt ?? input.report.createdAt,
    updatedAt: input.report.createdAt,
  };
  const nextStore = upsertCandidateRecord(store, nextRecord);
  await writeCandidateStore(nextStore, input.candidateStorePath);
}

function dedupeNotes(notes: readonly string[]): string[] {
  return Array.from(new Set(notes.map((note) => note.trim()).filter(Boolean)));
}

function selectCandidateStatus(
  correctnessPassed: boolean,
  withinBudget: boolean,
): CandidateStatus {
  if (!correctnessPassed) {
    return "sandbox-fail";
  }
  if (!withinBudget) {
    return "needs-review";
  }

  return "sandbox-pass";
}

function buildVerdictMessage(
  artifact: RunArtifactV1,
  correctnessPassed: boolean,
  withinBudget: boolean,
  baselineCallBudget: number | undefined,
): string {
  if (artifact.execution.runtimeStatus !== "completed") {
    return `Challenger runtime did not complete cleanly (status=${artifact.execution.runtimeStatus}).`;
  }
  if (!correctnessPassed) {
    return "Challenger ran but post-run inspection failed.";
  }
  if (!withinBudget && baselineCallBudget !== undefined) {
    return `Challenger produced the expected sandbox state but used ${artifact.execution.apiCallCount} calls against a ${baselineCallBudget}-call baseline budget.`;
  }

  return "Challenger produced the expected sandbox state within the current baseline call budget.";
}

function createReportId(
  taskId: string,
  createdAt: string,
  strategyId: string,
): string {
  return `verify-${taskId}-${sanitizeId(strategyId)}-${createdAt.replace(/[:.]/g, "-")}`;
}

function sanitizeId(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, "-");
}

function resolveNow(now?: () => Date): Date {
  return now ? now() : new Date();
}
