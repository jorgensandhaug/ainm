import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  RUN_ARTIFACT_SCHEMA_VERSION,
  RUN_SIDECAR_SCHEMA_VERSION,
  type AttributionEvidenceSidecarPayload,
  type EvaluationEvidenceSidecarPayload,
  type GeneratedScriptSidecarPayload,
  type KnownRunSidecarFile,
  type ReflectionSummarySidecarPayload,
  type RunAnalysisInfo,
  type RunApiCall,
  type RunArtifactV1,
  type RunAttributionEvidence,
  type RunAttributionInfo,
  type RunEvaluationEvidence,
  type RunEvaluationInfo,
  type RunExecutionError,
  type RunExecutionInfo,
  type RunInputInfo,
  type RunInputIssue,
  type RunRequestFile,
  type RunRequestInfo,
  type RunSidecarFileV1,
  type RunSidecarKind,
  type RunSidecarMediaType,
  type RunSidecarRef,
  type RunSelectionInfo,
  type RunStrategyInfo,
  type RunTaskInfo,
  type SanitizedTraceSidecarPayload,
  type StrategyEntityIds,
  type StrategyResult,
} from "./contracts";

const DEFAULT_OUTPUT_ROOT = "runs";
const UTC_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const SAFE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const PROHIBITED_KEY_NAMES = new Set([
  "apikey",
  "api_key",
  "authorization",
  "password",
  "sessiontoken",
  "session_token",
  "tripletex_credentials",
]);
const PROHIBITED_STRING_PATTERNS = [
  /\bBasic\s+[A-Za-z0-9+/=_:-]{8,}/,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/,
];

export type SidecarAttachmentTarget = "attribution" | "evaluation";

export interface RunSidecarWriteInput<TPayload = unknown> {
  sidecarId: string;
  kind: RunSidecarKind;
  payload:
    | TPayload
    | SanitizedTraceSidecarPayload
    | ReflectionSummarySidecarPayload
    | AttributionEvidenceSidecarPayload
    | EvaluationEvidenceSidecarPayload
    | GeneratedScriptSidecarPayload;
  createdAt?: string;
  mediaType?: RunSidecarMediaType;
  summary?: string;
  attachTo?: SidecarAttachmentTarget;
  fileName?: string;
}

export interface WriteCanonicalRunArtifactParams {
  artifact: RunArtifactV1;
  sidecars?: readonly RunSidecarWriteInput[];
  outputRoot?: string;
}

export interface EnrichCanonicalRunArtifactParams {
  artifactPath: string;
  attribution?: RunAttributionInfo;
  evaluation?: RunEvaluationInfo;
  sidecars?: readonly RunSidecarWriteInput[];
}

export interface PreparedRunSidecarWrite {
  attachmentTarget?: SidecarAttachmentTarget;
  path: string;
  ref: RunSidecarRef;
  file: KnownRunSidecarFile;
  serialized: string;
}

export interface WrittenCanonicalRunArtifact {
  artifact: RunArtifactV1;
  artifactPath: string;
  artifactDirectory: string;
  serializedArtifact: string;
  sidecars: readonly PreparedRunSidecarWrite[];
}

export async function writeCanonicalRunArtifact(
  params: WriteCanonicalRunArtifactParams,
): Promise<WrittenCanonicalRunArtifact> {
  const artifactRoot = resolveOutputRoot(params.outputRoot);
  const artifactInput = validateArtifactInput(params.artifact);
  const artifactDirectory = path.join(
    artifactRoot,
    artifactInput.createdAt.slice(0, 10),
  );
  const artifactBaseName = `run-${artifactInput.runId}`;
  const artifactPath = path.join(artifactDirectory, `${artifactBaseName}.json`);
  const preparedSidecars = prepareSidecars({
    artifact: artifactInput,
    artifactBaseName,
    artifactDirectory,
    sidecars: params.sidecars ?? [],
    existingFileNames: [],
    existingSidecarIds: [],
  });
  const artifact = attachSidecarsToArtifact(artifactInput, preparedSidecars);
  validateSidecarReferences(artifact);

  const serializedArtifact = serializeRunArtifact(artifact);

  await mkdir(artifactDirectory, { recursive: true });
  for (const sidecar of preparedSidecars) {
    await writeTextFile(sidecar.path, sidecar.serialized);
  }
  await writeTextFile(artifactPath, serializedArtifact);

  return {
    artifact,
    artifactPath,
    artifactDirectory,
    serializedArtifact,
    sidecars: preparedSidecars,
  };
}

