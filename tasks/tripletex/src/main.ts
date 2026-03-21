import { randomUUID } from "node:crypto";
import { appendFile, chmod, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

type TripletexSolveFile = {
  filename: string;
  content_base64: string;
  mime_type: string;
};

type TripletexCredentials = {
  base_url: string;
  session_token: string;
};

type SolveRequest = {
  prompt: string;
  files?: TripletexSolveFile[];
  tripletex_credentials: TripletexCredentials;
};

type StorageMode = "testing" | "production";
type AgentProvider = "claude" | "codex";

type SolveResponse = {
  status: "completed";
};

type ErrorResponse = {
  error: string;
};

type StoredSolveFile = TripletexSolveFile & {
  path: string;
};

type EffectiveCredentials = {
  baseUrl: string;
  sessionToken: string;
  source: "request" | "sandbox";
};

type PreparedRun = {
  agentRunStatusPath: string;
  createdAt: string;
  codexPrompt: string;
  effectiveCredentials: EffectiveCredentials;
  files: StoredSolveFile[];
  launchScriptPath: string;
  promptFilePath: string;
  requestId: string;
  requestFilePath: string;
  runDir: string;
  runId: string;
  solvePrompt: string;
  scriptsDir: string;
  storageMode: StorageMode;
  tmuxWindow: string;
};

type CodexSessionMeta = {
  cli_version?: string;
  cwd?: string;
  id: string;
  provider?: AgentProvider;
  timestamp?: string;
};

type CodexTraceEntry =
  | {
      kind: "assistant_message";
      phase?: string;
      text: string;
      timestamp: string;
    }
  | {
      arguments: unknown;
      arguments_raw: string;
      call_id: string;
      kind: "tool_call";
      timestamp: string;
      tool_name: string;
    }
  | {
      call_id: string;
      kind: "tool_result";
      output: string;
      timestamp: string;
      tool_name?: string;
    }
  | {
      kind: "task_event";
      task_type: string;
      text?: string;
      timestamp: string;
    }
  | {
      kind: "user_message";
      text: string;
      timestamp: string;
    };

type CodexTraceSnapshot = {
  entries: CodexTraceEntry[];
  session: {
    completed: boolean;
    last_assistant_message?: string;
    session_file: string;
    session_id: string;
    session_meta: CodexSessionMeta;
    task_complete_timestamp?: string;
  };
  summary: {
    assistant_message_count: number;
    tool_call_count: number;
    tool_result_count: number;
    user_message_count: number;
  };
};

type MatchedCodexSession = {
  path: string;
  sessionMeta: CodexSessionMeta;
};

type WaitForSolveResult = {
  matchedSession?: MatchedCodexSession;
  reason: "completed" | "timeout";
  taskCompleteTimestamp?: string;
};

type LeaderboardEntry = {
  best_score: number;
  last_attempt_at?: string;
  rolling_scores: unknown[];
  total_attempts: number;
  tx_task_id: string;
};

type LeaderboardSnapshot = {
  captured_at: string;
  entries: LeaderboardEntry[];
  run_id: string;
  source: string;
  url: string;
};

type LeaderboardDiffEntry = {
  attempt_delta: number;
  best_score_after: number | undefined;
  best_score_before: number | undefined;
  last_attempt_after: string | undefined;
  last_attempt_before: string | undefined;
  total_attempts_after: number | undefined;
  total_attempts_before: number | undefined;
  tx_task_id: string;
};

type SubmissionFeedback = {
  checks?: string[];
  comment?: string;
};

type SubmissionEntry = {
  completed_at: string | null;
  duration_ms: number | null;
  feedback?: SubmissionFeedback;
  id: string;
  normalized_score: number | null;
  queued_at: string;
  score_max: number | null;
  score_raw: number | null;
  status: string;
};

type SubmissionSnapshot = {
  captured_at: string;
  entries: SubmissionEntry[];
  run_id: string;
  source: string;
  url: string;
};

type SubmissionMatch = {
  candidate_count: number;
  inference_status:
    | "ambiguous"
    | "existing_processing_still_running"
    | "existing_processing_transition"
    | "new_submission_completed"
    | "new_submission_processing"
    | "no_candidate";
  submission?: SubmissionEntry;
};

type ReflectionRunResult = {
  completedAt?: string;
  status: "completed" | "skipped" | "timed_out";
};

type RuntimeStatus = {
  exit_code?: number;
  provider?: string;
  recorded_at?: string;
  run_id?: string;
  status?: string;
};

const port = Number(Bun.env.PORT ?? 3000);
const requiredBearerToken = Bun.env.API_KEY ?? "HALLAGUTTA123";
const tmuxSessionName = "ainm-tripletex-sessions";
const tripletexRootDir = resolve(import.meta.dir, "..");
const codexEnvironmentDir = resolve(tripletexRootDir, "codex-environment");
const codexHomeDir = resolve(Bun.env.CODEX_HOME ?? `${Bun.env.HOME ?? "~"}/.codex`);
const claudeProjectsDir = resolve(Bun.env.CLAUDE_PROJECTS_DIR ?? `${Bun.env.HOME ?? "~"}/.claude/projects`);
const dataRootDir = resolve(tripletexRootDir, "data");
const sandboxEnvPath = resolve(tripletexRootDir, ".sandbox.env");
const agentProvider: AgentProvider = Bun.env.TRIPLETEX_AGENT_PROVIDER?.toLowerCase() === "codex" ? "codex" : "claude";
const claudeModel = Bun.env.TRIPLETEX_CLAUDE_MODEL ?? "claude-opus-4-6";
const claudeEffort = Bun.env.TRIPLETEX_CLAUDE_EFFORT ?? "high";
const claudeProxyBaseUrl =
  Bun.env.TRIPLETEX_CLAUDE_PROXY_BASE_URL ??
  Bun.env.ANTHROPIC_BASE_URL ??
  "https://europe-west1-ai-nm26osl-1706.cloudfunctions.net/claude-proxy";
const claudeProxyApiKey =
  Bun.env.TRIPLETEX_CLAUDE_PROXY_API_KEY ?? Bun.env.ANTHROPIC_API_KEY ?? requiredBearerToken;
const leaderboardApiUrl =
  Bun.env.TRIPLETEX_LEADERBOARD_URL ??
  "https://api.ainm.no/tripletex/leaderboard/f675e571-6864-4f33-beca-fab40636d516";
const leaderboardAttributionDelayMs = Number(Bun.env.TRIPLETEX_LEADERBOARD_DELAY_MS ?? 30 * 1000);
const leaderboardPollIntervalMs = Number(Bun.env.TRIPLETEX_LEADERBOARD_POLL_INTERVAL_MS ?? 15 * 1000);
const leaderboardPollWindowMs = Number(Bun.env.TRIPLETEX_LEADERBOARD_POLL_WINDOW_MS ?? 2 * 60 * 1000);
const submissionsApiUrl =
  Bun.env.TRIPLETEX_MY_SUBMISSIONS_URL ?? "https://api.ainm.no/tripletex/my/submissions";
const submissionsPollIntervalMs = Number(Bun.env.TRIPLETEX_SUBMISSIONS_POLL_INTERVAL_MS ?? 10 * 1000);
const submissionsPollWindowMs = Number(Bun.env.TRIPLETEX_SUBMISSIONS_POLL_WINDOW_MS ?? 3 * 60 * 1000);
const submissionsQueuedAtSkewMs = Number(Bun.env.TRIPLETEX_SUBMISSIONS_QUEUE_SKEW_MS ?? 2 * 60 * 1000);
const solveTimeoutMs = 5 * 60 * 1000;
const maxConcurrentSolveRequests = 3;
let activeSolveRequests = 0;
let tmuxLaunchLock: Promise<void> = Promise.resolve();
let submissionsAccessTokenPromise: Promise<string> | undefined;

function nowIso(): string {
  return new Date().toISOString();
}

function log(level: "INFO" | "WARN" | "ERROR", message: string, details?: Record<string, unknown>): void {
  const prefix = `[${nowIso()}] [${level}]`;
  if (details && Object.keys(details).length > 0) {
    console.log(`${prefix} ${message}`, details);
    return;
  }

  console.log(`${prefix} ${message}`);
}

function maskToken(token: string): string {
  if (token.length <= 8) {
    return token;
  }

  return `${token.slice(0, 4)}...${token.slice(-4)}`;
}

function summarizeAuthorizationHeader(authorization: string | null): Record<string, unknown> {
  if (!authorization) {
    return {
      authorizationPresent: false,
      authorizationScheme: "missing",
    };
  }

  const [scheme, ...rest] = authorization.split(" ");
  const credential = rest.join(" ").trim();

  return {
    authorizationPresent: true,
    authorizationScheme: scheme || "unknown",
    authorizationTokenLength: credential.length,
    authorizationTokenPreview: credential ? maskToken(credential) : undefined,
  };
}

function summarizePrompt(prompt: string): string {
  const singleLine = prompt.replace(/\s+/g, " ").trim();
  return singleLine.length > 140 ? `${singleLine.slice(0, 137)}...` : singleLine;
}

function incrementActiveSolveRequests(): number {
  activeSolveRequests += 1;
  return activeSolveRequests;
}

function decrementActiveSolveRequests(): number {
  activeSolveRequests = Math.max(0, activeSolveRequests - 1);
  return activeSolveRequests;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function json(status: number, body: SolveResponse | ErrorResponse): Response {
  return Response.json(body, { status });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isSolveFile(value: unknown): value is TripletexSolveFile {
  return (
    isRecord(value) &&
    typeof value.filename === "string" &&
    typeof value.content_base64 === "string" &&
    typeof value.mime_type === "string"
  );
}

function isSolveRequest(value: unknown): value is SolveRequest {
  if (!isRecord(value)) {
    return false;
  }

  const { prompt, files, tripletex_credentials } = value;

  if (typeof prompt !== "string") {
    return false;
  }

  if (files !== undefined && (!Array.isArray(files) || !files.every(isSolveFile))) {
    return false;
  }

  return (
    isRecord(tripletex_credentials) &&
    typeof tripletex_credentials.base_url === "string" &&
    typeof tripletex_credentials.session_token === "string"
  );
}

function isLeaderboardEntry(value: unknown): value is LeaderboardEntry {
  return (
    isRecord(value) &&
    typeof value.tx_task_id === "string" &&
    typeof value.best_score === "number" &&
    typeof value.total_attempts === "number" &&
    Array.isArray(value.rolling_scores) &&
    (value.last_attempt_at === undefined || typeof value.last_attempt_at === "string")
  );
}

function isSubmissionFeedback(value: unknown): value is SubmissionFeedback {
  return (
    isRecord(value) &&
    (value.comment === undefined || typeof value.comment === "string") &&
    (value.checks === undefined ||
      (Array.isArray(value.checks) && value.checks.every((item) => typeof item === "string")))
  );
}

function isSubmissionEntry(value: unknown): value is SubmissionEntry {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.status === "string" &&
    typeof value.queued_at === "string" &&
    (value.completed_at === null || typeof value.completed_at === "string") &&
    (value.score_raw === null || typeof value.score_raw === "number") &&
    (value.score_max === null || typeof value.score_max === "number") &&
    (value.normalized_score === null || typeof value.normalized_score === "number") &&
    (value.duration_ms === null || typeof value.duration_ms === "number") &&
    (value.feedback === undefined || isSubmissionFeedback(value.feedback))
  );
}

function resolveStorageMode(rawMode: string | undefined): StorageMode {
  switch (rawMode?.toLowerCase()) {
    case "production":
    case "prod":
      return "production";
    default:
      return "testing";
  }
}

function buildRunId(storageMode: StorageMode): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "").replace("T", "-");
  const modePrefix = storageMode === "production" ? "prod" : "test";
  return `${modePrefix}-${timestamp}-${randomUUID().slice(0, 8)}`;
}

