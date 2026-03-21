export type StrategyStatus =
  | "draft"
  | "active"
  | "retired"
  | "superseded"
  | "baseline";

export const ACTIVE_STRATEGY_SELECTION_SCHEMA_VERSION =
  "tripletex2.active-strategy-selection.v1";
export type ActiveStrategySelectionSchemaVersion =
  typeof ACTIVE_STRATEGY_SELECTION_SCHEMA_VERSION;

export const RUN_ARTIFACT_SCHEMA_VERSION = "tripletex2.run-artifact.v1";
export type RunArtifactSchemaVersion = typeof RUN_ARTIFACT_SCHEMA_VERSION;
export const RUN_SIDECAR_SCHEMA_VERSION = "tripletex2.run-sidecar.v1";
export type RunSidecarSchemaVersion = typeof RUN_SIDECAR_SCHEMA_VERSION;
export type RunMode = "competition" | "sandbox" | "replay" | "dry-run";
export type TaskSource =
  | "llm-classifier"
  | "manual-label"
  | "replay-label"
  | "request-label";
export type InputSource = "llm-extractor" | "manual" | "replay" | "fixture";
export type RuntimeStatus =
  | "not-run"
  | "completed"
  | "failed"
  | "timeout"
  | "aborted";
export type AttributionStatus =
  | "pending"
  | "matched"
  | "ambiguous"
  | "unmatched"
  | "not-needed";
export type AttributionSource =
  | "request-label"
  | "classifier"
  | "replay-label"
  | "leaderboard-diff"
  | "submission-score"
  | "manual";
export type EvaluationStatus =
  | "pending"
  | "scored"
  | "estimated"
  | "not-available";
export type EvaluationSource =
  | "competition-ui"
  | "submission-score"
  | "manual"
  | "local-estimate"
  | "replay";
export type RunSidecarKind =
  | "sanitized-trace"
  | "reflection-summary"
  | "attribution-evidence"
  | "evaluation-evidence"
  | "generated-script";
export type RunSidecarMediaType =
  | "application/json"
  | "text/markdown"
  | "text/plain";
export type HypothesisCheck = "supported" | "mixed" | "unsupported";
export type HttpMethod = "GET" | "POST" | "PUT";

export type QueryValue = string | number | boolean | null | undefined;
export type SerializedQueryValue = Exclude<QueryValue, undefined>;
export type TripletexCredentialCompanyId = string | number;

export interface TripletexCredentials {
  sessionToken: string;
  companyId?: TripletexCredentialCompanyId;
  credentialSource?: string;
}

export interface TripletexFetchResponse {
  status: number;
  headers: {
    get(name: string): string | null | undefined;
  };
  text(): Promise<string>;
}

export type TripletexFetch = (
  input: string,
  init: {
    method: HttpMethod;
    headers: Record<string, string>;
    body?: BodyInit;
  },
) => Promise<TripletexFetchResponse>;

export interface TripletexCallCapture {
  record(call: RunApiCall): void;
}

export interface TripletexCallLogSnapshot {
  apiCallCount: number;
  api4xxCount: number;
  api5xxCount: number;
  apiCalls: RunApiCall[];
}

export interface TripletexClientConfig {
  baseUrl: string;
  credentials: TripletexCredentials;
  fetch?: TripletexFetch;
  capture?: TripletexCallCapture;
  defaultHeaders?: Record<string, string>;
}

export interface TripletexRequestOptions {
  query?: Record<string, QueryValue>;
  body?: unknown;
  rawBody?: BodyInit;
  contentType?: string;
}

export interface TripletexClient {
  get<TResponse>(
    path: string,
    options?: TripletexRequestOptions,
  ): Promise<TResponse>;
  post<TResponse>(
    path: string,
    options?: TripletexRequestOptions,
  ): Promise<TResponse>;
  put<TResponse>(
    path: string,
    options?: TripletexRequestOptions,
  ): Promise<TResponse>;
}

export interface RuntimeClock {
  today(): string;
}

export interface StrategyContext {
  tripletex: TripletexClient;
  clock: RuntimeClock;
  request?: {
    prompt: string;
    files: readonly StrategyRequestFile[];
  };
}

