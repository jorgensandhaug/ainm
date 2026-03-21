import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type {
  ActiveStrategyResolver,
  ResolvedActiveTaskStrategy,
} from "../registry/active-strategy-selection";
import {
  DEFAULT_ACTIVE_STRATEGY_SELECTION_CONFIG_PATH,
  getTaskSpec,
  loadActiveStrategyResolver,
  taskSpecs,
} from "../registry/tasks";
import {
  type CodexTaskUnderstandingOptions,
  runCodexTaskUnderstanding,
} from "./codex-task-understanding";
import { isNotImplementedStrategyId } from "../tasks/shared/not-implemented";
import {
  RUN_ARTIFACT_SCHEMA_VERSION,
  type ActiveStrategySelectionConfig,
  type ClassifierExtractorInput,
  type InputSource,
  type RunArtifactV1,
  type RunExecutionError,
  type RunMode,
  type RuntimeClock,
  type TaskSource,
  type TaskUnderstandingCode,
  type TaskUnderstandingResult,
  type TripletexCredentialCompanyId,
  type TripletexFetch,
} from "./contracts";
import { writeCanonicalRunArtifact } from "./run-artifact-writer";
import {
  TripletexHttpError,
  createTripletexCallLog,
  createTripletexClient,
} from "./tripletex-client";
import {
  appendTaskUnderstandingToPromptCorpus,
  inferPromptCorpusSource,
} from "./prompt-corpus";
import {
  getAttachmentFileBytes,
  normalizeAttachmentTextContent,
  stageAttachmentFiles,
} from "./attachment-files";

const UNRESOLVED_TASK_ID = "unresolved-task-understanding";
const UNRESOLVED_INPUT_SCHEMA_ID = "task-understanding.unresolved.v1";
const UNRESOLVED_STRATEGY_ID = "system.not-run.unresolved-task-understanding.v1";
const UNRESOLVED_STRATEGY_NAME = "Not run due to unresolved task understanding";
const UNRESOLVED_STRATEGY_PATH = "src/runtime/solve-pipeline.ts";
const STAGE_REQUEST_SCHEMA_VERSION = "tripletex2.solve-stage-request.v1";
const STAGE_RESULT_SCHEMA_VERSION = "tripletex2.solve-stage-result.v1";

export interface SolveRequestFile {
  fileName: string;
  path?: string;
  textContent?: string;
  mediaType?: string;
  contentBase64?: string;
}

export interface CompetitionSolveRequest {
  prompt: string;
  files?: readonly SolveRequestFile[];
  tripletex_credentials: {
    base_url: string;
    session_token: string;
    company_id?: TripletexCredentialCompanyId;
    credential_source?: string;
  };
}

export interface SolveRequest {
  prompt: string;
  files: readonly SolveRequestFile[];
  tripletexCredentials: {
    baseUrl: string;
    sessionToken: string;
    companyId?: TripletexCredentialCompanyId;
    credentialSource?: string;
  };
}

export interface SolvePipelineRunContext {
  runId: string;
  stageDirectory: string;
  artifactRoot: string;
}

export interface ProvidedTaskUnderstanding<
  TInput extends object = Record<string, unknown>,
  TTaskId extends string = string,
> {
  result: TaskUnderstandingResult<TInput, TTaskId>;
  taskSource?: TaskSource;
  inputSource?: InputSource;
  notes?: readonly string[];
}

export interface SolvePipelineOptions {
  mode?: RunMode;
  selectionConfigPath?: string;
  selectionConfigOverride?: ActiveStrategySelectionConfig;
  outputRoot?: string;
  promptCorpusPath?: string;
  includePromptText?: boolean;
  requestSummary?: string;
  requestId?: string;
  deadlineMs?: number;
  now?: () => Date;
  clock?: RuntimeClock;
  fetch?: TripletexFetch;
  runContext?: SolvePipelineRunContext;
  taskUnderstanding?: ProvidedTaskUnderstanding;
  taskUnderstandingResolver?: (
    input: ClassifierExtractorInput,
  ) => Promise<TaskUnderstandingResult<any, string>>;
  classifierExtractor?: (
    input: ClassifierExtractorInput,
  ) => Promise<TaskUnderstandingResult<any, string>>;
  codexTaskUnderstanding?: CodexTaskUnderstandingOptions;
}