function sanitizeFilename(filename: string): string {
  const cleaned = basename(filename).replace(/[^A-Za-z0-9._-]/g, "_");
  return cleaned.length > 0 ? cleaned : "attachment";
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

function claudeProjectDirName(cwd: string): string {
  return cwd.replaceAll("/", "-");
}

function stringifyUnknown(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function extractClaudeTextContent(content: unknown): string {
  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .flatMap((item) => {
      if (!isRecord(item) || item.type !== "text" || typeof item.text !== "string") {
        return [];
      }

      const text = item.text.trim();
      return text ? [text] : [];
    })
    .join("\n\n")
    .trim();
}

async function readRuntimeStatus(path: string): Promise<RuntimeStatus | undefined> {
  const raw = await readFile(path, "utf8").catch(() => "");
  if (!raw) {
    return undefined;
  }

  const parsed = safeJsonParse(raw);
  return isRecord(parsed) ? (parsed as RuntimeStatus) : undefined;
}

async function appendJsonl(path: string, value: unknown): Promise<void> {
  await appendFile(path, `${JSON.stringify(value)}\n`);
}

function buildLeaderboardDiff(
  beforeEntries: LeaderboardEntry[],
  afterEntries: LeaderboardEntry[],
): LeaderboardDiffEntry[] {
  const beforeByTaskId = new Map(beforeEntries.map((entry) => [entry.tx_task_id, entry]));
  const afterByTaskId = new Map(afterEntries.map((entry) => [entry.tx_task_id, entry]));
  const taskIds = new Set([...beforeByTaskId.keys(), ...afterByTaskId.keys()]);
  const diff: LeaderboardDiffEntry[] = [];

  for (const txTaskId of [...taskIds].sort()) {
    const before = beforeByTaskId.get(txTaskId);
    const after = afterByTaskId.get(txTaskId);
    const attemptDelta = (after?.total_attempts ?? 0) - (before?.total_attempts ?? 0);
    const bestScoreBefore = before?.best_score;
    const bestScoreAfter = after?.best_score;
    const lastAttemptBefore = before?.last_attempt_at;
    const lastAttemptAfter = after?.last_attempt_at;

    if (
      attemptDelta !== 0 ||
      bestScoreBefore !== bestScoreAfter ||
      lastAttemptBefore !== lastAttemptAfter
    ) {
      diff.push({
        tx_task_id: txTaskId,
        attempt_delta: attemptDelta,
        best_score_before: bestScoreBefore,
        best_score_after: bestScoreAfter,
        last_attempt_before: lastAttemptBefore,
        last_attempt_after: lastAttemptAfter,
        total_attempts_before: before?.total_attempts,
        total_attempts_after: after?.total_attempts,
      });
    }
  }

  return diff;
}

function inferLeaderboardTask(diff: LeaderboardDiffEntry[]): {
  attempt_delta: number | undefined;
  inference_status: "ambiguous" | "metadata_changed" | "no_change_detected" | "unique_attempt_delta";
  tx_task_id?: string;
} {
  const attemptCandidates = diff.filter((entry) => entry.attempt_delta > 0);
  if (attemptCandidates.length === 1) {
    return {
      inference_status: "unique_attempt_delta",
      tx_task_id: attemptCandidates[0].tx_task_id,
      attempt_delta: attemptCandidates[0].attempt_delta,
    };
  }

  if (attemptCandidates.length > 1) {
    return {
      inference_status: "ambiguous",
    };
  }

  if (diff.length === 1) {
    return {
      inference_status: "metadata_changed",
      tx_task_id: diff[0].tx_task_id,
      attempt_delta: diff[0].attempt_delta,
    };
  }

  return {
    inference_status: "no_change_detected",
  };
}

function parseIsoTimestampMs(value: string | null | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function isSubmissionScored(entry: SubmissionEntry): boolean {
  return entry.completed_at !== null && entry.score_raw !== null && entry.score_max !== null;
}

function inferSubmissionMatch(
  beforeEntries: SubmissionEntry[],
  afterEntries: SubmissionEntry[],
  runCreatedAt: string,
  reflectionCompletedAt: string | undefined,
): SubmissionMatch {
  const beforeById = new Map(beforeEntries.map((entry) => [entry.id, entry]));
  const runStartMs = parseIsoTimestampMs(runCreatedAt) ?? 0;
  const windowStartMs = runStartMs - submissionsQueuedAtSkewMs;
  const windowEndMs = (parseIsoTimestampMs(reflectionCompletedAt) ?? Number.POSITIVE_INFINITY) + submissionsQueuedAtSkewMs;
  const recentAfterEntries = afterEntries.filter((entry) => {
    const queuedAtMs = parseIsoTimestampMs(entry.queued_at);
    return queuedAtMs !== undefined && queuedAtMs >= windowStartMs && queuedAtMs <= windowEndMs;
  });

  const transitionedExisting = recentAfterEntries.filter((entry) => {
    const before = beforeById.get(entry.id);
    return before && !isSubmissionScored(before) && isSubmissionScored(entry);
  });
  if (transitionedExisting.length === 1) {
    return {
      inference_status: "existing_processing_transition",
      candidate_count: 1,
      submission: transitionedExisting[0],
    };
  }
  if (transitionedExisting.length > 1) {
    return {
      inference_status: "ambiguous",
      candidate_count: transitionedExisting.length,
    };
  }

  const trackedExisting = recentAfterEntries.filter((entry) => {
    const before = beforeById.get(entry.id);
    return before && !isSubmissionScored(before);
  });
  if (trackedExisting.length === 1) {
    return {
      inference_status: isSubmissionScored(trackedExisting[0])
        ? "existing_processing_transition"
        : "existing_processing_still_running",
      candidate_count: 1,
      submission: trackedExisting[0],
    };
  }
  if (trackedExisting.length > 1) {
    return {
      inference_status: "ambiguous",
      candidate_count: trackedExisting.length,
    };
  }

  const newRecentEntries = recentAfterEntries.filter((entry) => !beforeById.has(entry.id));
  if (newRecentEntries.length === 1) {
    return {
      inference_status: isSubmissionScored(newRecentEntries[0])
        ? "new_submission_completed"
        : "new_submission_processing",
      candidate_count: 1,
      submission: newRecentEntries[0],
    };
  }
  if (newRecentEntries.length > 1) {
    return {
      inference_status: "ambiguous",
      candidate_count: newRecentEntries.length,
    };
  }

  return {
    inference_status: "no_candidate",
    candidate_count: 0,
  };
}

function computeSubmissionCorrectness(entry: SubmissionEntry | undefined): number | undefined {
  if (!entry || entry.score_raw === null || entry.score_max === null || entry.score_max <= 0) {
    return undefined;
  }

  return entry.score_raw / entry.score_max;
}

function parseEnvFile(raw: string): Record<string, string> {
  const env: Record<string, string> = {};

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, equalsIndex).trim();
    let value = trimmed.slice(equalsIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (key) {
      env[key] = value;
    }
  }

  return env;
}

async function runCommand(cmd: string[]): Promise<string> {
  const subprocess = Bun.spawn({
    cmd,
    stderr: "pipe",
    stdout: "pipe",
  });

  const exitCode = await subprocess.exited;

  const stdout = await new Response(subprocess.stdout).text();
  const stderr = await new Response(subprocess.stderr).text();

  if (exitCode !== 0) {
    const details = stderr.trim() || stdout.trim() || `exit code ${exitCode}`;
    throw new Error(`${cmd.join(" ")} failed: ${details}`);
  }

  return stdout.trim();
}

async function fetchLeaderboardSnapshot(preparedRun: PreparedRun, source: string): Promise<LeaderboardSnapshot> {
  const response = await fetch(leaderboardApiUrl, {
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new Error(`leaderboard fetch failed with ${response.status} ${response.statusText}`);
  }

  const body = await response.json();
  if (!Array.isArray(body) || !body.every(isLeaderboardEntry)) {
    throw new Error("leaderboard response did not match expected schema");
  }

  return {
    captured_at: nowIso(),
    run_id: preparedRun.runId,
    source,
    url: leaderboardApiUrl,
    entries: body,
  };
}

async function persistLeaderboardSnapshot(
  preparedRun: PreparedRun,
  source: "before" | "after",
): Promise<LeaderboardSnapshot | undefined> {
  try {
    const snapshot = await fetchLeaderboardSnapshot(preparedRun, source);
    await writeFile(join(preparedRun.runDir, `leaderboard.${source}.json`), JSON.stringify(snapshot, null, 2));
    await appendJsonl(join(dataRootDir, "leaderboard-history.jsonl"), snapshot);
    return snapshot;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await writeFile(
      join(preparedRun.runDir, `leaderboard.${source}.error.json`),
      JSON.stringify(
        {
          captured_at: nowIso(),
          run_id: preparedRun.runId,
          source,
          url: leaderboardApiUrl,
          error: message,
        },
        null,
        2,
      ),
    );
    return undefined;
  }
}

async function fetchSubmissionSnapshot(preparedRun: PreparedRun, source: string): Promise<SubmissionSnapshot> {
  const submissionsAccessToken = await loadSubmissionsAccessToken();
  const response = await fetch(submissionsApiUrl, {
    headers: {
      accept: "application/json",
      cookie: `access_token=${submissionsAccessToken}`,
    },
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new Error(`submissions fetch failed with ${response.status} ${response.statusText}`);
  }

  const body = await response.json();
  if (!Array.isArray(body) || !body.every(isSubmissionEntry)) {
    throw new Error("submissions response did not match expected schema");
  }

  return {
    captured_at: nowIso(),
    run_id: preparedRun.runId,
    source,
    url: submissionsApiUrl,
    entries: body,
  };
}

async function persistSubmissionSnapshot(
  preparedRun: PreparedRun,
  source: "before" | "after",
): Promise<SubmissionSnapshot | undefined> {
  const submissionsAccessToken = await loadSubmissionsAccessToken();
  if (!submissionsAccessToken) {
    return undefined;
  }

  try {
    const snapshot = await fetchSubmissionSnapshot(preparedRun, source);
    await writeFile(join(preparedRun.runDir, `submissions.${source}.json`), JSON.stringify(snapshot, null, 2));
    await appendJsonl(join(dataRootDir, "submissions-history.jsonl"), snapshot);
    return snapshot;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await writeFile(
      join(preparedRun.runDir, `submissions.${source}.error.json`),
      JSON.stringify(
        {
          captured_at: nowIso(),
          run_id: preparedRun.runId,
          source,
          url: submissionsApiUrl,
          error: message,
        },
        null,
        2,
      ),
    );
    return undefined;
  }
}

async function tmuxSessionExists(sessionName: string): Promise<boolean> {
  const subprocess = Bun.spawn({
    cmd: ["tmux", "has-session", "-t", sessionName],
    stderr: "pipe",
    stdout: "pipe",
  });

  const exitCode = await subprocess.exited;
  return exitCode === 0;
}

async function withTmuxLaunchLock<T>(fn: () => Promise<T>): Promise<T> {
  const previous = tmuxLaunchLock;
  let release!: () => void;
  tmuxLaunchLock = new Promise<void>((resolve) => {
    release = resolve;
  });

  await previous;

  try {
    return await fn();
  } finally {
    release();
  }
}

async function loadSandboxCredentials(): Promise<TripletexCredentials | undefined> {
  const baseUrl = Bun.env.TRIPLETEX_TEST_BASE_URL;
  const sessionToken = Bun.env.TRIPLETEX_TEST_SESSION_TOKEN;
  if (baseUrl && sessionToken) {
    return {
      base_url: baseUrl,
      session_token: sessionToken,
    };
  }

  try {
    const raw = await readFile(sandboxEnvPath, "utf8");
    const env = parseEnvFile(raw);
    if (env.TRIPLETEX_TEST_BASE_URL && env.TRIPLETEX_TEST_SESSION_TOKEN) {
      return {
        base_url: env.TRIPLETEX_TEST_BASE_URL,
        session_token: env.TRIPLETEX_TEST_SESSION_TOKEN,
      };
    }
  } catch {
    // ignore missing local sandbox file
  }

  return undefined;
}

async function loadSubmissionsAccessToken(): Promise<string> {
  if (!submissionsAccessTokenPromise) {
    submissionsAccessTokenPromise = (async () => {
      const envToken = Bun.env.TRIPLETEX_SUBMISSIONS_ACCESS_TOKEN;
      if (envToken) {
        return envToken;
      }

      try {
        const raw = await readFile(sandboxEnvPath, "utf8");
        const env = parseEnvFile(raw);
        return env.TRIPLETEX_SUBMISSIONS_ACCESS_TOKEN ?? "";
      } catch {
        return "";
      }
    })();
  }

  return submissionsAccessTokenPromise;
}

async function resolveEffectiveCredentials(
  input: SolveRequest,
  storageMode: StorageMode,
): Promise<EffectiveCredentials> {
  if (storageMode === "testing") {
    const sandboxCredentials = await loadSandboxCredentials();
    if (sandboxCredentials) {
      return {
        baseUrl: sandboxCredentials.base_url,
        sessionToken: sandboxCredentials.session_token,
        source: "sandbox",
      };
    }
  }

  return {
    baseUrl: input.tripletex_credentials.base_url,
    sessionToken: input.tripletex_credentials.session_token,
    source: "request",
  };
}

function buildCodexPrompt(
  input: SolveRequest,
  files: StoredSolveFile[],
  effectiveCredentials: EffectiveCredentials,
  scriptsDir: string,
): string {
  const lines = [
    "Scored Tripletex run.",
    "Follow ./AGENTS.md exactly.",
    "",
    "Highest priorities:",
    "- Get the final Tripletex state exactly correct.",
    "- Use the fewest API calls possible.",
    "- Avoid all avoidable 4xx errors.",
    "",
    "Knowledge order:",
    "- 1. ./trusted-standards/",
    "- 2. ./task-playbooks/",
    "- 3. ./openapi.json",
    "- If this is an exact trusted-standard match, use it directly and do not re-check ./openapi.json.",
    "",
    "Run-specific rules:",
    "- Only interact with the Tripletex API by writing TypeScript and running it with bun.",
    `- Put all API-interaction scripts only in this run scripts directory: ${scriptsDir}`,
    "- Do not place API-interaction scripts anywhere else.",
    "- Reuse POST/PUT responses instead of doing follow-up GETs whenever possible.",
    "- Ideal read count is zero. If a read is required, prefer one decisive GET with fields=*.",
    "- Use only the provided base URL and session token.",
    "- Authenticate with Basic Auth username 0 and password = session token.",
    "- If the provided base URL already includes /v2, do not build URLs in a way that escapes back to the host root.",
    "- If credentials are obviously fake, or the first attempted call returns invalid/expired token, treat the run as blocked instead of guessing.",
    "- Do not ask questions. Do not talk to the user. Do only the task.",
    "",
    "Task:",
    input.prompt,
    "",
    "Tripletex API base URL:",
    effectiveCredentials.baseUrl,
    "",
    "Tripletex session token:",
    effectiveCredentials.sessionToken,
    "",
    "Run scripts directory:",
    scriptsDir,
    "",
    "Runner configuration:",
    `- provider: ${agentProvider}`,
  ];

  if (agentProvider === "claude") {
    lines.push(`- model: ${claudeModel}`);
    lines.push(`- effort: ${claudeEffort}`);
    lines.push("- backend: proxy");
    lines.push(`- proxy_base_url: ${claudeProxyBaseUrl}`);
    lines.push("- disable_experimental_betas: false");
  } else {
    lines.push("- model: gpt-5.4");
    lines.push('- reasoning_effort: high');
    lines.push("- service_tier: fast");
  }

  if (files.length === 0) {
    return lines.join("\n");
  }

  return [
    ...lines,
    "",
    "Attachment paths:",
    ...files.map((file) => file.path),
  ].join("\n");
}

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function extractAssistantText(content: unknown): string {
  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .flatMap((item) => {
      if (!isRecord(item) || item.type !== "output_text" || typeof item.text !== "string") {
        return [];
      }

      return [item.text];
    })
    .join("\n")
    .trim();
}

async function collectCodexSessionFiles(): Promise<string[]> {
  if (agentProvider === "claude") {
    const projectDir = join(claudeProjectsDir, claudeProjectDirName(codexEnvironmentDir));
    const entries = await readdir(projectDir, { withFileTypes: true }).catch(() => []);
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".jsonl"))
      .map((entry) => join(projectDir, entry.name));
  }

  const sessionsRoot = join(codexHomeDir, "sessions");
  const years = await readdir(sessionsRoot, { withFileTypes: true }).catch(() => []);
  const files: string[] = [];

  for (const yearEntry of years) {
    if (!yearEntry.isDirectory()) {
      continue;
    }

    const yearPath = join(sessionsRoot, yearEntry.name);
    const months = await readdir(yearPath, { withFileTypes: true }).catch(() => []);
    for (const monthEntry of months) {
      if (!monthEntry.isDirectory()) {
        continue;
      }

      const monthPath = join(yearPath, monthEntry.name);
      const days = await readdir(monthPath, { withFileTypes: true }).catch(() => []);
      for (const dayEntry of days) {
        if (!dayEntry.isDirectory()) {
          continue;
        }

        const dayPath = join(monthPath, dayEntry.name);
        const dayFiles = await readdir(dayPath, { withFileTypes: true }).catch(() => []);
        for (const fileEntry of dayFiles) {
          if (fileEntry.isFile() && fileEntry.name.endsWith(".jsonl")) {
            files.push(join(dayPath, fileEntry.name));
          }
        }
      }
    }
  }

  return files;
}

async function findMatchingCodexSession(prompt: string, createdAt: string): Promise<MatchedCodexSession | undefined> {
  const createdAtMs = Date.parse(createdAt);
  const candidates = await collectCodexSessionFiles();
  const ranked = await Promise.all(
    candidates.map(async (path) => {
      const fileStat = await stat(path).catch(() => undefined);
      return {
        mtimeMs: fileStat?.mtimeMs ?? 0,
        path,
      };
    }),
  );

  ranked.sort((a, b) => b.mtimeMs - a.mtimeMs);

  for (const candidate of ranked.slice(0, 80)) {
    const raw = await readFile(candidate.path, "utf8").catch(() => "");
    if (!raw) {
      continue;
    }

    const lines = raw.split("\n").filter(Boolean);
    if (lines.length === 0) {
      continue;
    }

    if (agentProvider === "claude") {
      let sessionId: string | undefined;
      let timestamp: string | undefined;
      let cwd: string | undefined;
      let userPrompt: string | undefined;

      for (const line of lines) {
        const item = safeJsonParse(line);
        if (!isRecord(item)) {
          continue;
        }

        if (!sessionId && typeof item.sessionId === "string") {
          sessionId = item.sessionId;
        }

        if (!timestamp && typeof item.timestamp === "string") {
          timestamp = item.timestamp;
        }

        if (!cwd && typeof item.cwd === "string") {
          cwd = item.cwd;
        }

        if (
          item.type === "user" &&
          isRecord(item.message) &&
          item.message.role === "user" &&
          typeof item.message.content === "string"
        ) {
          userPrompt = item.message.content;
          break;
        }
      }

      if (!sessionId || cwd !== codexEnvironmentDir || userPrompt !== prompt) {
        continue;
      }

      if (timestamp && Math.abs(Date.parse(timestamp) - createdAtMs) > 15 * 60 * 1000) {
        continue;
      }

      return {
        path: candidate.path,
        sessionMeta: {
          id: sessionId,
          timestamp,
          cwd,
          provider: "claude",
        },
      };
    }

    const first = safeJsonParse(lines[0]);
    if (
      !isRecord(first) ||
      first.type !== "session_meta" ||
      !isRecord(first.payload) ||
      typeof first.payload.id !== "string"
    ) {
      continue;
    }

    const sessionMeta: CodexSessionMeta = {
      id: first.payload.id,
      timestamp: typeof first.payload.timestamp === "string" ? first.payload.timestamp : undefined,
      cwd: typeof first.payload.cwd === "string" ? first.payload.cwd : undefined,
      cli_version: typeof first.payload.cli_version === "string" ? first.payload.cli_version : undefined,
      provider: "codex",
    };

    if (sessionMeta.cwd !== codexEnvironmentDir) {
      continue;
    }

    if (sessionMeta.timestamp && Math.abs(Date.parse(sessionMeta.timestamp) - createdAtMs) > 15 * 60 * 1000) {
      continue;
    }

    const userMessageLine = lines.find((line) => line.includes('"type":"user_message"'));
    if (!userMessageLine) {
      continue;
    }

    const event = safeJsonParse(userMessageLine);
    if (
      !isRecord(event) ||
      !isRecord(event.payload) ||
      event.payload.type !== "user_message" ||
      typeof event.payload.message !== "string"
    ) {
      continue;
    }

    if (event.payload.message !== prompt) {
      continue;
    }

    return {
      path: candidate.path,
      sessionMeta,
    };
  }

  return undefined;
}

async function buildCodexTraceSnapshot(session: MatchedCodexSession): Promise<CodexTraceSnapshot> {
  const raw = await readFile(session.path, "utf8");
  const lines = raw.split("\n").filter(Boolean);
  const entries: CodexTraceEntry[] = [];
  const toolNamesByCallId = new Map<string, string>();
  let completed = false;
  let lastAssistantMessage: string | undefined;
  let taskCompleteTimestamp: string | undefined;

  if (session.sessionMeta.provider === "claude") {
    for (const line of lines) {
      const item = safeJsonParse(line);
      if (!isRecord(item) || typeof item.timestamp !== "string") {
        continue;
      }

      if (
        item.type === "user" &&
        isRecord(item.message) &&
        item.message.role === "user"
      ) {
        if (typeof item.message.content === "string") {
          entries.push({
            kind: "user_message",
            text: item.message.content,
            timestamp: item.timestamp,
          });
          continue;
        }

        if (Array.isArray(item.message.content)) {
          for (const part of item.message.content) {
            if (!isRecord(part) || part.type !== "tool_result" || typeof part.tool_use_id !== "string") {
              continue;
            }

            entries.push({
              kind: "tool_result",
              call_id: part.tool_use_id,
              tool_name: toolNamesByCallId.get(part.tool_use_id),
              output: stringifyUnknown(part.content),
              timestamp: item.timestamp,
            });
          }
        }

        continue;
      }

      if (
        item.type === "assistant" &&
        isRecord(item.message) &&
        Array.isArray(item.message.content)
      ) {
        const text = extractClaudeTextContent(item.message.content);
        if (text) {
          entries.push({
            kind: "assistant_message",
            text,
            timestamp: item.timestamp,
          });
          lastAssistantMessage = text;
        }

        for (const part of item.message.content) {
          if (
            !isRecord(part) ||
            part.type !== "tool_use" ||
            typeof part.id !== "string" ||
            typeof part.name !== "string"
          ) {
            continue;
          }

          toolNamesByCallId.set(part.id, part.name);
          entries.push({
            kind: "tool_call",
            tool_name: part.name,
            call_id: part.id,
            arguments_raw: stringifyUnknown(part.input ?? {}),
            arguments: part.input ?? {},
            timestamp: item.timestamp,
          });
        }
      }
    }

    return {
      session: {
        session_id: session.sessionMeta.id,
        session_file: session.path,
        session_meta: session.sessionMeta,
        completed,
        last_assistant_message: lastAssistantMessage,
        task_complete_timestamp: taskCompleteTimestamp,
      },
      summary: {
        assistant_message_count: entries.filter((entry) => entry.kind === "assistant_message").length,
        tool_call_count: entries.filter((entry) => entry.kind === "tool_call").length,
        tool_result_count: entries.filter((entry) => entry.kind === "tool_result").length,
        user_message_count: entries.filter((entry) => entry.kind === "user_message").length,
      },
      entries,
    };
  }

  for (const line of lines) {
    const item = safeJsonParse(line);
    if (!isRecord(item) || typeof item.timestamp !== "string" || !isRecord(item.payload)) {
      continue;
    }

    if (item.type === "event_msg") {
      if (item.payload.type === "user_message" && typeof item.payload.message === "string") {
        entries.push({
          kind: "user_message",
          text: item.payload.message,
          timestamp: item.timestamp,
        });
      }

      if (item.payload.type === "agent_message" && typeof item.payload.message === "string") {
        entries.push({
          kind: "assistant_message",
          phase: typeof item.payload.phase === "string" ? item.payload.phase : undefined,
          text: item.payload.message,
          timestamp: item.timestamp,
        });
        lastAssistantMessage = item.payload.message;
      }

      if (item.payload.type === "task_started" || item.payload.type === "task_complete") {
        entries.push({
          kind: "task_event",
          task_type: item.payload.type,
          text: typeof item.payload.last_agent_message === "string" ? item.payload.last_agent_message : undefined,
          timestamp: item.timestamp,
        });
      }

      if (item.payload.type === "task_complete") {
        completed = true;
        taskCompleteTimestamp = item.timestamp;
      }
    }

    if (item.type === "response_item") {
      if (
        item.payload.type === "function_call" &&
        typeof item.payload.name === "string" &&
        typeof item.payload.arguments === "string" &&
        typeof item.payload.call_id === "string"
      ) {
        toolNamesByCallId.set(item.payload.call_id, item.payload.name);
        entries.push({
          kind: "tool_call",
          tool_name: item.payload.name,
          call_id: item.payload.call_id,
          arguments_raw: item.payload.arguments,
          arguments: safeJsonParse(item.payload.arguments),
          timestamp: item.timestamp,
        });
      }

      if (
        item.payload.type === "function_call_output" &&
        typeof item.payload.call_id === "string" &&
        typeof item.payload.output === "string"
      ) {
        entries.push({
          kind: "tool_result",
          call_id: item.payload.call_id,
          tool_name: toolNamesByCallId.get(item.payload.call_id),
          output: item.payload.output,
          timestamp: item.timestamp,
        });
      }
    }
  }

  return {
    session: {
      session_id: session.sessionMeta.id,
      session_file: session.path,
      session_meta: session.sessionMeta,
      completed,
      last_assistant_message: lastAssistantMessage,
      task_complete_timestamp: taskCompleteTimestamp,
    },
    summary: {
      assistant_message_count: entries.filter((entry) => entry.kind === "assistant_message").length,
      tool_call_count: entries.filter((entry) => entry.kind === "tool_call").length,
      tool_result_count: entries.filter((entry) => entry.kind === "tool_result").length,
      user_message_count: entries.filter((entry) => entry.kind === "user_message").length,
    },
    entries,
  };
}

async function readInteractiveTaskCompletion(
  matchedSession: MatchedCodexSession,
): Promise<Pick<WaitForSolveResult, "reason" | "taskCompleteTimestamp"> | undefined> {
  const raw = await readFile(matchedSession.path, "utf8").catch(() => "");
  if (!raw) {
    return undefined;
  }

  for (const line of raw.split("\n")) {
    const item = safeJsonParse(line);
    if (
      isRecord(item) &&
      item.type === "event_msg" &&
      typeof item.timestamp === "string" &&
      isRecord(item.payload) &&
      item.payload.type === "task_complete"
    ) {
      return {
        reason: "completed",
        taskCompleteTimestamp: item.timestamp,
      };
    }
  }

  return undefined;
}

function renderCodexTraceMarkdown(snapshot: CodexTraceSnapshot): string {
  const lines = [
    `# ${snapshot.session.session_meta.provider === "claude" ? "Claude" : "Codex"} Trace Snapshot`,
    "",
    `- provider: ${snapshot.session.session_meta.provider ?? "codex"}`,
    `- session_id: ${snapshot.session.session_id}`,
    `- session_file: ${snapshot.session.session_file}`,
    `- completed: ${snapshot.session.completed}`,
    `- assistant_messages: ${snapshot.summary.assistant_message_count}`,
    `- tool_calls: ${snapshot.summary.tool_call_count}`,
    `- tool_results: ${snapshot.summary.tool_result_count}`,
    "",
  ];

  for (const entry of snapshot.entries) {
    lines.push(`## ${entry.timestamp} ${entry.kind}`);

    if (entry.kind === "assistant_message") {
      if (entry.phase) {
        lines.push(`phase: ${entry.phase}`);
        lines.push("");
      }
      lines.push(entry.text);
      lines.push("");
      continue;
    }

    if (entry.kind === "user_message") {
      lines.push(entry.text);
      lines.push("");
      continue;
    }

    if (entry.kind === "task_event") {
      lines.push(`event: ${entry.task_type}`);
      if (entry.text) {
        lines.push("");
        lines.push(entry.text);
      }
      lines.push("");
      continue;
    }

    if (entry.kind === "tool_call") {
      lines.push(`tool: ${entry.tool_name}`);
      lines.push(`call_id: ${entry.call_id}`);
      lines.push("");
      lines.push("```json");
      lines.push(
        typeof entry.arguments === "string" ? JSON.stringify(entry.arguments) : JSON.stringify(entry.arguments, null, 2),
      );
      lines.push("```");
      lines.push("");
      continue;
    }

    lines.push(`tool: ${entry.tool_name ?? "unknown"}`);
    lines.push(`call_id: ${entry.call_id}`);
    lines.push("");
    lines.push("```text");
    lines.push(entry.output);
    lines.push("```");
    lines.push("");
  }

  return lines.join("\n");
}

async function persistCodexTraceArtifacts(
  preparedRun: PreparedRun,
  initialMatchedSession?: MatchedCodexSession,
): Promise<MatchedCodexSession | undefined> {
  let matchedSession: MatchedCodexSession | undefined = initialMatchedSession;
  if (!matchedSession) {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      matchedSession = await findMatchingCodexSession(preparedRun.codexPrompt, preparedRun.createdAt);
      if (matchedSession) {
        break;
      }

      await sleep(500);
    }
  }
  const captureStatusPath = join(preparedRun.runDir, "codex-trace.status.json");

  if (!matchedSession) {
    await writeFile(
      captureStatusPath,
      JSON.stringify(
        {
          status: "missing_session",
          created_at: nowIso(),
          codex_home: codexHomeDir,
          cwd: codexEnvironmentDir,
        },
        null,
        2,
      ),
    );
    return undefined;
  }

  const snapshot = await buildCodexTraceSnapshot(matchedSession);
  const runtimeStatus = await readRuntimeStatus(preparedRun.agentRunStatusPath);
  if (runtimeStatus?.status === "exited") {
    snapshot.session.completed = true;
    if (typeof runtimeStatus.recorded_at === "string") {
      snapshot.session.task_complete_timestamp = runtimeStatus.recorded_at;
    }
  }

  const filteredJsonl = snapshot.entries.map((entry) => JSON.stringify(entry)).join("\n");
  const filteredJsonlContent = filteredJsonl ? `${filteredJsonl}\n` : "";
  const snapshotJson = JSON.stringify(snapshot, null, 2);
  const readableMarkdown = renderCodexTraceMarkdown(snapshot);
  const statusJson = JSON.stringify(
    {
      status: "captured",
      captured_at: nowIso(),
      provider: matchedSession.sessionMeta.provider ?? agentProvider,
      session_id: matchedSession.sessionMeta.id,
      session_file: matchedSession.path,
      summary: snapshot.summary,
    },
    null,
    2,
  );

  await writeFile(join(preparedRun.runDir, "codex-trace.filtered.jsonl"), filteredJsonlContent);
  await writeFile(join(preparedRun.runDir, "codex-trace.snapshot.json"), snapshotJson);
  await writeFile(join(preparedRun.runDir, "codex-trace.readable.md"), readableMarkdown);
  await writeFile(captureStatusPath, statusJson);
  await writeFile(join(preparedRun.runDir, "agent-trace.filtered.jsonl"), filteredJsonlContent);
  await writeFile(join(preparedRun.runDir, "agent-trace.snapshot.json"), snapshotJson);
  await writeFile(join(preparedRun.runDir, "agent-trace.readable.md"), readableMarkdown);
  await writeFile(join(preparedRun.runDir, "agent-trace.status.json"), statusJson);

  return matchedSession;
}

async function getTmuxPaneCurrentCommand(windowName: string): Promise<string | undefined> {
  const output = await runCommand([
    "tmux",
    "list-panes",
    "-t",
    `${tmuxSessionName}:${windowName}`,
    "-F",
    "#{pane_current_command}",
  ]).catch(() => "");

  const [first] = output.split("\n").filter(Boolean);
  return first || undefined;
}

function buildReflectionPrompt(
  summaryPath: string,
  scriptsDir: string,
  sandboxCredentials: TripletexCredentials | undefined,
): string {
  const lines = [
    "You are doing a post-run learning pass for this exact agent session.",
    "Work fully autonomously until everything below is complete.",
    "Do not ask questions.",
    "Do not talk to the user.",
    "Do not stop early after reflection.",
    "",
    `Your final answer will be saved automatically to this canonical path: ${summaryPath}`,
    "Treat that as the only final summary artifact for this follow-up run.",
    "",
    "All playbook and AGENTS.md edits must be written in English.",
    "",
    "You must complete this full sequence:",
    "1. Reflect on the original run: what went well, what went poorly, what mistakes happened, why they happened, and what the correct approach should have been.",
    "2. Then explicitly audit whether the run used the fewest API calls realistically possible for that exact task shape.",
    "3. Then use the persistent sandbox to investigate and prove the correct solution path.",
    "4. Then identify the lower-call path that the next agent should use for the same or very similar task, and list the specific API-call pitfalls that should be avoided.",
    "5. Then update the trusted-standard and playbook system from what you learned, certain earlier trusted standards or playbooks may be inefficient or not the optimal API execution paths.",
    "6. Then commit the AGENTS.md, trusted-standard, and playbook changes.",
    "7. Then write the final summary.",
    "",
    "Strict rules:",
    "- Do not continue the original competition task against its original credentials.",
    "- If you need to call Tripletex during this follow-up, use only the sandbox credentials provided below.",
    `- Put any sandbox API scripts only in this run scripts directory: ${scriptsDir}`,
    "- Use TypeScript plus bun for API interaction.",
    "- If creation of certain objects are needed in the Sandbox but were not needed in the production task, omit these or any mention of verification of objects from the playbook. These will already be there when the production task comes next time",
    "- Re-read ./AGENTS.md and inspect ./trusted-standards/ and ./task-playbooks/ before deciding what to update.",
    "- If the task was an exact common task shape and you proved a better or corrected standard path, update the relevant file in ./trusted-standards/.",
    "- If you changed a common endpoint shape, prerequisite rule, or canonical low-call path, also update ./trusted-standards/common-endpoints.md.",
    "- Always think in terms of minimum API calls needed for perfect correctness.",
    "- Always try to reduce the amount of API calls used in the flow.",
    "- In the local sandbox, actively try alternative lower-call ways to achieve the same final state.",
    "- If the run used extra calls, explain exactly which calls were unnecessary and what the lower-call replacement path is.",
    "- Record specific pitfalls that would make a future agent waste calls or trigger avoidable 4xx errors.",
    "- If you create a new playbook, use a concise kebab-case filename in ./task-playbooks/.",
    "- If you create a new trusted standard, use a concise kebab-case filename in ./trusted-standards/.",
    "- If you create or rename a playbook, update the Task Playbooks table in ./AGENTS.md in the same change.",
    "- If you create or rename a trusted standard, update the Trusted Standards table in ./AGENTS.md in the same change.",
    "- Edit only the relevant learning artifacts: ./AGENTS.md, files under ./trusted-standards/, and files under ./task-playbooks/.",
    "- Use non-interactive git commands only.",
    "- Commit only the AGENTS.md, trusted-standards, and task-playbooks changes. Do not commit run artifacts.",
    "",
    "Commit requirements:",
    "- Make one git commit after the documentation/playbook work is complete.",
    "- Commit message format: tripletex playbook: <what changed>",
    "",
    "Final summary requirements:",
    "Write the final summary as Markdown with these exact sections:",
    "1. Task",
    "2. Reflection",
    "3. Call Efficiency",
    "4. Root Causes",
    "5. Sandbox Verification",
    "6. Playbook Changes",
    "7. Commit",
    "8. Reusable Heuristics",
    "",
    "In the final summary:",
    "- Be specific about mistakes, wasted calls, weak assumptions, missing instructions, and corrected solution shape.",
    "- In the Call Efficiency section, state whether the run was minimal-call or not, list wasted calls if any, and give the exact lower-call path the next agent should follow.",
    "- State whether you updated an existing trusted standard or playbook, or created a new one.",
    "- List the exact trusted-standard and playbook paths changed.",
    "- Include the git commit hash and commit message.",
  ];

  if (sandboxCredentials) {
    lines.push("");
    lines.push("Persistent sandbox credentials for investigation:");
    lines.push(`- base_url: ${sandboxCredentials.base_url}`);
    lines.push(`- session_token: ${sandboxCredentials.session_token}`);
    lines.push("- Basic Auth username: 0");
  } else {
    lines.push("");
    lines.push("Persistent sandbox credentials were not available in the local environment.");
    lines.push("If sandbox access is unavailable, still complete the reflection and playbook update work,");
    lines.push("and explicitly state that sandbox verification was blocked.");
  }

  return lines.join("\n");
}

function buildScoreReflectionPrompt(
  summaryPath: string,
  taskAttributionPath: string,
  submissionScorePath: string,
  leaderboardBeforePath: string,
  leaderboardAfterPath: string,
  priorReflectionSummaryPath: string,
): string {
  return [
    "You are doing the score-aware follow-up for this exact Tripletex run.",
    "This happens after the earlier post-review completed and after the official submission score became available.",
    "Work fully autonomously.",
    "Do not ask questions.",
    "Do not talk to the user.",
    "Do not call Tripletex again.",
    "Do not edit code, playbooks, or AGENTS.md in this phase.",
    "Do not commit anything in this phase.",
    "",
    `Write your final answer to this path: ${summaryPath}`,
    "",
    "Artifacts to read first:",
    `- prior reflection summary: ${priorReflectionSummaryPath}`,
    `- task attribution: ${taskAttributionPath}`,
    `- submission score: ${submissionScorePath}`,
    `- leaderboard before: ${leaderboardBeforePath}`,
    `- leaderboard after: ${leaderboardAfterPath}`,
    "",
    "Required analysis:",
    "1. Identify the attributed task id from task attribution if available.",
    "2. Read submission-score.json and determine whether correctness was perfect.",
    "2.5. Task tier max scores are: T1 tasks 1-8 => max 2, T2 tasks 9-18 => max 4, T3 tasks 19-30 => max 6.",
    "3. If correctness was not perfect, explain what the run likely did wrong in the final Tripletex state or payload mapping.",
    "4. If correctness was perfect, use normalized_score together with the attributed leaderboard entry to judge whether the run was likely inefficient.",
    "5. If correctness was perfect but score lagged the leaderboard best for that task, treat that as an efficiency/error signal rather than a correctness signal.",
    "6. Use the existing agent trace and prior reflection to identify likely wasted API calls, avoidable reads, retries, or 4xx-causing mistakes.",
    "7. State clearly what the run did right, what it did wrong, and what the next agent should change.",
    "",
    "Output requirements:",
    "Write Markdown with these exact sections:",
    "1. Task Attribution",
    "2. Correctness Verdict",
    "3. Efficiency Verdict",
    "4. Likely Root Cause",
    "5. What Went Right",
    "6. What To Change Next Time",
    "",
    "Decision rule:",
    "- correctness < 1 means wrong data, wrong intent execution, or missing/incorrect side effects.",
    "- correctness = 1 with weaker score means the likely issue is extra API calls, retries, or avoidable 4xx/errors rather than wrong final state.",
  ].join("\n");
}

async function readSessionLines(path: string): Promise<string[]> {
  const raw = await readFile(path, "utf8").catch(() => "");
  return raw ? raw.split("\n").filter(Boolean) : [];
}

function countTaskCompleteEvents(lines: string[]): number {
  let count = 0;

  for (const line of lines) {
    const item = safeJsonParse(line);
    if (
      isRecord(item) &&
      item.type === "event_msg" &&
      isRecord(item.payload) &&
      item.payload.type === "task_complete"
    ) {
      count += 1;
    }
  }

  return count;
}

function findTaskCompleteAfterCount(
  lines: string[],
  baselineTaskCompleteCount: number,
): { lastAgentMessage?: string; timestamp?: string } | undefined {
  let seen = 0;

  for (const line of lines) {
    const item = safeJsonParse(line);
    if (
      isRecord(item) &&
      item.type === "event_msg" &&
      typeof item.timestamp === "string" &&
      isRecord(item.payload) &&
      item.payload.type === "task_complete"
    ) {
      seen += 1;
      if (seen > baselineTaskCompleteCount) {
        return {
          timestamp: item.timestamp,
          lastAgentMessage:
            typeof item.payload.last_agent_message === "string" ? item.payload.last_agent_message : undefined,
        };
      }
    }
  }

  return undefined;
}

function buildReflectionLaunchScript(
  preparedRun: PreparedRun,
  matchedSession: MatchedCodexSession,
  reflectionPromptPath: string,
): string {
  if (agentProvider === "claude") {
    const runtimeStatusPath = join(preparedRun.runDir, "codex-reflection.runtime-status.json");
    const reflectionOutputPath = join(preparedRun.runDir, "codex-reflection.summary.md");
    return `#!/usr/bin/env zsh
set -u

cd ${shellQuote(codexEnvironmentDir)}

PROMPT_FILE=${shellQuote(reflectionPromptPath)}
SESSION_ID=${shellQuote(matchedSession.sessionMeta.id)}
STATUS_FILE=${shellQuote(runtimeStatusPath)}
REFLECTION_OUTPUT_FILE=${shellQuote(reflectionOutputPath)}
write_status() {
  local run_status="$1"
  local run_exit_code="$2"
  local recorded_at
  recorded_at=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  cat > "$STATUS_FILE" <<EOF
{
  "status": "$run_status",
  "provider": "claude",
  "run_id": "${preparedRun.runId}",
  "request_id": "${preparedRun.requestId}",
  "recorded_at": "$recorded_at",
  "exit_code": $run_exit_code
}
EOF
}

write_status "running" 0

unset CLAUDE_CODE_USE_VERTEX
unset ANTHROPIC_VERTEX_PROJECT_ID
unset CLOUD_ML_REGION
export ANTHROPIC_BASE_URL=${shellQuote(claudeProxyBaseUrl)}
export ANTHROPIC_API_KEY=${shellQuote(claudeProxyApiKey)}
claude -r "$SESSION_ID" --model ${shellQuote(claudeModel)} --effort ${shellQuote(claudeEffort)} --add-dir ${shellQuote(preparedRun.runDir)} --dangerously-skip-permissions -p --output-format text "$(cat "$PROMPT_FILE")" > "$REFLECTION_OUTPUT_FILE"
agent_exit_code=$?
write_status "exited" $agent_exit_code

print
print "claude reflection resume exited with status $agent_exit_code"
print "run id: ${preparedRun.runId}"
print "run dir: ${preparedRun.runDir}"
print "session id: ${matchedSession.sessionMeta.id}"
exec zsh -i
`;
  }

  return `#!/usr/bin/env zsh
set -u

cd ${shellQuote(codexEnvironmentDir)}

PROMPT_FILE=${shellQuote(reflectionPromptPath)}
SESSION_ID=${shellQuote(matchedSession.sessionMeta.id)}

codex resume -m gpt-5.4 -c model_reasoning_effort='"high"' -c service_tier='"fast"' --yolo --no-alt-screen "$SESSION_ID" "$(cat "$PROMPT_FILE")"
status=$?

print
print "codex reflection resume exited with status $status"
print "run id: ${preparedRun.runId}"
print "run dir: ${preparedRun.runDir}"
print "session id: ${matchedSession.sessionMeta.id}"
exec zsh -i
`;
}

function buildReflectionWindowName(preparedRun: PreparedRun): string {
  return `${preparedRun.tmuxWindow.slice(0, 40)}-reflect`;
}

function buildScoreReflectionWindowName(preparedRun: PreparedRun): string {
  return `${preparedRun.tmuxWindow.slice(0, 38)}-score-review`;
}

async function launchReflectionRun(
  preparedRun: PreparedRun,
  matchedSession: MatchedCodexSession,
  reflectionPromptPath: string,
): Promise<{ launchScriptPath: string; tmuxWindow: string }> {
  const reflectionTmuxWindow = buildReflectionWindowName(preparedRun);
  const reflectionLaunchScriptPath = join(preparedRun.runDir, "launch-codex-reflection.zsh");
  await writeFile(
    reflectionLaunchScriptPath,
    buildReflectionLaunchScript(preparedRun, matchedSession, reflectionPromptPath),
  );
  await chmod(reflectionLaunchScriptPath, 0o755);

  await withTmuxLaunchLock(async () => {
    await runCommand([
      "tmux",
      "new-window",
      "-d",
      "-t",
      tmuxSessionName,
      "-n",
      reflectionTmuxWindow,
      "-c",
      codexEnvironmentDir,
      reflectionLaunchScriptPath,
    ]);
  });

  return {
    launchScriptPath: reflectionLaunchScriptPath,
    tmuxWindow: reflectionTmuxWindow,
  };
}

async function launchScoreReflectionRun(
  preparedRun: PreparedRun,
  matchedSession: MatchedCodexSession,
  reflectionPromptPath: string,
): Promise<{ launchScriptPath: string; tmuxWindow: string }> {
  const reflectionTmuxWindow = buildScoreReflectionWindowName(preparedRun);
  const reflectionLaunchScriptPath = join(preparedRun.runDir, "launch-codex-score-reflection.zsh");
  await writeFile(
    reflectionLaunchScriptPath,
    buildReflectionLaunchScript(preparedRun, matchedSession, reflectionPromptPath),
  );
  await chmod(reflectionLaunchScriptPath, 0o755);

  await withTmuxLaunchLock(async () => {
    await runCommand([
      "tmux",
      "new-window",
      "-d",
      "-t",
      tmuxSessionName,
      "-n",
      reflectionTmuxWindow,
      "-c",
      codexEnvironmentDir,
      reflectionLaunchScriptPath,
    ]);
  });

  return {
    launchScriptPath: reflectionLaunchScriptPath,
    tmuxWindow: reflectionTmuxWindow,
  };
}

async function finalizeReflectionRun(
  preparedRun: PreparedRun,
  matchedSession: MatchedCodexSession,
  baselineLineCount: number,
  baselineTaskCompleteCount: number,
  reflectionSummaryPath: string,
  reflectionEventsPath: string,
): Promise<ReflectionRunResult> {
  const deadline = Date.now() + solveTimeoutMs;
  const runtimeStatusPath = join(preparedRun.runDir, "codex-reflection.runtime-status.json");

  if (agentProvider === "claude") {
    while (Date.now() < deadline) {
      const lines = await readSessionLines(matchedSession.path);
      if (lines.length > baselineLineCount) {
        const appendedLines = lines.slice(baselineLineCount).join("\n");
        await writeFile(reflectionEventsPath, appendedLines ? `${appendedLines}\n` : "");
      }

      const runtimeStatus = await readRuntimeStatus(runtimeStatusPath);
      if (runtimeStatus?.status === "exited") {
        await writeFile(
          join(preparedRun.runDir, "codex-reflection.status.json"),
          JSON.stringify(
            {
              status: "completed",
              completed_at: typeof runtimeStatus.recorded_at === "string" ? runtimeStatus.recorded_at : nowIso(),
              session_id: matchedSession.sessionMeta.id,
              tmux_window: preparedRun.tmuxWindow,
              reflection_summary_path: reflectionSummaryPath,
              reflection_events_path: reflectionEventsPath,
              provider: "claude",
              runtime_status_path: runtimeStatusPath,
              exit_code: runtimeStatus.exit_code,
            },
            null,
            2,
          ),
        );
        return {
          status: "completed",
          completedAt: typeof runtimeStatus.recorded_at === "string" ? runtimeStatus.recorded_at : undefined,
        };
      }

      await sleep(1000);
    }

    await writeFile(
      join(preparedRun.runDir, "codex-reflection.status.json"),
      JSON.stringify(
        {
          status: "timed_out",
          timed_out_at: nowIso(),
          session_id: matchedSession.sessionMeta.id,
          tmux_window: preparedRun.tmuxWindow,
          reflection_summary_path: reflectionSummaryPath,
          reflection_events_path: reflectionEventsPath,
          provider: "claude",
          runtime_status_path: runtimeStatusPath,
        },
        null,
        2,
      ),
    );

    return {
      status: "timed_out",
    };
  }

  while (Date.now() < deadline) {
    const lines = await readSessionLines(matchedSession.path);
    if (lines.length > baselineLineCount) {
      const appendedLines = lines.slice(baselineLineCount).join("\n");
      await writeFile(reflectionEventsPath, appendedLines ? `${appendedLines}\n` : "");
    }

    const completion = findTaskCompleteAfterCount(lines, baselineTaskCompleteCount);
    if (completion) {
      if (completion.lastAgentMessage) {
        await writeFile(reflectionSummaryPath, completion.lastAgentMessage);
      }

      await writeFile(
        join(preparedRun.runDir, "codex-reflection.status.json"),
        JSON.stringify(
          {
            status: "completed",
            completed_at: nowIso(),
            session_id: matchedSession.sessionMeta.id,
            tmux_window: preparedRun.tmuxWindow,
            reflection_summary_path: reflectionSummaryPath,
            reflection_events_path: reflectionEventsPath,
            reflection_task_complete_timestamp: completion.timestamp,
          },
          null,
          2,
        ),
      );
      return {
        status: "completed",
        completedAt: completion.timestamp,
      };
    }

    await sleep(1000);
  }

  await writeFile(
    join(preparedRun.runDir, "codex-reflection.status.json"),
    JSON.stringify(
      {
        status: "timed_out",
        timed_out_at: nowIso(),
        session_id: matchedSession.sessionMeta.id,
        tmux_window: preparedRun.tmuxWindow,
        reflection_summary_path: reflectionSummaryPath,
        reflection_events_path: reflectionEventsPath,
      },
      null,
      2,
    ),
  );

  return {
    status: "timed_out",
  };
}

async function maybeLaunchReflectionRun(
  preparedRun: PreparedRun,
  matchedSession: MatchedCodexSession | undefined,
): Promise<ReflectionRunResult> {
  const sandboxCredentials = await loadSandboxCredentials();
  const reflectionSummaryPath = join(preparedRun.runDir, "codex-reflection.summary.md");
  const reflectionPromptPath = join(preparedRun.runDir, "codex-reflection.prompt.txt");
  await writeFile(
    reflectionPromptPath,
    buildReflectionPrompt(reflectionSummaryPath, preparedRun.scriptsDir, sandboxCredentials),
  );

  if (!matchedSession) {
    await writeFile(
      join(preparedRun.runDir, "codex-reflection.status.json"),
      JSON.stringify(
        {
          status: "skipped",
          reason: "missing_session",
          reflection_summary_path: reflectionSummaryPath,
          sandbox_credentials_available: Boolean(sandboxCredentials),
          created_at: nowIso(),
        },
        null,
        2,
      ),
    );
    return {
      status: "skipped",
    };
  }

  const sessionLines = await readSessionLines(matchedSession.path);
  const baselineLineCount = sessionLines.length;
  const baselineTaskCompleteCount = countTaskCompleteEvents(sessionLines);
  const reflectionEventsPath = join(preparedRun.runDir, "codex-reflection.events.jsonl");
  const launchedReflectionRun = await launchReflectionRun(preparedRun, matchedSession, reflectionPromptPath);

  log("INFO", "Launched same-session reflection run", {
    requestId: preparedRun.requestId,
    runId: preparedRun.runId,
    sessionId: matchedSession.sessionMeta.id,
    reflectionTmuxWindow: launchedReflectionRun.tmuxWindow,
    reflectionLaunchScriptPath: launchedReflectionRun.launchScriptPath,
  });

  await writeFile(
    join(preparedRun.runDir, "codex-reflection.status.json"),
    JSON.stringify(
      {
        status: "launched",
        launched_at: nowIso(),
        session_id: matchedSession.sessionMeta.id,
        tmux_window: launchedReflectionRun.tmuxWindow,
        launch_script_path: launchedReflectionRun.launchScriptPath,
        reflection_summary_path: reflectionSummaryPath,
        reflection_events_path: reflectionEventsPath,
        baseline_task_complete_count: baselineTaskCompleteCount,
        provider: agentProvider,
        runtime_status_path:
          agentProvider === "claude" ? join(preparedRun.runDir, "codex-reflection.runtime-status.json") : undefined,
        sandbox_credentials_available: Boolean(sandboxCredentials),
      },
      null,
      2,
    ),
  );

  return finalizeReflectionRun(
    preparedRun,
    matchedSession,
    baselineLineCount,
    baselineTaskCompleteCount,
    reflectionSummaryPath,
    reflectionEventsPath,
  );
}

async function finalizeScoreReflectionRun(
  preparedRun: PreparedRun,
  matchedSession: MatchedCodexSession,
  baselineLineCount: number,
  baselineTaskCompleteCount: number,
  reflectionSummaryPath: string,
  reflectionEventsPath: string,
): Promise<ReflectionRunResult> {
  const deadline = Date.now() + solveTimeoutMs;

  while (Date.now() < deadline) {
    const lines = await readSessionLines(matchedSession.path);
    if (lines.length > baselineLineCount) {
      const appendedLines = lines.slice(baselineLineCount).join("\n");
      await writeFile(reflectionEventsPath, appendedLines ? `${appendedLines}\n` : "");
    }

    const completion = findTaskCompleteAfterCount(lines, baselineTaskCompleteCount);
    if (completion) {
      if (completion.lastAgentMessage) {
        await writeFile(reflectionSummaryPath, completion.lastAgentMessage);
      }

      await writeFile(
        join(preparedRun.runDir, "codex-score-reflection.status.json"),
        JSON.stringify(
          {
            status: "completed",
            completed_at: nowIso(),
            session_id: matchedSession.sessionMeta.id,
            tmux_window: preparedRun.tmuxWindow,
            reflection_summary_path: reflectionSummaryPath,
            reflection_events_path: reflectionEventsPath,
            reflection_task_complete_timestamp: completion.timestamp,
          },
          null,
          2,
        ),
      );
      return {
        status: "completed",
        completedAt: completion.timestamp,
      };
    }

    await sleep(1000);
  }

  await writeFile(
    join(preparedRun.runDir, "codex-score-reflection.status.json"),
    JSON.stringify(
      {
        status: "timed_out",
        timed_out_at: nowIso(),
        session_id: matchedSession.sessionMeta.id,
        tmux_window: preparedRun.tmuxWindow,
        reflection_summary_path: reflectionSummaryPath,
        reflection_events_path: reflectionEventsPath,
      },
      null,
      2,
    ),
  );

  return {
    status: "timed_out",
  };
}

async function maybeLaunchScoreReflectionRun(
  preparedRun: PreparedRun,
  matchedSession: MatchedCodexSession | undefined,
): Promise<ReflectionRunResult> {
  const reflectionSummaryPath = join(preparedRun.runDir, "codex-score-reflection.summary.md");
  const reflectionPromptPath = join(preparedRun.runDir, "codex-score-reflection.prompt.txt");
  const reflectionEventsPath = join(preparedRun.runDir, "codex-score-reflection.events.jsonl");
  const taskAttributionPath = join(preparedRun.runDir, "task-attribution.json");
  const submissionScorePath = join(preparedRun.runDir, "submission-score.json");
  const leaderboardBeforePath = join(preparedRun.runDir, "leaderboard.before.json");
  const leaderboardAfterPath = join(preparedRun.runDir, "leaderboard.after.json");
  const priorReflectionSummaryPath = join(preparedRun.runDir, "codex-reflection.summary.md");

  if (!matchedSession) {
    await writeFile(
      join(preparedRun.runDir, "codex-score-reflection.status.json"),
      JSON.stringify(
        {
          status: "skipped",
          reason: "missing_session",
          reflection_summary_path: reflectionSummaryPath,
          created_at: nowIso(),
        },
        null,
        2,
      ),
    );
    return {
      status: "skipped",
    };
  }

  const submissionScoreRaw = await readFile(submissionScorePath, "utf8").catch(() => "");
  const taskAttributionRaw = await readFile(taskAttributionPath, "utf8").catch(() => "");
  if (!submissionScoreRaw || !taskAttributionRaw) {
    await writeFile(
      join(preparedRun.runDir, "codex-score-reflection.status.json"),
      JSON.stringify(
        {
          status: "skipped",
          reason: !submissionScoreRaw ? "missing_submission_score" : "missing_task_attribution",
          reflection_summary_path: reflectionSummaryPath,
          created_at: nowIso(),
        },
        null,
        2,
      ),
    );
    return {
      status: "skipped",
    };
  }

  await writeFile(
    reflectionPromptPath,
    buildScoreReflectionPrompt(
      reflectionSummaryPath,
      taskAttributionPath,
      submissionScorePath,
      leaderboardBeforePath,
      leaderboardAfterPath,
      priorReflectionSummaryPath,
    ),
  );

  const sessionLines = await readSessionLines(matchedSession.path);
  const baselineLineCount = sessionLines.length;
  const baselineTaskCompleteCount = countTaskCompleteEvents(sessionLines);
  const launchedReflectionRun = await launchScoreReflectionRun(preparedRun, matchedSession, reflectionPromptPath);

  log("INFO", "Launched score-aware reflection run", {
    requestId: preparedRun.requestId,
    runId: preparedRun.runId,
    sessionId: matchedSession.sessionMeta.id,
    reflectionTmuxWindow: launchedReflectionRun.tmuxWindow,
    reflectionLaunchScriptPath: launchedReflectionRun.launchScriptPath,
  });

  await writeFile(
    join(preparedRun.runDir, "codex-score-reflection.status.json"),
    JSON.stringify(
      {
        status: "launched",
        launched_at: nowIso(),
        session_id: matchedSession.sessionMeta.id,
        tmux_window: launchedReflectionRun.tmuxWindow,
        launch_script_path: launchedReflectionRun.launchScriptPath,
        reflection_summary_path: reflectionSummaryPath,
        reflection_events_path: reflectionEventsPath,
        baseline_task_complete_count: baselineTaskCompleteCount,
      },
      null,
      2,
    ),
  );

  return finalizeScoreReflectionRun(
    preparedRun,
    matchedSession,
    baselineLineCount,
    baselineTaskCompleteCount,
    reflectionSummaryPath,
    reflectionEventsPath,
  );
}

function buildLaunchScript(preparedRun: PreparedRun): string {
  if (agentProvider === "claude") {
    return `#!/usr/bin/env zsh
set -u

cd ${shellQuote(codexEnvironmentDir)}

PROMPT_FILE=${shellQuote(preparedRun.promptFilePath)}
STATUS_FILE=${shellQuote(preparedRun.agentRunStatusPath)}
write_status() {
  local run_status="$1"
  local run_exit_code="$2"
  local recorded_at
  recorded_at=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  cat > "$STATUS_FILE" <<EOF
{
  "status": "$run_status",
  "provider": "claude",
  "run_id": "${preparedRun.runId}",
  "request_id": "${preparedRun.requestId}",
  "recorded_at": "$recorded_at",
  "exit_code": $run_exit_code
}
EOF
}

write_status "running" 0

unset CLAUDE_CODE_USE_VERTEX
unset ANTHROPIC_VERTEX_PROJECT_ID
unset CLOUD_ML_REGION
export ANTHROPIC_BASE_URL=${shellQuote(claudeProxyBaseUrl)}
export ANTHROPIC_API_KEY=${shellQuote(claudeProxyApiKey)}

claude --model ${shellQuote(claudeModel)} --effort ${shellQuote(claudeEffort)} --add-dir ${shellQuote(preparedRun.runDir)} --dangerously-skip-permissions -p --output-format text "$(cat "$PROMPT_FILE")"
agent_exit_code=$?
write_status "exited" $agent_exit_code

print
print "claude exited with status $agent_exit_code"
print "run id: ${preparedRun.runId}"
print "run dir: ${preparedRun.runDir}"
print "request file: ${preparedRun.requestFilePath}"
exec zsh -i
`;
  }

  return `#!/usr/bin/env zsh
set -u

cd ${shellQuote(codexEnvironmentDir)}

PROMPT_FILE=${shellQuote(preparedRun.promptFilePath)}

codex -m gpt-5.4 -c model_reasoning_effort='"high"' -c service_tier='"fast"' --yolo --no-alt-screen "$(cat "$PROMPT_FILE")"
status=$?

print
print "codex exited with status $status"
print "run id: ${preparedRun.runId}"
print "run dir: ${preparedRun.runDir}"
print "request file: ${preparedRun.requestFilePath}"
exec zsh -i
`;
}

async function prepareRun(input: SolveRequest, requestId: string): Promise<PreparedRun> {
  const storageMode = resolveStorageMode(Bun.env.TRIPLETEX_STORAGE_MODE);
  const effectiveCredentials = await resolveEffectiveCredentials(input, storageMode);
  const runId = buildRunId(storageMode);
  const runDir = join(dataRootDir, storageMode, "runs", runId);
  const attachmentsDir = join(runDir, "attachments");
  const scriptsDir = join(runDir, "scripts");

  log("INFO", "Preparing run directory", {
    requestId,
    runId,
    storageMode,
    runDir,
    files: input.files?.length ?? 0,
    credentialsSource: effectiveCredentials.source,
    effectiveBaseUrl: effectiveCredentials.baseUrl,
    effectiveSessionToken: maskToken(effectiveCredentials.sessionToken),
  });

  await mkdir(attachmentsDir, { recursive: true });
  await mkdir(scriptsDir, { recursive: true });

  const storedFiles: StoredSolveFile[] = [];
  for (const [index, file] of (input.files ?? []).entries()) {
    const storedFilename = `${String(index + 1).padStart(2, "0")}-${sanitizeFilename(file.filename)}`;
    const filePath = join(attachmentsDir, storedFilename);
    await writeFile(filePath, Buffer.from(file.content_base64, "base64"));
    storedFiles.push({ ...file, path: filePath });

    log("INFO", "Stored attachment", {
      runId,
      index: index + 1,
      filename: file.filename,
      mimeType: file.mime_type,
      path: filePath,
    });
  }

  const requestFilePath = join(runDir, "request.json");
  const promptFilePath = join(runDir, "codex-prompt.txt");
  const launchScriptPath = join(runDir, "launch-codex.zsh");
  const agentRunStatusPath = join(runDir, "agent-run.status.json");
  const tmuxWindow = runId.slice(0, 48);
  const createdAt = new Date().toISOString();
  const codexPrompt = buildCodexPrompt(input, storedFiles, effectiveCredentials, scriptsDir);

  const preparedRun: PreparedRun = {
    agentRunStatusPath,
    createdAt,
    codexPrompt,
    effectiveCredentials,
    files: storedFiles,
    launchScriptPath,
    promptFilePath,
    requestId,
    requestFilePath,
    runDir,
    runId,
    solvePrompt: input.prompt,
    scriptsDir,
    storageMode,
    tmuxWindow,
  };

  const leaderboardBeforeSnapshot = await persistLeaderboardSnapshot(preparedRun, "before");
  const submissionsBeforeSnapshot = await persistSubmissionSnapshot(preparedRun, "before");
  await writeFile(requestFilePath, JSON.stringify(input, null, 2));
  await writeFile(promptFilePath, codexPrompt);
  await writeFile(
    join(runDir, "manifest.json"),
    JSON.stringify(
      {
        created_at: createdAt,
        request_id: requestId,
        run_id: runId,
        run_dir: runDir,
        storage_mode: storageMode,
        tmux_session: tmuxSessionName,
        tmux_window: tmuxWindow,
        scripts_dir: scriptsDir,
        runner_provider: agentProvider,
        credentials_source: effectiveCredentials.source,
        effective_base_url: effectiveCredentials.baseUrl,
        leaderboard_before_captured: Boolean(leaderboardBeforeSnapshot),
        submissions_before_captured: Boolean(submissionsBeforeSnapshot),
        agent_run_status_path: agentRunStatusPath,
        attachments: storedFiles.map(({ content_base64: _contentBase64, ...file }) => file),
      },
      null,
      2,
    ),
  );
  await writeFile(launchScriptPath, buildLaunchScript(preparedRun));
  await chmod(launchScriptPath, 0o755);

  log("INFO", "Run prepared", {
    requestId,
    runId,
    requestFilePath,
    promptFilePath,
    launchScriptPath,
    agentRunStatusPath,
    scriptsDir,
  });

  return preparedRun;
}

async function launchTmuxRun(preparedRun: PreparedRun): Promise<void> {
  await withTmuxLaunchLock(async () => {
    const sessionExisted = await tmuxSessionExists(tmuxSessionName);

    if (!sessionExisted) {
      await runCommand([
        "tmux",
        "new-session",
        "-d",
        "-s",
        tmuxSessionName,
        "-n",
        "__control__",
        "-c",
        codexEnvironmentDir,
      ]);
      await runCommand(["tmux", "set-option", "-t", tmuxSessionName, "remain-on-exit", "on"]);

      log("INFO", "Created tmux session", {
        requestId: preparedRun.requestId,
        tmuxSession: tmuxSessionName,
        codexEnvironmentDir,
      });
    }

    await runCommand([
      "tmux",
      "new-window",
      "-d",
      "-t",
      tmuxSessionName,
      "-n",
      preparedRun.tmuxWindow,
      "-c",
      codexEnvironmentDir,
      preparedRun.launchScriptPath,
    ]);

    log("INFO", "Created tmux window", {
      requestId: preparedRun.requestId,
      runId: preparedRun.runId,
      tmuxSession: tmuxSessionName,
      tmuxWindow: preparedRun.tmuxWindow,
      sessionExisted,
      codexEnvironmentDir,
    });
  });
}

async function waitForSolveCompletion(preparedRun: PreparedRun): Promise<WaitForSolveResult> {
  log("INFO", "Waiting for solve completion or timeout", {
    requestId: preparedRun.requestId,
    runId: preparedRun.runId,
    waitMs: solveTimeoutMs,
  });

  const deadline = Date.now() + solveTimeoutMs;
  let matchedSession: MatchedCodexSession | undefined;

  while (Date.now() < deadline) {
    if (!matchedSession) {
      matchedSession = await findMatchingCodexSession(preparedRun.codexPrompt, preparedRun.createdAt);
    }

    const runtimeStatus = await readRuntimeStatus(preparedRun.agentRunStatusPath);
    if (runtimeStatus?.status === "exited") {
      if (!matchedSession) {
        matchedSession = await findMatchingCodexSession(preparedRun.codexPrompt, preparedRun.createdAt);
      }

      log("INFO", "Detected solve completion from runtime status", {
        requestId: preparedRun.requestId,
        runId: preparedRun.runId,
        provider: runtimeStatus.provider ?? agentProvider,
        recordedAt: runtimeStatus.recorded_at,
        exitCode: runtimeStatus.exit_code,
        sessionId: matchedSession?.sessionMeta.id,
      });
      return {
        matchedSession,
        reason: "completed",
        taskCompleteTimestamp:
          typeof runtimeStatus.recorded_at === "string" ? runtimeStatus.recorded_at : undefined,
      };
    }

    if (matchedSession && agentProvider === "codex") {
      const completion = await readInteractiveTaskCompletion(matchedSession);
      if (completion) {
        log("INFO", "Detected solve completion from session trace", {
          requestId: preparedRun.requestId,
          runId: preparedRun.runId,
          sessionId: matchedSession.sessionMeta.id,
          sessionPath: matchedSession.path,
          taskCompleteTimestamp: completion.taskCompleteTimestamp,
        });
        return {
          matchedSession,
          reason: "completed",
          taskCompleteTimestamp: completion.taskCompleteTimestamp,
        };
      }
    }

    await sleep(1000);
  }

  log("INFO", "Solve wait hit timeout", {
    requestId: preparedRun.requestId,
    runId: preparedRun.runId,
    sessionId: matchedSession?.sessionMeta.id,
  });

  return {
    matchedSession,
    reason: "timeout",
  };
}

async function continuePostRunProcessing(
  preparedRun: PreparedRun,
  matchedSession: MatchedCodexSession | undefined,
  waitResult: WaitForSolveResult,
): Promise<void> {
  try {
    const tracedSession = await persistCodexTraceArtifacts(preparedRun, matchedSession);
    const leaderboardPromise = attributeRunToLeaderboardTask(
      preparedRun,
      waitResult.reason,
      waitResult.taskCompleteTimestamp,
    ).catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      log("ERROR", "Leaderboard attribution failed", {
        requestId: preparedRun.requestId,
        runId: preparedRun.runId,
        error: message,
      });
    });
    const submissionScorePromise = attributeRunToSubmissionScore(preparedRun, waitResult.taskCompleteTimestamp).catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      log("ERROR", "Submission score attribution failed", {
        requestId: preparedRun.requestId,
        runId: preparedRun.runId,
        error: message,
      });
    });
    await Promise.allSettled([leaderboardPromise, submissionScorePromise]);
    const scoreArtifacts = await resolveScoreAwareReflectionArtifacts(preparedRun);
    const reflectionResult = await maybeLaunchReflectionRun(preparedRun, tracedSession ?? matchedSession, scoreArtifacts);
    await writeFile(
      join(preparedRun.runDir, "codex-score-reflection.status.json"),
      JSON.stringify(
        {
          status: "skipped",
          reason: "unified_into_primary_reflection",
          reflection_summary_path: join(preparedRun.runDir, "codex-reflection.summary.md"),
          created_at: nowIso(),
        },
        null,
        2,
      ),
    );
    log("INFO", "Post-run processing completed", {
      requestId: preparedRun.requestId,
      runId: preparedRun.runId,
      tracedSessionId: (tracedSession ?? matchedSession)?.sessionMeta.id,
      reflectionStatus: reflectionResult.status,
      scoreArtifactsReady: Boolean(scoreArtifacts),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log("ERROR", "Post-run processing failed", {
      requestId: preparedRun.requestId,
      runId: preparedRun.runId,
      error: message,
    });
  }
}