export interface StrategyRequestFile {
  fileName: string;
  mediaType?: string;
  textContent: string;
  contentBase64?: string;
}

export type StrategyEntityIds = Record<string, number>;
export type StrategyVerification = Record<string, unknown>;
export type TaskImplementationStatus = "implemented" | "placeholder";

export interface StrategyResult {
  createdEntityIds?: StrategyEntityIds;
  notes?: string[];
  verification?: StrategyVerification;
}

export interface ExpectedCallProfile {
  targetCalls?: number;
  maxCalls?: number;
}

export type TaskFieldName<TInput extends object> = Extract<keyof TInput, string>;
export type TaskFieldDescriptions<TInput extends object> = Partial<
  Record<TaskFieldName<TInput>, string>
>;

export interface TaskSpec<
  TInput extends object,
  TTaskId extends string = string,
> {
  taskId: TTaskId;
  txTaskId: string;
  taskName: string;
  implementationStatus?: TaskImplementationStatus;
  signature: string;
  summary: string;
  inputSchemaId: string;
  requiredFields: readonly TaskFieldName<TInput>[];
  optionalFields?: readonly TaskFieldName<TInput>[];
  fieldDescriptions?: TaskFieldDescriptions<TInput>;
  extractionNotes?: readonly string[];
}

export interface TaskModule<
  TInput extends object,
  TTaskId extends string = string,
> {
  task: TaskSpec<TInput, TTaskId>;
  strategies: readonly TaskStrategy<TInput, TTaskId>[];
}

export interface ActiveStrategySelectionConfig {
  schemaVersion: ActiveStrategySelectionSchemaVersion;
  selectionConfigId: string;
  taskStrategies: Record<string, string>;
}

export interface TaskRegistration<
  TInput extends object,
  TTaskId extends string = string,
> {
  task: TaskSpec<TInput, TTaskId>;
  loadTaskModule(): Promise<TaskModule<TInput, TTaskId>>;
}

export type ClassifierConfidence = "high" | "medium" | "low";

export interface ClassifierExtractorFile {
  fileName: string;
  mediaType?: string;
  textContent: string;
}

export interface ClassifierExtractorInput {
  request: {
    prompt: string;
    files?: readonly ClassifierExtractorFile[];
  };
  // Classifier agents should mainly read task.ts surfaces, not strategy files.
  taskSpecs: readonly TaskSpec<any, string>[];
  retryContext?: ClassifierRetryContext;
}

export interface ClassifierTaskCandidate<TTaskId extends string = string> {
  taskId: TTaskId;
  confidence: ClassifierConfidence;
}

export type ClassifierExtractorStage = "classification" | "extraction";

export type ClassifierExtractorIssueCode =
  | "ambiguous-task"
  | "no-task-match"
  | "missing-required-field"
  | "ambiguous-field-value"
  | "conflicting-field-values"
  | "invalid-field-value"
  | "unreadable-file"
  | "unsupported-request";

export type NonEligibleTaskReasonCode = "already-perfect" | "non-eligible";

export interface ClassifierRetryRejectedTask {
  taskId: string;
  reasonCode: NonEligibleTaskReasonCode;
  reason: string;
}

export interface ClassifierRetryContext {
  attemptNumber: number;
  excludedTaskIds: readonly string[];
  remainingTaskIds: readonly string[];
  rejectedTasks: readonly ClassifierRetryRejectedTask[];
  unresolvedIsInvalid: boolean;
}

export interface ClassifierExtractorIssue<TFieldName extends string = string> {
  code: ClassifierExtractorIssueCode;
  message: string;
  field?: TFieldName;
}

export type TaskUnderstandingCode = ClassifierExtractorIssueCode;

export interface TaskUnderstandingResolved<
  TInput extends object,
  TTaskId extends string = string,
> {
  status: "resolved";
  taskId: TTaskId;
  // The handoff stays values-only: no solve plan, strategy hint, or API sequence.
  input: TInput;
}

export interface TaskUnderstandingUnresolved<
  TInput extends object,
  TTaskId extends string = string,