export interface SolvePipelineResult {
  artifact: RunArtifactV1;
  artifactPath: string;
  stageDirectory: string;
  sidecarPaths: readonly string[];
}

interface EffectiveTaskUnderstanding {
  result: TaskUnderstandingResult<any, string>;
  taskSource: TaskSource;
  inputSource: InputSource;
  notes: readonly string[];
}

export interface DeterministicSolveSelection {
  taskUnderstanding: EffectiveTaskUnderstanding;
  taskId?: string;
  taskSpec?: ReturnType<typeof getTaskSpec>;
  activeStrategyResolver?: ActiveStrategyResolver;
  selection?: ResolvedActiveTaskStrategy;
  selectionError?: RunExecutionError;
}

export function normalizeCompetitionSolveRequest(
  request: CompetitionSolveRequest,
): SolveRequest {
  return {
    prompt: request.prompt,
    files: (request.files ?? []).map(normalizeSolveRequestFile),
    tripletexCredentials: {
      baseUrl: request.tripletex_credentials.base_url,
      sessionToken: request.tripletex_credentials.session_token,
      companyId: request.tripletex_credentials.company_id,
      credentialSource: request.tripletex_credentials.credential_source,
    },
  };
}

export async function runDeterministicSolvePipeline(
  request: SolveRequest,
  options: SolvePipelineOptions = {},
): Promise<SolvePipelineResult> {
  const mode = options.mode ?? "sandbox";
  const createdAt = resolveNow(options.now).toISOString();
  const runContext = resolveRunContext({
    createdAt,
    mode,
    prompt: request.prompt,
    outputRoot: options.outputRoot,
    runContext: options.runContext,
  });
  const stagedRequest = await stageSolveRequest(request, runContext.stageDirectory);

  await writeStageRequestFile({
    createdAt,
    mode,
    request: stagedRequest,
    requestId: options.requestId,
    runContext,
  });

  const selectionResult = await resolveDeterministicSolveSelection(
    stagedRequest,
    options,
  );
  const {
    taskUnderstanding,
    taskId,
    taskSpec,
    activeStrategyResolver,
    selection,
    selectionError: initialSelectionError,
  } = selectionResult;
  await appendTaskUnderstandingToPromptCorpus({
    corpusPath: options.promptCorpusPath,
    request: stagedRequest,
    result: taskUnderstanding.result,
    runId: runContext.runId,
    source: inferPromptCorpusSource({
      mode,
      runId: runContext.runId,
      stageDirectory: runContext.stageDirectory,
    }),
    timestamp: resolveNow(options.now).toISOString(),
  });

  const callLog = createTripletexCallLog();
  const tripletex = createTripletexClient({
    baseUrl: stagedRequest.tripletexCredentials.baseUrl,
    credentials: {
      sessionToken: stagedRequest.tripletexCredentials.sessionToken,
      companyId: stagedRequest.tripletexCredentials.companyId,
      credentialSource: stagedRequest.tripletexCredentials.credentialSource,
    },
    fetch: options.fetch,
    capture: callLog,
  });
  const clock = options.clock ?? createUtcClock(options.now);
  const deadlineMs = options.deadlineMs ?? 300_000;

  let runtimeStatus: RunArtifactV1["execution"]["runtimeStatus"] = "not-run";
  let strategyResult: RunArtifactV1["execution"]["result"];
  let executionError = initialSelectionError;
  let startedAt: string | undefined;
  let completedAt: string | undefined;
  let durationMs: number | undefined;

  if (
    taskUnderstanding.result.status === "resolved" &&
    selection &&
    !executionError
  ) {
    startedAt = resolveNow(options.now).toISOString();
    const startedAtMs = Date.parse(startedAt);

    try {
      strategyResult = await selection.strategy.run(
        {
          tripletex,
          clock,
          request: {
            prompt: stagedRequest.prompt,
            files: stagedRequest.files,
          },
        },
        taskUnderstanding.result.input,
      );
      runtimeStatus = "completed";
    } catch (error) {
      runtimeStatus = "failed";
      executionError = toRunExecutionError(error);
    }

    completedAt = resolveNow(options.now).toISOString();
    durationMs = Math.max(Date.parse(completedAt) - startedAtMs, 0);
  }

  const executionSnapshot = callLog.snapshot();
  const traceSidecarNote =
    executionSnapshot.apiCallCount > 0
      ? `Captured ${executionSnapshot.apiCallCount} Tripletex API calls.`
      : "No Tripletex API calls were made before the canonical artifact was written.";
  const analysisNotes = [
    ...taskUnderstanding.notes,
    runtimeStatus === "not-run"
      ? "Deterministic runtime did not start because task understanding or strategy selection was unresolved."
      : "Deterministic runtime started only after the task-understanding handoff.",
  ];

  const artifact: RunArtifactV1 = {
    schemaVersion: RUN_ARTIFACT_SCHEMA_VERSION,
    runId: runContext.runId,
    createdAt,
    mode,
    task: buildRunTaskInfo({
      taskId,
      taskSource: taskUnderstanding.taskSource,
      taskSpec,
      selection,
    }),
    strategy: buildRunStrategyInfo(selection),
    selection: buildRunSelectionInfo({
      activeStrategyResolver,
      requestedTaskId:
        taskUnderstanding.taskSource === "manual-label" ||
        taskUnderstanding.taskSource === "replay-label" ||
        taskUnderstanding.taskSource === "request-label"
          ? taskId
          : undefined,
      selectionConfigPath:
        options.selectionConfigPath ?? DEFAULT_ACTIVE_STRATEGY_SELECTION_CONFIG_PATH,
    }),
    request: {
      requestFingerprint: createRequestFingerprint(request),
      promptText: options.includePromptText === false ? undefined : request.prompt,
      promptSummary: options.requestSummary ?? summarizePrompt(request.prompt),
      files: request.files.map(toRunRequestFile),
      credentialSource: request.tripletexCredentials.credentialSource,
    },
    input: buildRunInputInfo({
      inputSource: taskUnderstanding.inputSource,
      result: taskUnderstanding.result,
      taskSpec,
    }),
    execution: {
      ...(startedAt ? { startedAt } : {}),
      ...(completedAt ? { completedAt } : {}),
      ...(durationMs !== undefined ? { durationMs } : {}),
      deadlineMs,
      runtimeStatus,
      apiCallCount: executionSnapshot.apiCallCount,
      api4xxCount: executionSnapshot.api4xxCount,
      api5xxCount: executionSnapshot.api5xxCount,
      apiCalls: executionSnapshot.apiCalls,
      ...(strategyResult ? { result: strategyResult } : {}),
      ...(executionError ? { error: executionError } : {}),
    },
    attribution: buildInitialAttribution(mode),
    evaluation: buildInitialEvaluation(mode),
    analysis: {
      notes: analysisNotes,
      ...(runtimeStatus === "not-run" && taskUnderstanding.result.status === "unresolved"
        ? { failureMode: taskUnderstanding.result.code }
        : {}),
    },
  };

  const written = await writeCanonicalRunArtifact({
    artifact,
    outputRoot: runContext.artifactRoot,
    sidecars: [
      {
        sidecarId: "trace-1",
        kind: "sanitized-trace",
        payload: {
          trace: executionSnapshot.apiCalls,
          notes: [traceSidecarNote],
        },
        summary:
          runtimeStatus === "not-run"
            ? "Sanitized trace for a not-run solve attempt."
            : `Sanitized trace for ${selection?.strategy.strategyId ?? UNRESOLVED_STRATEGY_ID}.`,
      },
    ],
  });

  const sidecarPaths = written.sidecars.map((sidecar) => sidecar.path);
  await writeStageResultFile({
    artifactPath: written.artifactPath,
    createdAt,
    requestId: options.requestId,
    runContext,
    runtimeStatus: written.artifact.execution.runtimeStatus,
    sidecarPaths,
    taskId: written.artifact.task.taskId,
  });

  return {
    artifact: written.artifact,
    artifactPath: written.artifactPath,
    stageDirectory: runContext.stageDirectory,
    sidecarPaths,
  };
}