async function attributeRunToLeaderboardTask(
  preparedRun: PreparedRun,
  completionReason: WaitForSolveResult["reason"],
  taskCompleteTimestamp: string | undefined,
): Promise<void> {
  const beforePath = join(preparedRun.runDir, "leaderboard.before.json");
  const beforeRaw = await readFile(beforePath, "utf8").catch(() => "");
  if (!beforeRaw) {
    await writeFile(
      join(preparedRun.runDir, "task-attribution.json"),
      JSON.stringify(
        {
          run_id: preparedRun.runId,
          request_id: preparedRun.requestId,
          completed_reason: completionReason,
          task_complete_timestamp: taskCompleteTimestamp,
          status: "skipped",
          reason: "missing_leaderboard_before_snapshot",
          leaderboard_url: leaderboardApiUrl,
          generated_at: nowIso(),
        },
        null,
        2,
      ),
    );
    return;
  }

  const parsedBefore = safeJsonParse(beforeRaw);
  if (
    !isRecord(parsedBefore) ||
    !Array.isArray(parsedBefore.entries) ||
    !parsedBefore.entries.every(isLeaderboardEntry)
  ) {
    await writeFile(
      join(preparedRun.runDir, "task-attribution.json"),
      JSON.stringify(
        {
          run_id: preparedRun.runId,
          request_id: preparedRun.requestId,
          completed_reason: completionReason,
          task_complete_timestamp: taskCompleteTimestamp,
          status: "skipped",
          reason: "invalid_leaderboard_before_snapshot",
          leaderboard_url: leaderboardApiUrl,
          generated_at: nowIso(),
        },
        null,
        2,
      ),
    );
    return;
  }

  const beforeSnapshot = parsedBefore as LeaderboardSnapshot;

  log("INFO", "Leaderboard attribution waiting before refetch", {
    requestId: preparedRun.requestId,
    runId: preparedRun.runId,
    delayMs: leaderboardAttributionDelayMs,
  });
  await sleep(leaderboardAttributionDelayMs);

  const deadline = Date.now() + leaderboardPollWindowMs;
  let afterSnapshot: LeaderboardSnapshot | undefined;
  let diff: LeaderboardDiffEntry[] = [];
  let inference = inferLeaderboardTask(diff);

  while (Date.now() <= deadline) {
    afterSnapshot = await persistLeaderboardSnapshot(preparedRun, "after");
    if (afterSnapshot) {
      diff = buildLeaderboardDiff(beforeSnapshot.entries, afterSnapshot.entries);
      inference = inferLeaderboardTask(diff);

      await writeFile(join(preparedRun.runDir, "leaderboard.diff.json"), JSON.stringify(diff, null, 2));

      if (inference.inference_status !== "no_change_detected") {
        break;
      }
    }

    if (Date.now() + leaderboardPollIntervalMs > deadline) {
      break;
    }

    await sleep(leaderboardPollIntervalMs);
  }

  const attribution = {
    run_id: preparedRun.runId,
    request_id: preparedRun.requestId,
    prompt_raw: preparedRun.solvePrompt,
    completion_reason: completionReason,
    task_complete_timestamp: taskCompleteTimestamp,
    leaderboard_url: leaderboardApiUrl,
    leaderboard_delay_ms: leaderboardAttributionDelayMs,
    poll_window_ms: leaderboardPollWindowMs,
    poll_interval_ms: leaderboardPollIntervalMs,
    before_captured_at: beforeSnapshot.captured_at,
    after_captured_at: afterSnapshot?.captured_at,
    diff_entry_count: diff.length,
    inference_status: inference.inference_status,
    tx_task_id: inference.tx_task_id,
    attempt_delta: inference.attempt_delta,
    generated_at: nowIso(),
  };

  await writeFile(join(preparedRun.runDir, "task-attribution.json"), JSON.stringify(attribution, null, 2));

  if (inference.tx_task_id) {
    await appendJsonl(join(dataRootDir, "prompt-task-labels.jsonl"), attribution);
  }

  log("INFO", "Leaderboard attribution finished", {
    requestId: preparedRun.requestId,
    runId: preparedRun.runId,
    inferenceStatus: inference.inference_status,
    txTaskId: inference.tx_task_id,
    attemptDelta: inference.attempt_delta,
  });
}