export async function enrichCanonicalRunArtifact(
  params: EnrichCanonicalRunArtifactParams,
): Promise<WrittenCanonicalRunArtifact> {
  const artifactPath = path.resolve(process.cwd(), params.artifactPath);
  const serializedOriginalArtifact = await readFile(artifactPath, "utf8");
  const parsedArtifact = JSON.parse(serializedOriginalArtifact) as RunArtifactV1;
  const artifactInput = validateArtifactInput(parsedArtifact, {
    allowSidecars: true,
  });
  const artifactDirectory = path.dirname(artifactPath);
  const artifactBaseName = path.basename(artifactPath, ".json");
  const preparedSidecars = prepareSidecars({
    artifact: artifactInput,
    artifactBaseName,
    artifactDirectory,
    sidecars: params.sidecars ?? [],
    existingFileNames: (artifactInput.sidecars ?? []).map((sidecar) => sidecar.path),
    existingSidecarIds: (artifactInput.sidecars ?? []).map((sidecar) => sidecar.sidecarId),
  });
  const nextAttribution = mergeEvidenceSidecarIds(
    params.attribution ?? artifactInput.attribution,
    preparedSidecars
      .filter((sidecar) => sidecar.attachmentTarget === "attribution")
      .map((sidecar) => sidecar.ref.sidecarId),
  );
  const nextEvaluation = mergeEvidenceSidecarIds(
    params.evaluation ?? artifactInput.evaluation,
    preparedSidecars
      .filter((sidecar) => sidecar.attachmentTarget === "evaluation")
      .map((sidecar) => sidecar.ref.sidecarId),
  );
  const artifact = normalizeRunArtifact({
    ...artifactInput,
    ...(nextAttribution ? { attribution: nextAttribution } : {}),
    ...(nextEvaluation ? { evaluation: nextEvaluation } : {}),
    sidecars: [
      ...(artifactInput.sidecars ?? []),
      ...preparedSidecars.map((sidecar) => sidecar.ref),
    ],
  });
  validateSidecarReferences(artifact);
  const serializedArtifact = serializeRunArtifact(artifact);

  for (const sidecar of preparedSidecars) {
    await writeTextFile(sidecar.path, sidecar.serialized);
  }
  await rewriteTextFile(artifactPath, serializedArtifact);

  return {
    artifact,
    artifactPath,
    artifactDirectory,
    serializedArtifact,
    sidecars: preparedSidecars,
  };
}

export function serializeRunArtifact(artifact: RunArtifactV1): string {
  return serializeJson(
    normalizeRunArtifact(validateArtifactInput(artifact, { allowSidecars: true })),
  );
}

export function serializeRunSidecarFile(
  sidecarFile: KnownRunSidecarFile,
): string {
  return serializeJson(normalizeRunSidecarFile(sidecarFile));
}

function resolveOutputRoot(outputRoot?: string): string {
  return path.resolve(process.cwd(), outputRoot ?? DEFAULT_OUTPUT_ROOT);
}