export async function runCompetitionSolvePipeline(
  request: CompetitionSolveRequest,
  options: SolvePipelineOptions = {},
): Promise<SolvePipelineResult> {
  return runDeterministicSolvePipeline(
    normalizeCompetitionSolveRequest(request),
    options,
  );
}

export async function resolveDeterministicSolveSelection(
  request: SolveRequest,
  options: SolvePipelineOptions = {},
): Promise<DeterministicSolveSelection> {
  const taskUnderstanding = await resolveTaskUnderstanding(request, options);
  const taskId = getTaskUnderstandingTaskId(taskUnderstanding.result);
  const taskSpec = taskId ? getTaskSpec(taskId) : undefined;

  let activeStrategyResolver: ActiveStrategyResolver | undefined;
  let selection: ResolvedActiveTaskStrategy | undefined;
  let selectionError: RunExecutionError | undefined;

  if (taskId) {
    try {
      activeStrategyResolver = await loadActiveStrategyResolver(
        options.selectionConfigPath,
        options.selectionConfigOverride,
      );
      selection = activeStrategyResolver.getResolvedSelection(taskId);
    } catch (error) {
      if (taskUnderstanding.result.status === "resolved") {
        selectionError = toRunExecutionError(error);
      }
    }

    if (
      taskUnderstanding.result.status === "resolved" &&
      !selection &&
      !selectionError
    ) {
      selectionError = {
        code: "strategy-not-selected",
        message:
          `Task "${taskId}" did not resolve to an active deterministic strategy ` +
          `in "${options.selectionConfigPath ?? DEFAULT_ACTIVE_STRATEGY_SELECTION_CONFIG_PATH}".`,
      };
    }
  }

  return {
    taskUnderstanding,
    taskId,
    taskSpec,
    activeStrategyResolver,
    selection,
    selectionError,
  };
}