> {
  status: "unresolved";
  code: TaskUnderstandingCode;
  message: string;
  taskId?: TTaskId;
  partialInput?: Partial<TInput>;
}

export type TaskUnderstandingResult<
  TInput extends object,
  TTaskId extends string = string,
> =
  | TaskUnderstandingResolved<TInput, TTaskId>
  | TaskUnderstandingUnresolved<TInput, TTaskId>;

export interface RunTaskInfo {
  taskId: string;
  taskName?: string;
  taskConfidence?: ClassifierConfidence;
  taskSource: TaskSource;
}

export interface RunStrategyInfo {
  strategyId: string;
  strategyName?: string;
  strategyPath: string;
  strategyStatus: StrategyStatus;
}

export interface RunSelectionInfo {
  selectionConfigId: string;
  selectionConfigPath: string;
  requestedTaskId?: string;
}

export interface RunRequestFile {
  fileName: string;
  mediaType?: string;
  byteSize?: number;
  sha256?: string;
  extractedFacts?: string[];
}

export interface RunRequestInfo {
  requestFingerprint: string;
  promptText?: string;
  promptSummary?: string;
  files: RunRequestFile[];
  credentialSource?: string;
}

export interface RunInputIssue {
  code: ClassifierExtractorIssueCode;
  message: string;
  field?: string;
}

export interface RunInputInfo {
  inputSchemaId: string;
  status: "resolved" | "ambiguous" | "failed";
  source: InputSource;
  confidence?: ClassifierConfidence;
  value?: Record<string, unknown>;
  partialValue?: Record<string, unknown>;
  issues?: RunInputIssue[];
}

export interface RunApiCall {
  index: number;
  method: HttpMethod;
  path: string;
  query?: Record<string, SerializedQueryValue>;
  requestSummary?: string;
  responseSummary?: string;
  status?: number;
  durationMs?: number;
  entityIds?: Record<string, number>;
  errorCode?: string;
}

export interface RunExecutionError {
  code: string;
  message: string;
  retryable?: boolean;
}

export interface RunExecutionInfo {
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  deadlineMs?: number;
  runtimeStatus: RuntimeStatus;
  apiCallCount: number;
  api4xxCount: number;
  api5xxCount: number;
  apiCalls: RunApiCall[];
  result?: StrategyResult;
  error?: RunExecutionError;
}

export interface RunAttributionEvidence {
  leaderboardBeforeFingerprint?: string;
  leaderboardAfterFingerprint?: string;
  leaderboardDiffFingerprint?: string;
  submissionScoreFingerprint?: string;
  matchedSubmissionId?: string;
  notes?: string[];
}

export interface RunAttributionInfo {
  status: AttributionStatus;
  observedAt?: string;
  attributedTaskId?: string;
  source?: AttributionSource;
  confidence?: ClassifierConfidence;
  taskIdMatchesDeclared?: boolean;
  evidence?: RunAttributionEvidence;
  evidenceSidecarIds?: string[];
}

export interface RunEvaluationEvidence {
  submissionId?: string;
  leaderboardEntryFingerprint?: string;
  submissionScoreFingerprint?: string;
  notes?: string[];
}

export interface RunEvaluationInfo {
  status: EvaluationStatus;
  observedAt?: string;
  source?: EvaluationSource;
  scoreTotal?: number;
  correctnessScore?: number;
  tier?: number;
  taskSolved?: boolean;
  efficiencyNotes?: string[];
  rawNotes?: string[];
  evidence?: RunEvaluationEvidence;
  evidenceSidecarIds?: string[];
}

export interface RunSidecarRef {
  sidecarId: string;
  kind: RunSidecarKind;
  path: string;
  mediaType: RunSidecarMediaType;
  createdAt: string;
  sha256?: string;
  summary?: string;
}

export interface RunAnalysisInfo {
  notes?: string[];
  hypothesisCheck?: HypothesisCheck;
  failureMode?: string;
  nextIdea?: string;
}