function validateArtifactInput(
  artifact: RunArtifactV1,
  options: {
    allowSidecars?: boolean;
  } = {},
): RunArtifactV1 {
  if (artifact.schemaVersion !== RUN_ARTIFACT_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported run artifact schemaVersion "${artifact.schemaVersion}". Expected "${RUN_ARTIFACT_SCHEMA_VERSION}".`,
    );
  }

  assertSafeIdentifier(artifact.runId, 'run artifact field "runId"');
  assertUtcTimestamp(artifact.createdAt, 'run artifact field "createdAt"');

  if (!options.allowSidecars && artifact.sidecars && artifact.sidecars.length > 0) {
    throw new Error(
      'Run artifact input must not include pre-populated "sidecars"; pass sidecars through writeCanonicalRunArtifact(...).',
    );
  }

  assertNoUnsafeSecrets(artifact, "run artifact");
  return artifact;
}

function prepareSidecars(params: {
  artifact: RunArtifactV1;
  artifactBaseName: string;
  artifactDirectory: string;
  sidecars: readonly RunSidecarWriteInput[];
  existingFileNames: readonly string[];
  existingSidecarIds: readonly string[];
}): PreparedRunSidecarWrite[] {
  const usedFileNames = new Set<string>(params.existingFileNames);
  const usedSidecarIds = new Set<string>(params.existingSidecarIds);

  return params.sidecars.map((sidecar) => {
    assertSafeIdentifier(sidecar.sidecarId, 'run sidecar field "sidecarId"');
    if (usedSidecarIds.has(sidecar.sidecarId)) {
      throw new Error(
        `Run sidecar id "${sidecar.sidecarId}" was provided more than once.`,
      );
    }
    usedSidecarIds.add(sidecar.sidecarId);

    const createdAt = sidecar.createdAt ?? params.artifact.createdAt;
    assertUtcTimestamp(createdAt, `run sidecar "${sidecar.sidecarId}" field "createdAt"`);
    assertNoUnsafeSecrets(sidecar.payload, `run sidecar "${sidecar.sidecarId}" payload`);

    const mediaType = sidecar.mediaType ?? "application/json";
    const fileName = resolveSidecarFileName({
      artifactBaseName: params.artifactBaseName,
      explicitFileName: sidecar.fileName,
      kind: sidecar.kind,
      sidecarId: sidecar.sidecarId,
      usedFileNames,
    });
    const file = normalizeRunSidecarFile({
      schemaVersion: RUN_SIDECAR_SCHEMA_VERSION,
      runId: params.artifact.runId,
      sidecarId: sidecar.sidecarId,
      kind: sidecar.kind,
      createdAt,
      payload: sortJsonValue(sidecar.payload),
    }) as KnownRunSidecarFile;
    const serialized = serializeJson(file);

    return {
      attachmentTarget: sidecar.attachTo,
      path: path.join(params.artifactDirectory, fileName),
      serialized,
      file,
      ref: normalizeRunSidecarRef({
        sidecarId: sidecar.sidecarId,
        kind: sidecar.kind,
        path: fileName,
        mediaType,
        createdAt,
        sha256: `sha256:${sha256Hex(serialized)}`,
        summary: sidecar.summary ?? inferSidecarSummary(sidecar.payload),
      }),
    };
  });
}

function attachSidecarsToArtifact(
  artifact: RunArtifactV1,
  sidecars: readonly PreparedRunSidecarWrite[],
): RunArtifactV1 {
  const linkedAttributionIds = sidecars
    .filter((sidecar) => sidecar.attachmentTarget === "attribution")
    .map((sidecar) => sidecar.ref.sidecarId);
  const linkedEvaluationIds = sidecars
    .filter((sidecar) => sidecar.attachmentTarget === "evaluation")
    .map((sidecar) => sidecar.ref.sidecarId);

  const artifactWithHooks = normalizeRunArtifact({
    ...artifact,
    attribution: mergeEvidenceSidecarIds(
      artifact.attribution,
      linkedAttributionIds,
    ),
    evaluation: mergeEvidenceSidecarIds(
      artifact.evaluation,
      linkedEvaluationIds,
    ),
    sidecars: sidecars.length > 0 ? sidecars.map((sidecar) => sidecar.ref) : undefined,
  });

  assertNoUnsafeSecrets(artifactWithHooks, "run artifact");
  return artifactWithHooks;
}

function mergeEvidenceSidecarIds<
  TInfo extends RunAttributionInfo | RunEvaluationInfo | undefined,
>(info: TInfo, linkedSidecarIds: readonly string[]): TInfo {
  if (!info) {
    if (linkedSidecarIds.length > 0) {
      throw new Error(
        "Cannot attach evidence sidecars without the corresponding attribution/evaluation block.",
      );
    }
    return info;
  }

  const existingIds = info.evidenceSidecarIds ?? [];
  const mergedIds = [...new Set([...existingIds, ...linkedSidecarIds])];
  if (mergedIds.length === 0) {
    return info;
  }

  return {
    ...info,
    evidenceSidecarIds: mergedIds,
  };
}

function validateSidecarReferences(artifact: RunArtifactV1): void {
  const knownIds = new Set((artifact.sidecars ?? []).map((sidecar) => sidecar.sidecarId));
  const duplicateIds = findDuplicateValues(
    (artifact.sidecars ?? []).map((sidecar) => sidecar.sidecarId),
  );
  if (duplicateIds.length > 0) {
    throw new Error(
      `Run artifact contains duplicate sidecar ids: ${duplicateIds.join(", ")}.`,
    );
  }

  validateEvidenceSidecarIds(
    artifact.attribution?.evidenceSidecarIds,
    knownIds,
    'run artifact "attribution.evidenceSidecarIds"',
  );
  validateEvidenceSidecarIds(
    artifact.evaluation?.evidenceSidecarIds,
    knownIds,
    'run artifact "evaluation.evidenceSidecarIds"',
  );
}

function validateEvidenceSidecarIds(
  sidecarIds: readonly string[] | undefined,
  knownIds: ReadonlySet<string>,
  label: string,
): void {
  if (!sidecarIds) {
    return;
  }

  for (const sidecarId of sidecarIds) {
    if (!knownIds.has(sidecarId)) {
      throw new Error(`${label} references unknown sidecarId "${sidecarId}".`);
    }
  }
}

function resolveSidecarFileName(input: {
  artifactBaseName: string;
  explicitFileName?: string;
  kind: RunSidecarKind;
  sidecarId: string;
  usedFileNames: Set<string>;
}): string {
  if (input.explicitFileName) {
    assertRelativeFileName(
      input.explicitFileName,
      `run sidecar "${input.sidecarId}" field "fileName"`,
    );
    if (input.usedFileNames.has(input.explicitFileName)) {
      throw new Error(
        `Run sidecar file name "${input.explicitFileName}" was provided more than once.`,
      );
    }
    input.usedFileNames.add(input.explicitFileName);
    return input.explicitFileName;
  }

  const baseName = `${input.artifactBaseName}.${getSidecarFileStem(input.kind)}`;
  const defaultFileName = `${baseName}.json`;
  if (!input.usedFileNames.has(defaultFileName)) {
    input.usedFileNames.add(defaultFileName);
    return defaultFileName;
  }

  const disambiguated = `${baseName}-${sanitizeFileComponent(input.sidecarId)}.json`;
  if (input.usedFileNames.has(disambiguated)) {
    throw new Error(
      `Generated sidecar file name "${disambiguated}" collided more than once.`,
    );
  }

  input.usedFileNames.add(disambiguated);
  return disambiguated;
}

function getSidecarFileStem(kind: RunSidecarKind): string {
  switch (kind) {
    case "sanitized-trace":
      return "trace";
    case "reflection-summary":
      return "reflection";
    case "attribution-evidence":
      return "attribution";
    case "evaluation-evidence":
      return "evaluation";
    case "generated-script":
      return "script";
  }
}

function inferSidecarSummary(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return undefined;
  }

  const summary = (payload as { summary?: unknown }).summary;
  return typeof summary === "string" && summary.trim().length > 0
    ? summary.trim()
    : undefined;
}

function normalizeRunArtifact(artifact: RunArtifactV1): RunArtifactV1 {
  return {
    schemaVersion: RUN_ARTIFACT_SCHEMA_VERSION,
    runId: artifact.runId,
    createdAt: artifact.createdAt,
    mode: artifact.mode,
    task: normalizeRunTaskInfo(artifact.task),
    strategy: normalizeRunStrategyInfo(artifact.strategy),
    selection: normalizeRunSelectionInfo(artifact.selection),
    request: normalizeRunRequestInfo(artifact.request),
    input: normalizeRunInputInfo(artifact.input),
    execution: normalizeRunExecutionInfo(artifact.execution),
    ...(artifact.attribution
      ? { attribution: normalizeRunAttributionInfo(artifact.attribution) }
      : {}),
    ...(artifact.evaluation
      ? { evaluation: normalizeRunEvaluationInfo(artifact.evaluation) }
      : {}),
    ...(artifact.sidecars ? { sidecars: artifact.sidecars.map(normalizeRunSidecarRef) } : {}),
    ...(artifact.analysis ? { analysis: normalizeRunAnalysisInfo(artifact.analysis) } : {}),
  };
}

function normalizeRunTaskInfo(task: RunTaskInfo): RunTaskInfo {
  return {
    taskId: task.taskId,
    ...(task.taskName !== undefined ? { taskName: task.taskName } : {}),
    ...(task.taskConfidence !== undefined
      ? { taskConfidence: task.taskConfidence }
      : {}),
    taskSource: task.taskSource,
  };
}

function normalizeRunStrategyInfo(strategy: RunStrategyInfo): RunStrategyInfo {
  return {
    strategyId: strategy.strategyId,
    ...(strategy.strategyName !== undefined
      ? { strategyName: strategy.strategyName }
      : {}),
    strategyPath: strategy.strategyPath,
    strategyStatus: strategy.strategyStatus,
  };
}

function normalizeRunSelectionInfo(
  selection: RunSelectionInfo,
): RunSelectionInfo {
  return {
    selectionConfigId: selection.selectionConfigId,
    selectionConfigPath: selection.selectionConfigPath,
    ...(selection.requestedTaskId !== undefined
      ? { requestedTaskId: selection.requestedTaskId }
      : {}),
  };
}

function normalizeRunRequestInfo(request: RunRequestInfo): RunRequestInfo {
  return {
    requestFingerprint: request.requestFingerprint,
    ...(request.promptText !== undefined ? { promptText: request.promptText } : {}),
    ...(request.promptSummary !== undefined
      ? { promptSummary: request.promptSummary }
      : {}),
    files: request.files.map(normalizeRunRequestFile),
    ...(request.credentialSource !== undefined
      ? { credentialSource: request.credentialSource }
      : {}),
  };
}

function normalizeRunRequestFile(file: RunRequestFile): RunRequestFile {
  return {
    fileName: file.fileName,
    ...(file.mediaType !== undefined ? { mediaType: file.mediaType } : {}),
    ...(file.byteSize !== undefined ? { byteSize: file.byteSize } : {}),
    ...(file.sha256 !== undefined ? { sha256: file.sha256 } : {}),
    ...(file.extractedFacts !== undefined
      ? { extractedFacts: [...file.extractedFacts] }
      : {}),
  };
}

function normalizeRunInputInfo(input: RunInputInfo): RunInputInfo {
  return {
    inputSchemaId: input.inputSchemaId,
    status: input.status,
    source: input.source,
    ...(input.confidence !== undefined ? { confidence: input.confidence } : {}),
    ...(input.value !== undefined
      ? { value: sortJsonValue(input.value) as Record<string, unknown> }
      : {}),
    ...(input.partialValue !== undefined
      ? {
          partialValue: sortJsonValue(input.partialValue) as Record<string, unknown>,
        }
      : {}),
    ...(input.issues !== undefined
      ? { issues: input.issues.map(normalizeRunInputIssue) }
      : {}),
  };
}

function normalizeRunInputIssue(issue: RunInputIssue): RunInputIssue {
  return {
    code: issue.code,
    message: issue.message,
    ...(issue.field !== undefined ? { field: issue.field } : {}),
  };
}

function normalizeRunExecutionInfo(
  execution: RunExecutionInfo,
): RunExecutionInfo {
  return {
    ...(execution.startedAt !== undefined ? { startedAt: execution.startedAt } : {}),
    ...(execution.completedAt !== undefined
      ? { completedAt: execution.completedAt }
      : {}),
    ...(execution.durationMs !== undefined
      ? { durationMs: execution.durationMs }
      : {}),
    ...(execution.deadlineMs !== undefined
      ? { deadlineMs: execution.deadlineMs }
      : {}),
    runtimeStatus: execution.runtimeStatus,
    apiCallCount: execution.apiCallCount,
    api4xxCount: execution.api4xxCount,
    api5xxCount: execution.api5xxCount,
    apiCalls: execution.apiCalls.map(normalizeRunApiCall),
    ...(execution.result !== undefined
      ? { result: normalizeStrategyResult(execution.result) }
      : {}),
    ...(execution.error !== undefined
      ? { error: normalizeRunExecutionError(execution.error) }
      : {}),
  };
}

function normalizeRunApiCall(call: RunApiCall): RunApiCall {
  return {
    index: call.index,
    method: call.method,
    path: call.path,
    ...(call.query !== undefined
      ? { query: sortJsonValue(call.query) as Record<string, string | number | boolean | null> }
      : {}),
    ...(call.requestSummary !== undefined
      ? { requestSummary: call.requestSummary }
      : {}),
    ...(call.responseSummary !== undefined
      ? { responseSummary: call.responseSummary }
      : {}),
    ...(call.status !== undefined ? { status: call.status } : {}),
    ...(call.durationMs !== undefined ? { durationMs: call.durationMs } : {}),
    ...(call.entityIds !== undefined
      ? { entityIds: normalizeEntityIds(call.entityIds) }
      : {}),
    ...(call.errorCode !== undefined ? { errorCode: call.errorCode } : {}),
  };
}

function normalizeStrategyResult(result: StrategyResult): StrategyResult {
  return {
    ...(result.createdEntityIds !== undefined
      ? { createdEntityIds: normalizeEntityIds(result.createdEntityIds) }
      : {}),
    ...(result.notes !== undefined ? { notes: [...result.notes] } : {}),
    ...(result.verification !== undefined
      ? { verification: sortJsonValue(result.verification) as Record<string, unknown> }
      : {}),
  };
}

function normalizeEntityIds(entityIds: StrategyEntityIds): StrategyEntityIds {
  return sortJsonValue(entityIds) as StrategyEntityIds;
}

function normalizeRunExecutionError(
  error: RunExecutionError,
): RunExecutionError {
  return {
    code: error.code,
    message: error.message,
    ...(error.retryable !== undefined ? { retryable: error.retryable } : {}),
  };
}

function normalizeRunAttributionInfo(
  attribution: RunAttributionInfo,
): RunAttributionInfo {
  return {
    status: attribution.status,
    ...(attribution.observedAt !== undefined
      ? { observedAt: attribution.observedAt }
      : {}),
    ...(attribution.attributedTaskId !== undefined
      ? { attributedTaskId: attribution.attributedTaskId }
      : {}),
    ...(attribution.source !== undefined ? { source: attribution.source } : {}),
    ...(attribution.confidence !== undefined
      ? { confidence: attribution.confidence }
      : {}),
    ...(attribution.taskIdMatchesDeclared !== undefined
      ? { taskIdMatchesDeclared: attribution.taskIdMatchesDeclared }
      : {}),
    ...(attribution.evidence !== undefined
      ? { evidence: normalizeRunAttributionEvidence(attribution.evidence) }
      : {}),
    ...(attribution.evidenceSidecarIds !== undefined
      ? { evidenceSidecarIds: [...attribution.evidenceSidecarIds] }
      : {}),
  };
}

function normalizeRunAttributionEvidence(
  evidence: RunAttributionEvidence,
): RunAttributionEvidence {
  return {
    ...(evidence.leaderboardBeforeFingerprint !== undefined
      ? { leaderboardBeforeFingerprint: evidence.leaderboardBeforeFingerprint }
      : {}),
    ...(evidence.leaderboardAfterFingerprint !== undefined
      ? { leaderboardAfterFingerprint: evidence.leaderboardAfterFingerprint }
      : {}),
    ...(evidence.leaderboardDiffFingerprint !== undefined
      ? { leaderboardDiffFingerprint: evidence.leaderboardDiffFingerprint }
      : {}),
    ...(evidence.submissionScoreFingerprint !== undefined
      ? { submissionScoreFingerprint: evidence.submissionScoreFingerprint }
      : {}),
    ...(evidence.matchedSubmissionId !== undefined
      ? { matchedSubmissionId: evidence.matchedSubmissionId }
      : {}),
    ...(evidence.notes !== undefined ? { notes: [...evidence.notes] } : {}),
  };
}

function normalizeRunEvaluationInfo(
  evaluation: RunEvaluationInfo,
): RunEvaluationInfo {
  return {
    status: evaluation.status,
    ...(evaluation.observedAt !== undefined
      ? { observedAt: evaluation.observedAt }
      : {}),
    ...(evaluation.source !== undefined ? { source: evaluation.source } : {}),
    ...(evaluation.scoreTotal !== undefined
      ? { scoreTotal: evaluation.scoreTotal }
      : {}),
    ...(evaluation.correctnessScore !== undefined
      ? { correctnessScore: evaluation.correctnessScore }
      : {}),
    ...(evaluation.tier !== undefined ? { tier: evaluation.tier } : {}),
    ...(evaluation.taskSolved !== undefined
      ? { taskSolved: evaluation.taskSolved }
      : {}),
    ...(evaluation.efficiencyNotes !== undefined
      ? { efficiencyNotes: [...evaluation.efficiencyNotes] }
      : {}),
    ...(evaluation.rawNotes !== undefined
      ? { rawNotes: [...evaluation.rawNotes] }
      : {}),
    ...(evaluation.evidence !== undefined
      ? { evidence: normalizeRunEvaluationEvidence(evaluation.evidence) }
      : {}),
    ...(evaluation.evidenceSidecarIds !== undefined
      ? { evidenceSidecarIds: [...evaluation.evidenceSidecarIds] }
      : {}),
  };
}

function normalizeRunEvaluationEvidence(
  evidence: RunEvaluationEvidence,
): RunEvaluationEvidence {
  return {
    ...(evidence.submissionId !== undefined
      ? { submissionId: evidence.submissionId }
      : {}),
    ...(evidence.leaderboardEntryFingerprint !== undefined
      ? { leaderboardEntryFingerprint: evidence.leaderboardEntryFingerprint }
      : {}),
    ...(evidence.submissionScoreFingerprint !== undefined
      ? { submissionScoreFingerprint: evidence.submissionScoreFingerprint }
      : {}),
    ...(evidence.notes !== undefined ? { notes: [...evidence.notes] } : {}),
  };
}

function normalizeRunSidecarRef(sidecar: RunSidecarRef): RunSidecarRef {
  return {
    sidecarId: sidecar.sidecarId,
    kind: sidecar.kind,
    path: sidecar.path,
    mediaType: sidecar.mediaType,
    createdAt: sidecar.createdAt,
    ...(sidecar.sha256 !== undefined ? { sha256: sidecar.sha256 } : {}),
    ...(sidecar.summary !== undefined ? { summary: sidecar.summary } : {}),
  };
}

function normalizeRunAnalysisInfo(analysis: RunAnalysisInfo): RunAnalysisInfo {
  return {
    ...(analysis.notes !== undefined ? { notes: [...analysis.notes] } : {}),
    ...(analysis.hypothesisCheck !== undefined
      ? { hypothesisCheck: analysis.hypothesisCheck }
      : {}),
    ...(analysis.failureMode !== undefined
      ? { failureMode: analysis.failureMode }
      : {}),
    ...(analysis.nextIdea !== undefined ? { nextIdea: analysis.nextIdea } : {}),
  };
}

function normalizeRunSidecarFile(
  sidecarFile: RunSidecarFileV1,
): RunSidecarFileV1 {
  return {
    schemaVersion: RUN_SIDECAR_SCHEMA_VERSION,
    runId: sidecarFile.runId,
    sidecarId: sidecarFile.sidecarId,
    kind: sidecarFile.kind,
    createdAt: sidecarFile.createdAt,
    payload: sortJsonValue(sidecarFile.payload),
  };
}

function sortJsonValue<TValue>(value: TValue): TValue {
  if (!value || typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => sortJsonValue(entry)) as TValue;
  }

  const record = value as Record<string, unknown>;
  const sortedEntries = Object.keys(record)
    .sort()
    .map((key) => [key, sortJsonValue(record[key])] as const);

  return Object.fromEntries(sortedEntries) as TValue;
}

function serializeJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function writeTextFile(filePath: string, content: string): Promise<void> {
  try {
    await writeFile(filePath, content, { encoding: "utf8", flag: "wx" });
  } catch (error) {
    if (isNodeError(error) && error.code === "EEXIST") {
      throw new Error(`Refusing to overwrite existing run artifact file "${filePath}".`);
    }
    throw error;
  }
}

async function rewriteTextFile(filePath: string, content: string): Promise<void> {
  await writeFile(filePath, content, { encoding: "utf8", flag: "w" });
}

function sha256Hex(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function assertSafeIdentifier(value: string, label: string): void {
  if (!SAFE_ID_PATTERN.test(value)) {
    throw new Error(
      `Expected ${label} to match ${SAFE_ID_PATTERN.toString()} for git-friendly file naming.`,
    );
  }
}

function assertUtcTimestamp(value: string, label: string): void {
  if (!UTC_TIMESTAMP_PATTERN.test(value) || Number.isNaN(Date.parse(value))) {
    throw new Error(`Expected ${label} to be an ISO 8601 UTC timestamp.`);
  }
}

function assertRelativeFileName(value: string, label: string): void {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error(`Expected ${label} to be a non-empty relative file name.`);
  }

  if (path.isAbsolute(trimmed) || trimmed !== path.basename(trimmed)) {
    throw new Error(`Expected ${label} to stay relative to the artifact directory.`);
  }
}

function sanitizeFileComponent(value: string): string {
  const sanitized = value.replace(/[^A-Za-z0-9._-]+/g, "-");
  return sanitized.replace(/^-+/, "").replace(/-+$/, "") || "sidecar";
}

function assertNoUnsafeSecrets(value: unknown, label: string): void {
  walkJsonValue(value, label, (entry, entryLabel) => {
    if (entry && typeof entry === "object" && !Array.isArray(entry)) {
      for (const key of Object.keys(entry)) {
        if (PROHIBITED_KEY_NAMES.has(key.toLowerCase())) {
          throw new Error(
            `Refusing to write ${label}: found unsafe secret-bearing key "${key}" at ${entryLabel}.`,
          );
        }
      }
    }

    if (typeof entry === "string") {
      for (const pattern of PROHIBITED_STRING_PATTERNS) {
        if (pattern.test(entry)) {
          throw new Error(
            `Refusing to write ${label}: found unsafe credential-like string at ${entryLabel}.`,
          );
        }
      }
    }
  });
}

function walkJsonValue(
  value: unknown,
  label: string,
  visit: (value: unknown, label: string) => void,
): void {
  visit(value, label);

  if (!value || typeof value !== "object") {
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      walkJsonValue(entry, `${label}[${index}]`, visit),
    );
    return;
  }

  for (const [key, entryValue] of Object.entries(value)) {
    walkJsonValue(entryValue, `${label}.${key}`, visit);
  }
}

function findDuplicateValues(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const value of values) {
    if (seen.has(value)) {
      duplicates.add(value);
      continue;
    }
    seen.add(value);
  }

  return [...duplicates].sort();
}

function isNodeError(
  error: unknown,
): error is NodeJS.ErrnoException & { code: string } {
  return error instanceof Error && "code" in error;
}