export function isNotImplementedStrategySelection(
  selection: ResolvedActiveTaskStrategy | undefined,
): boolean {
  return (
    selection !== undefined &&
    isNotImplementedStrategyId(selection.strategy.strategyId)
  );
}

async function resolveTaskUnderstanding(
  request: SolveRequest,
  options: SolvePipelineOptions,
): Promise<EffectiveTaskUnderstanding> {
  if (options.taskUnderstanding) {
    return {
      result: options.taskUnderstanding.result,
      taskSource: options.taskUnderstanding.taskSource ?? "manual-label",
      inputSource: options.taskUnderstanding.inputSource ?? "manual",
      notes: options.taskUnderstanding.notes ?? [],
    };
  }

  const resolver =
    options.taskUnderstandingResolver ?? options.classifierExtractor;

  if (!resolver) {
    const codexTaskUnderstanding = await runCodexTaskUnderstanding(
      {
        request: {
          prompt: request.prompt,
          files: request.files,
        },
        taskSpecs,
      },
      options.codexTaskUnderstanding,
    );

    return {
      result: codexTaskUnderstanding.result,
      taskSource: "llm-classifier",
      inputSource: "llm-extractor",
      notes: codexTaskUnderstanding.notes,
    };
  }

  const result = await resolver({
    request: {
      prompt: request.prompt,
      files: request.files,
    },
    taskSpecs,
  });

  return {
    result,
    taskSource: "llm-classifier",
    inputSource: "llm-extractor",
    notes: [
      "Task understanding used an injected extractor instead of the default Codex codex-environment path.",
    ],
  };
}

function buildRunTaskInfo(input: {
  taskId?: string;
  taskSource: TaskSource;
  taskSpec?: { taskId: string; taskName: string };
  selection?: ResolvedActiveTaskStrategy;
}): RunArtifactV1["task"] {
  const resolvedTaskId =
    input.selection?.taskId ??
    input.taskSpec?.taskId ??
    input.taskId ??
    UNRESOLVED_TASK_ID;
  const taskName =
    input.selection?.taskModule.task.taskName ??
    input.taskSpec?.taskName ??
    (resolvedTaskId === UNRESOLVED_TASK_ID ? "Unresolved task understanding" : undefined);

  return {
    taskId: resolvedTaskId,
    ...(taskName ? { taskName } : {}),
    taskSource: input.taskSource,
  };
}

function buildRunStrategyInfo(
  selection: ResolvedActiveTaskStrategy | undefined,
): RunArtifactV1["strategy"] {
  if (selection) {
    return {
      strategyId: selection.strategy.strategyId,
      strategyName: selection.strategy.name,
      strategyPath: selection.strategy.strategyPath,
      strategyStatus: selection.strategy.status,
    };
  }

  return {
    strategyId: UNRESOLVED_STRATEGY_ID,
    strategyName: UNRESOLVED_STRATEGY_NAME,
    strategyPath: UNRESOLVED_STRATEGY_PATH,
    strategyStatus: "baseline",
  };
}