export interface RunArtifactV1 {
  schemaVersion: RunArtifactSchemaVersion;
  runId: string;
  createdAt: string;
  mode: RunMode;
  task: RunTaskInfo;
  strategy: RunStrategyInfo;
  selection: RunSelectionInfo;
  request: RunRequestInfo;
  input: RunInputInfo;
  execution: RunExecutionInfo;
  attribution?: RunAttributionInfo;
  evaluation?: RunEvaluationInfo;
  sidecars?: RunSidecarRef[];
  analysis?: RunAnalysisInfo;
}

export interface RunSidecarFileV1<
  TPayload = unknown,
  TKind extends RunSidecarKind = RunSidecarKind,
> {
  schemaVersion: RunSidecarSchemaVersion;
  runId: string;
  sidecarId: string;
  kind: TKind;
  createdAt: string;
  payload: TPayload;
}

export interface SanitizedTraceSidecarPayload {
  trace: RunApiCall[];
  notes?: string[];
}

export interface ReflectionSummarySidecarPayload {
  summary: string;
  findings?: string[];
  nextIdeas?: string[];
}

export interface AttributionEvidenceSidecarPayload {
  summary: string;
  evidence: RunAttributionEvidence;
}

export interface EvaluationEvidenceSidecarPayload {
  summary: string;
  evidence: RunEvaluationEvidence;
}

export interface GeneratedScriptSidecarPayload {
  language: string;
  entrypoint?: string;
  scriptText?: string;
  summary?: string;
}

export type SanitizedTraceSidecarFile = RunSidecarFileV1<
  SanitizedTraceSidecarPayload,
  "sanitized-trace"
>;
export type ReflectionSummarySidecarFile = RunSidecarFileV1<
  ReflectionSummarySidecarPayload,
  "reflection-summary"
>;
export type AttributionEvidenceSidecarFile = RunSidecarFileV1<
  AttributionEvidenceSidecarPayload,
  "attribution-evidence"
>;
export type EvaluationEvidenceSidecarFile = RunSidecarFileV1<
  EvaluationEvidenceSidecarPayload,
  "evaluation-evidence"
>;
export type GeneratedScriptSidecarFile = RunSidecarFileV1<
  GeneratedScriptSidecarPayload,
  "generated-script"
>;
export type KnownRunSidecarFile =
  | SanitizedTraceSidecarFile
  | ReflectionSummarySidecarFile
  | AttributionEvidenceSidecarFile
  | EvaluationEvidenceSidecarFile
  | GeneratedScriptSidecarFile;

export interface ClassifierExtractorResolved<
  TInput extends object,
  TTaskId extends string = string,
> {
  status: "resolved";
  taskId: TTaskId;
  taskConfidence: ClassifierConfidence;
  // The boundary is values only: no solve plan, step list, or strategy hinting.
  input: TInput;
  inputConfidence: ClassifierConfidence;
}

export interface ClassifierExtractorAmbiguous<
  TInput extends object,
  TTaskId extends string = string,
> {
  status: "ambiguous";
  stage: ClassifierExtractorStage;
  candidates: readonly ClassifierTaskCandidate<TTaskId>[];
  issues: readonly ClassifierExtractorIssue<TaskFieldName<TInput>>[];
  partialInput?: Partial<TInput>;
}

export interface ClassifierExtractorFailed<
  TInput extends object,
  TTaskId extends string = string,
> {
  status: "failed";
  stage: ClassifierExtractorStage;
  taskId?: TTaskId;
  taskConfidence?: ClassifierConfidence;
  issues: readonly ClassifierExtractorIssue<TaskFieldName<TInput>>[];
  partialInput?: Partial<TInput>;
}

export type ClassifierExtractorResult<
  TInput extends object,
  TTaskId extends string = string,
> =
  | ClassifierExtractorResolved<TInput, TTaskId>
  | ClassifierExtractorAmbiguous<TInput, TTaskId>
  | ClassifierExtractorFailed<TInput, TTaskId>;

export interface TaskStrategy<
  TInput extends object,
  TTaskId extends string = string,
> {
  strategyId: string;
  strategyPath: string;
  taskId: TTaskId;
  name: string;
  summary: string;
  hypothesis: string;
  expectedCallProfile?: ExpectedCallProfile;
  stepOutline: readonly string[];
  status: StrategyStatus;
  run(ctx: StrategyContext, input: TInput): Promise<StrategyResult>;
}