async function attributeRunToSubmissionScore(
  preparedRun: PreparedRun,
  taskCompleteTimestamp: string | undefined,
): Promise<void> {
  const submissionsAccessToken = await loadSubmissionsAccessToken();
  if (!submissionsAccessToken) {
    await writeFile(
      join(preparedRun.runDir, "submission-score.json"),
      JSON.stringify(
        {
          run_id: preparedRun.runId,
          request_id: preparedRun.requestId,
          status: "skipped",
          reason: "missing_submissions_access_token",
          submissions_url: submissionsApiUrl,
          generated_at: nowIso(),
        },
        null,
        2,
      ),
    );
    return;
  }

  const beforePath = join(preparedRun.runDir, "submissions.before.json");
  const beforeRaw = await readFile(beforePath, "utf8").catch(() => "");
  if (!beforeRaw) {
    await writeFile(
      join(preparedRun.runDir, "submission-score.json"),
      JSON.stringify(
        {
          run_id: preparedRun.runId,
          request_id: preparedRun.requestId,
          status: "skipped",
          reason: "missing_submissions_before_snapshot",
          submissions_url: submissionsApiUrl,
          generated_at: nowIso(),
        },
        null,
        2,
      ),
    );
    return;
  }

  const parsedBefore = safeJsonParse(beforeRaw);
  if (
    !isRecord(parsedBefore) ||
    !Array.isArray(parsedBefore.entries) ||
    !parsedBefore.entries.every(isSubmissionEntry)
  ) {
    await writeFile(
      join(preparedRun.runDir, "submission-score.json"),
      JSON.stringify(
        {
          run_id: preparedRun.runId,
          request_id: preparedRun.requestId,
          status: "skipped",
          reason: "invalid_submissions_before_snapshot",
          submissions_url: submissionsApiUrl,
          generated_at: nowIso(),
        },
        null,
        2,
      ),
    );
    return;
  }

  const beforeSnapshot = parsedBefore as SubmissionSnapshot;
  await sleep(leaderboardAttributionDelayMs);
  const deadline = Date.now() + submissionsPollWindowMs;
  let afterSnapshot: SubmissionSnapshot | undefined;
  let match = inferSubmissionMatch(
    beforeSnapshot.entries,
    [],
    preparedRun.createdAt,
    taskCompleteTimestamp,
  );

  while (Date.now() <= deadline) {
    afterSnapshot = await persistSubmissionSnapshot(preparedRun, "after");
    if (afterSnapshot) {
      match = inferSubmissionMatch(
        beforeSnapshot.entries,
        afterSnapshot.entries,
        preparedRun.createdAt,
        taskCompleteTimestamp,
      );

      if (match.inference_status === "ambiguous") {
        break;
      }

      if (match.submission && isSubmissionScored(match.submission)) {
        break;
      }
    }

    if (Date.now() + submissionsPollIntervalMs > deadline) {
      break;
    }

    await sleep(submissionsPollIntervalMs);
  }

  const correctness = computeSubmissionCorrectness(match.submission);
  const checks = match.submission?.feedback?.checks;
  const allChecksPassed =
    checks && checks.length > 0 ? checks.every((check) => /passed/i.test(check)) : undefined;

  await writeFile(
    join(preparedRun.runDir, "submission-score.json"),
    JSON.stringify(
      {
        run_id: preparedRun.runId,
        request_id: preparedRun.requestId,
        status:
          match.inference_status === "ambiguous"
            ? "ambiguous"
            : match.submission && isSubmissionScored(match.submission)
              ? "completed"
              : "timed_out",
        task_completed_at: taskCompleteTimestamp,
        submissions_url: submissionsApiUrl,
        submissions_delay_ms: leaderboardAttributionDelayMs,
        submissions_poll_window_ms: submissionsPollWindowMs,
        submissions_poll_interval_ms: submissionsPollIntervalMs,
        before_captured_at: beforeSnapshot.captured_at,
        after_captured_at: afterSnapshot?.captured_at,
        inference_status: match.inference_status,
        candidate_count: match.candidate_count,
        submission_id: match.submission?.id,
        submission_status: match.submission?.status,
        queued_at: match.submission?.queued_at,
        completed_at: match.submission?.completed_at,
        score_raw: match.submission?.score_raw,
        score_max: match.submission?.score_max,
        correctness,
        normalized_score: match.submission?.normalized_score,
        duration_ms: match.submission?.duration_ms,
        feedback_comment: match.submission?.feedback?.comment,
        feedback_checks: checks,
        all_checks_passed: allChecksPassed,
        generated_at: nowIso(),
      },
      null,
      2,
    ),
  );

  log("INFO", "Submission score attribution finished", {
    requestId: preparedRun.requestId,
    runId: preparedRun.runId,
    inferenceStatus: match.inference_status,
    submissionId: match.submission?.id,
    correctness,
    allChecksPassed,
  });
}