function buildRunSelectionInfo(input: {
  activeStrategyResolver?: ActiveStrategyResolver;
  requestedTaskId?: string;
  selectionConfigPath: string;
}): RunArtifactV1["selection"] {
  return {
    selectionConfigId:
      input.activeStrategyResolver?.config.selectionConfigId ?? "not-selected",
    selectionConfigPath:
      input.activeStrategyResolver?.configPath ?? input.selectionConfigPath,
    ...(input.requestedTaskId ? { requestedTaskId: input.requestedTaskId } : {}),
  };
}

function buildRunInputInfo(input: {
  inputSource: InputSource;
  result: TaskUnderstandingResult<any, string>;
  taskSpec?: { inputSchemaId: string };
}): RunArtifactV1["input"] {
  if (input.result.status === "resolved") {
    return {
      inputSchemaId: input.taskSpec?.inputSchemaId ?? UNRESOLVED_INPUT_SCHEMA_ID,
      status: "resolved",
      source: input.inputSource,
      value: input.result.input as Record<string, unknown>,
    };
  }

  return {
    inputSchemaId: input.taskSpec?.inputSchemaId ?? UNRESOLVED_INPUT_SCHEMA_ID,
    status: toRunInputStatus(input.result.code),
    source: input.inputSource,
    ...(input.result.partialInput
      ? { partialValue: input.result.partialInput as Record<string, unknown> }
      : {}),
    issues: [
      {
        code: input.result.code,
        message: input.result.message,
      },
    ],
  };
}

function buildInitialAttribution(
  mode: RunMode,
): RunArtifactV1["attribution"] {
  if (mode === "competition") {
    return {
      status: "pending",
    };
  }

  return {
    status: "not-needed",
  };
}

function buildInitialEvaluation(
  mode: RunMode,
): RunArtifactV1["evaluation"] {
  if (mode === "competition") {
    return {
      status: "pending",
    };
  }

  if (mode === "replay") {
    return {
      status: "not-available",
      source: "replay",
      rawNotes: [
        "Replay runs do not have live competition scoring in this wave.",
      ],
    };
  }

  return {
    status: "not-available",
    rawNotes: [
      "Sandbox and dry-run executions do not have live competition scoring in this wave.",
    ],
  };
}

function resolveRunContext(input: {
  createdAt: string;
  mode: RunMode;
  prompt: string;
  outputRoot?: string;
  runContext?: SolvePipelineRunContext;
}): SolvePipelineRunContext {
  if (input.runContext) {
    return input.runContext;
  }

  const runId = createRunId({
    createdAt: input.createdAt,
    mode: input.mode,
    prompt: input.prompt,
  });

  return {
    runId,
    stageDirectory: path.resolve(
      process.cwd(),
      "data",
      input.mode,
      "runs",
      runId,
    ),
    artifactRoot: path.resolve(process.cwd(), input.outputRoot ?? "runs"),
  };
}

async function writeStageRequestFile(input: {
  createdAt: string;
  mode: RunMode;
  request: SolveRequest;
  requestId?: string;
  runContext: SolvePipelineRunContext;
}): Promise<void> {
  await mkdir(input.runContext.stageDirectory, { recursive: true });
  await writeStageJson(
    path.join(input.runContext.stageDirectory, "request.json"),
    {
      schemaVersion: STAGE_REQUEST_SCHEMA_VERSION,
      createdAt: input.createdAt,
      mode: input.mode,
      requestId: input.requestId,
      runId: input.runContext.runId,
      request: {
        prompt: input.request.prompt,
        files: input.request.files.map((file) => ({
          fileName: file.fileName,
          ...(file.mediaType !== undefined ? { mediaType: file.mediaType } : {}),
          ...(file.path !== undefined ? { path: file.path } : {}),
          ...(file.textContent !== undefined ? { textContent: file.textContent } : {}),
        })),
        tripletexCredentials: {
          baseUrl: input.request.tripletexCredentials.baseUrl,
          companyId: input.request.tripletexCredentials.companyId,
          credentialSource: input.request.tripletexCredentials.credentialSource,
        },
      },
    },
  );
}