async function handleSolve(input: SolveRequest, requestId: string): Promise<SolveResponse> {
  const startedAtMs = Date.now();
  const preparedRun = await prepareRun(input, requestId);
  log("INFO", "Solve phase: run prepared", {
    requestId,
    runId: preparedRun.runId,
    storageMode: preparedRun.storageMode,
    runDir: preparedRun.runDir,
  });

  await launchTmuxRun(preparedRun);
  log("INFO", "Solve phase: tmux launched", {
    requestId,
    runId: preparedRun.runId,
    tmuxSession: tmuxSessionName,
    tmuxWindow: preparedRun.tmuxWindow,
  });

  const waitResult = await waitForSolveCompletion(preparedRun);
  log("INFO", "Solve phase: main agent finished", {
    requestId,
    runId: preparedRun.runId,
    completionReason: waitResult.reason,
    taskCompleteTimestamp: waitResult.taskCompleteTimestamp,
    elapsedMs: Date.now() - startedAtMs,
  });

  void continuePostRunProcessing(preparedRun, waitResult.matchedSession, waitResult);

  log("INFO", "Solve request completed", {
    requestId,
    runId: preparedRun.runId,
    storageMode: preparedRun.storageMode,
    runDir: preparedRun.runDir,
    tmuxSession: tmuxSessionName,
    tmuxWindow: preparedRun.tmuxWindow,
    completionReason: waitResult.reason,
    taskCompleteTimestamp: waitResult.taskCompleteTimestamp,
    elapsedMs: Date.now() - startedAtMs,
  });

  return {
    status: "completed",
  };
}