async function writeStageResultFile(input: {
  artifactPath: string;
  createdAt: string;
  requestId?: string;
  runContext: SolvePipelineRunContext;
  runtimeStatus: RunArtifactV1["execution"]["runtimeStatus"];
  sidecarPaths: readonly string[];
  taskId: string;
}): Promise<void> {
  await writeStageJson(
    path.join(input.runContext.stageDirectory, "result.json"),
    {
      schemaVersion: STAGE_RESULT_SCHEMA_VERSION,
      completedAt: resolveNow().toISOString(),
      createdAt: input.createdAt,
      requestId: input.requestId,
      runId: input.runContext.runId,
      taskId: input.taskId,
      runtimeStatus: input.runtimeStatus,
      artifactPath: input.artifactPath,
      sidecarPaths: [...input.sidecarPaths],
    },
  );
}

async function writeStageJson(
  filePath: string,
  value: unknown,
): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function getTaskUnderstandingTaskId(
  result: TaskUnderstandingResult<any, string>,
): string | undefined {
  return result.taskId;
}

function toRunInputStatus(
  code: TaskUnderstandingCode,
): RunArtifactV1["input"]["status"] {
  switch (code) {
    case "ambiguous-task":
    case "ambiguous-field-value":
    case "conflicting-field-values":
      return "ambiguous";
    default:
      return "failed";
  }
}

function createRequestFingerprint(request: SolveRequest): string {
  const hash = createHash("sha256");
  hash.update(request.prompt);
  for (const file of request.files) {
    hash.update("\n");
    hash.update(file.fileName);
    hash.update("\n");
    hash.update(file.mediaType ?? "");
    hash.update("\n");
    hash.update(getSolveRequestFileBytes(file));
  }

  return `req:${hash.digest("hex")}`;
}

function toRunRequestFile(
  file: SolveRequestFile,
): RunArtifactV1["request"]["files"][number] {
  const fileBytes = getSolveRequestFileBytes(file);

  return {
    fileName: file.fileName,
    mediaType: file.mediaType,
    byteSize: fileBytes.byteLength,
    sha256: `sha256:${createHash("sha256").update(fileBytes).digest("hex")}`,
  };
}

function getSolveRequestFileBytes(file: SolveRequestFile): Uint8Array {
  return getAttachmentFileBytes(file);
}

async function stageSolveRequest(
  request: SolveRequest,
  stageDirectory: string,
): Promise<SolveRequest> {
  const normalizedFiles = request.files.map(normalizeSolveRequestFile);
  const stagedFiles = await stageAttachmentFiles(stageDirectory, normalizedFiles);

  return {
    ...request,
    files: stagedFiles.map(normalizeSolveRequestFile),
  };
}

function normalizeSolveRequestFile(file: SolveRequestFile): SolveRequestFile {
  const textContent = normalizeAttachmentTextContent(file);

  return {
    fileName: file.fileName,
    ...(file.mediaType !== undefined ? { mediaType: file.mediaType } : {}),
    ...(file.contentBase64 !== undefined ? { contentBase64: file.contentBase64 } : {}),
    ...(file.path !== undefined ? { path: file.path } : {}),
    ...(textContent !== undefined ? { textContent } : {}),
  };
}

function summarizePrompt(prompt: string): string {
  const singleLine = prompt.replace(/\s+/g, " ").trim();
  if (singleLine.length <= 160) {
    return singleLine;
  }

  return `${singleLine.slice(0, 157)}...`;
}

function createRunId(input: {
  createdAt: string;
  mode: RunMode;
  prompt: string;
}): string {
  const timestamp = input.createdAt.replace(/[:.]/g, "-");
  const promptFingerprint = createHash("sha256")
    .update(input.prompt)
    .digest("hex")
    .slice(0, 8);

  return `${input.mode}-${timestamp}-${promptFingerprint}`;
}

function createUtcClock(now?: () => Date): RuntimeClock {
  return {
    today() {
      return resolveNow(now).toISOString().slice(0, 10);
    },
  };
}

function resolveNow(now?: () => Date): Date {
  return now ? now() : new Date();
}

function toRunExecutionError(error: unknown): RunExecutionError {
  if (error instanceof TripletexHttpError) {
    return {
      code: error.errorCode ?? `http-${error.status}`,
      message: error.message,
      retryable: error.retryable,
    };
  }

  if (error instanceof Error) {
    return {
      code: error.name || "runtime-error",
      message: error.message,
    };
  }

  return {
    code: "unknown-error",
    message: "Unknown execution error.",
  };
}