async function parseSolveRequest(request: Request): Promise<SolveRequest | ErrorResponse> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return { error: "content-type must include application/json" };
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { error: "request body must be valid json" };
  }

  if (!isSolveRequest(body)) {
    return { error: "request body does not match solve contract" };
  }

  return body;
}

Bun.serve({
  port,
  async fetch(request) {
    const url = new URL(request.url);
    const requestId = request.headers.get("x-request-id")?.trim() || randomUUID().slice(0, 8);
    const authorization = request.headers.get("authorization");
    const requestLogContext = {
      requestId,
      method: request.method,
      path: url.pathname,
      query: url.search || "",
      contentType: request.headers.get("content-type") ?? "",
      contentLength: request.headers.get("content-length") ?? "",
      host: request.headers.get("host") ?? "",
      userAgent: request.headers.get("user-agent") ?? "",
      forwardedFor:
        request.headers.get("x-forwarded-for") ??
        request.headers.get("cf-connecting-ip") ??
        request.headers.get("x-real-ip") ??
        "",
      forwardedProto: request.headers.get("x-forwarded-proto") ?? "",
      ...summarizeAuthorizationHeader(authorization),
    };

    log("INFO", "Incoming request", {
      ...requestLogContext,
    });

    if (requiredBearerToken) {
      if (authorization !== `Bearer ${requiredBearerToken}`) {
        let authFailureReason = "bearer_token_mismatch";
        if (!authorization) {
          authFailureReason = "missing_authorization_header";
        } else if (!authorization.startsWith("Bearer ")) {
          authFailureReason = "invalid_authorization_scheme";
        }

        log("WARN", "Rejected unauthorized request", {
          ...requestLogContext,
          authFailureReason,
          expectedAuthorizationScheme: "Bearer",
          expectedBearerTokenLength: requiredBearerToken.length,
        });
        return json(401, { error: "unauthorized" });
      }
    }

    if (request.method !== "POST" || url.pathname !== "/solve") {
      log("WARN", "Rejected unknown route", {
        ...requestLogContext,
        expectedMethod: "POST",
        expectedPath: "/solve",
      });
      return json(404, { error: "not found" });
    }

    const input = await parseSolveRequest(request);
    if ("error" in input) {
      log("WARN", "Rejected invalid solve request", {
        ...requestLogContext,
        error: input.error,
      });
      return json(400, input);
    }

    const nextActiveSolveRequests = incrementActiveSolveRequests();
    if (nextActiveSolveRequests > maxConcurrentSolveRequests) {
      const activeAfterDecrement = decrementActiveSolveRequests();
      log("WARN", "Rejected solve request because concurrency limit was reached", {
        ...requestLogContext,
        activeSolveRequests: activeAfterDecrement,
        maxConcurrentSolveRequests,
      });
      return json(429, { error: "too many active solve requests" });
    }

    log("INFO", "Accepted solve request", {
      ...requestLogContext,
      activeSolveRequests: nextActiveSolveRequests,
      storageMode: resolveStorageMode(Bun.env.TRIPLETEX_STORAGE_MODE),
      agentProvider,
      prompt: summarizePrompt(input.prompt),
      files: input.files?.length ?? 0,
      requestBaseUrl: input.tripletex_credentials.base_url,
      requestSessionToken: maskToken(input.tripletex_credentials.session_token),
    });

    try {
      const startedAtMs = Date.now();
      const result = await handleSolve(input, requestId);
      log("INFO", "Responding 200", {
        ...requestLogContext,
        activeSolveRequests: activeSolveRequests,
        responseStatus: result.status,
        elapsedMs: Date.now() - startedAtMs,
      });
      return json(200, result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "internal error";
      log("ERROR", "Solve request failed", {
        ...requestLogContext,
        activeSolveRequests: activeSolveRequests,
        error: message,
      });
      return json(500, { error: message });
    } finally {
      log("INFO", "Solve request closed", {
        ...requestLogContext,
        activeSolveRequests: decrementActiveSolveRequests(),
      });
    }
  },
});

log("INFO", "Tripletex orchestrator listening", {
  port,
  url: `http://localhost:${port}`,
  storageMode: resolveStorageMode(Bun.env.TRIPLETEX_STORAGE_MODE),
  agentProvider,
  claudeModel: agentProvider === "claude" ? claudeModel : undefined,
  claudeProxyBaseUrl: agentProvider === "claude" ? claudeProxyBaseUrl : undefined,
  hasApiKey: Boolean(requiredBearerToken),
  maxConcurrentSolveRequests,
});
