import { randomUUID } from "node:crypto";
import {
  appendFile,
  chmod,
  mkdir,
  readdir,
  readFile,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  loadSandboxCredentials,
  loadSubmissionsAccessToken,
} from "../sandbox-credentials";
import type { RuntimeStatus, TripletexCredentialCompanyId } from "./contracts";
import { stageAttachmentFiles } from "./attachment-files";

export type StorageMode = "testing" | "sandbox" | "production";

export interface TmuxSolveRequestFile {
  fileName: string;
  contentBase64: string;
  mediaType?: string;
  textContent?: string;
}

export interface TmuxSolveRequest {
  prompt: string;
  files: readonly TmuxSolveRequestFile[];
  tripletex_credentials: {
    base_url?: string;
    session_token?: string;
    company_id?: TripletexCredentialCompanyId;
    credential_source?: string;
  };
}

export interface EffectiveCredentials {
  baseUrl: string;
  companyId?: TripletexCredentialCompanyId;
  sessionToken: string;
  source: "request" | "sandbox";
}

export interface StoredSolveFile extends TmuxSolveRequestFile {
  path: string;
}

export interface PreparedTmuxRun {
  createdAt: string;
  codexPrompt: string;
  effectiveCredentials: EffectiveCredentials;
  files: readonly StoredSolveFile[];
  launchScriptPath: string;
  promptFilePath: string;
  requestId: string;
  requestFilePath: string;
  runDir: string;
  runId: string;
  scriptsDir: string;
  solvePrompt: string;
  storageMode: StorageMode;
  tmuxSessionName: string;
  tmuxWindow: string;
}

export interface CodexSessionMeta {
  cli_version?: string;
  cwd?: string;
  id: string;
  timestamp?: string;
}

export interface MatchedCodexSession {
  path: string;
  sessionMeta: CodexSessionMeta;
}

export interface WaitForSolveResult {
  matchedSession?: MatchedCodexSession;
  reason: "completed" | "timeout";
  taskCompleteTimestamp?: string;
}

export interface LeaderboardEntry {
  best_score: number;
  last_attempt_at?: string;
  rolling_scores: unknown[];
  total_attempts: number;
  tx_task_id: string;
}

export interface LeaderboardSnapshot {
  captured_at: string;
  entries: LeaderboardEntry[];
  run_id: string;
  source: string;
  url: string;
}

export interface LeaderboardDiffEntry {
  attempt_delta: number;
  best_score_after: number | undefined;
  best_score_before: number | undefined;
  last_attempt_after: string | undefined;
  last_attempt_before: string | undefined;
  total_attempts_after: number | undefined;
  total_attempts_before: number | undefined;
  tx_task_id: string;
}

export interface TaskAttributionInference {
  attempt_delta: number | undefined;
  inference_status:
    | "ambiguous"
    | "metadata_changed"
    | "no_change_detected"
    | "unique_attempt_delta";
  tx_task_id?: string;
}

export interface SubmissionFeedback {
  checks?: string[];
  comment?: string;
}

export interface SubmissionEntry {
  completed_at: string | null;
  duration_ms: number | null;
  feedback?: SubmissionFeedback;
  id: string;
  normalized_score: number | null;
  queued_at: string;
  score_max: number | null;
  score_raw: number | null;
  status: string;
}

export interface SubmissionSnapshot {
  captured_at: string;
  entries: SubmissionEntry[];
  run_id: string;
  source: string;
  url: string;
}

export interface SubmissionMatch {
  candidate_count: number;
  inference_status:
    | "ambiguous"
    | "existing_processing_still_running"
    | "existing_processing_transition"
    | "new_submission_completed"
    | "new_submission_processing"
    | "no_candidate";
  submission?: SubmissionEntry;
}

interface SubmissionPollingConfig {
  pollIntervalMs: number;
  pollWindowMs: number;
  queuedAtSkewMs: number;
  submissionsApiUrl: string;
}

export interface TmuxSolvePipelineResult {
  preparedRun: PreparedTmuxRun;
  runtimeStatus: RuntimeStatus;
  waitResult: WaitForSolveResult;
}

export interface TmuxSolveOptions {
  codexEnvironmentDir?: string;
  codexHomeDir?: string;
  createRunId?: (input: { now: Date; storageMode: StorageMode }) => string;
  dataRoot: string;
  env?: Record<string, string | undefined>;
  leaderboardFetch?: typeof fetch;
  logger?: (
    level: "INFO" | "WARN" | "ERROR",
    message: string,
    details?: Record<string, unknown>,
  ) => void;
  now?: () => Date;
  runCommand?: (cmd: readonly string[]) => Promise<string>;
  sandboxEnvPath?: string;
  sleep?: (ms: number) => Promise<void>;
  solveTimeoutMs?: number;
  storageMode?: StorageMode;
  submissionsFetch?: typeof fetch;
  tmuxSessionExists?: (sessionName: string) => Promise<boolean>;
  tmuxSessionName?: string;
}

export interface LaunchTmuxCommandInput {
  command: string;
  commandCwd: string;
  tmuxSessionName: string;
  tmuxWindow: string;
}

export const DEFAULT_TMUX_SESSION_NAME = "ainm-tripletex-sessions";
const DEFAULT_SOLVE_TIMEOUT_MS = 300_000;
const DEFAULT_LEADERBOARD_URL =
  "https://api.ainm.no/tripletex/leaderboard/f675e571-6864-4f33-beca-fab40636d516";
const DEFAULT_LEADERBOARD_DELAY_MS = 30_000;
const DEFAULT_LEADERBOARD_POLL_INTERVAL_MS = 15_000;
const DEFAULT_LEADERBOARD_POLL_WINDOW_MS = 120_000;
const DEFAULT_SUBMISSIONS_API_URL =
  "https://api.ainm.no/tripletex/my/submissions";
const DEFAULT_SUBMISSIONS_POLL_INTERVAL_MS = 10_000;
const DEFAULT_SUBMISSIONS_POLL_WINDOW_MS = 180_000;
const DEFAULT_SUBMISSIONS_QUEUE_SKEW_MS = 120_000;
const TIMEOUT_STATUS_FILENAME = "timeout.status.json";
const tripletex2Root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
export const DEFAULT_CODEX_ENVIRONMENT_DIR = path.join(
  tripletex2Root,
  "codex-environment",
);

let tmuxLaunchLock: Promise<void> = Promise.resolve();

export function resolveStorageMode(rawMode: string | undefined): StorageMode {
  switch (rawMode?.trim().toLowerCase()) {
    case "production":
    case "prod":
      return "production";
    case "sandbox":
      return "sandbox";
    default:
      return "testing";
  }
}

const SOLVER_PROMPT_PATH = path.resolve(
  import.meta.dir,
  "../../prompts/solver.md",
);

let solverPromptTemplateCache: string | undefined;

function loadSolverPromptTemplate(): string {
  if (!solverPromptTemplateCache) {
    const raw = require("node:fs").readFileSync(SOLVER_PROMPT_PATH, "utf8") as string;
    const separator = "\n---\n";
    const separatorIndex = raw.indexOf(separator);
    solverPromptTemplateCache =
      separatorIndex >= 0 ? raw.slice(separatorIndex + separator.length).trim() : raw.trim();
  }
  return solverPromptTemplateCache;
}

export function buildCodexPrompt(
  input: TmuxSolveRequest,
  files: readonly StoredSolveFile[],
  effectiveCredentials: EffectiveCredentials,
  scriptsDir: string,
): string {
  let prompt = loadSolverPromptTemplate()
    .replaceAll("{{SCRIPTS_DIR}}", scriptsDir)
    .replace("{{TASK_PROMPT}}", input.prompt)
    .replace("{{BASE_URL}}", effectiveCredentials.baseUrl)
    .replace("{{SESSION_TOKEN}}", effectiveCredentials.sessionToken);

  if (files.length > 0) {
    prompt += "\n\nAttachment paths:\n" + files.map((file) => file.path).join("\n");
  }

  return prompt;
}

export function buildLaunchScript(
  preparedRun: PreparedTmuxRun,
  options: Pick<TmuxSolveOptions, "codexEnvironmentDir"> = {},
): string {
  const codexEnvironmentDir =
    options.codexEnvironmentDir ?? DEFAULT_CODEX_ENVIRONMENT_DIR;

  return `#!/usr/bin/env zsh
set -u

cd ${shellQuote(codexEnvironmentDir)}

PROMPT_FILE=${shellQuote(preparedRun.promptFilePath)}

${buildTmuxCodexCommand('"$(cat "$PROMPT_FILE")"')}
status=$?

print
print "codex exited with status $status"
print "run id: ${preparedRun.runId}"
print "run dir: ${preparedRun.runDir}"
print "request file: ${preparedRun.requestFilePath}"
exec zsh -i
`;
}

export function buildTmuxCodexCommand(
  promptExpression: string,
  executable = "codex",
): string {
  return `${executable} -m gpt-5.4 -c model_reasoning_effort='"high"' -c service_tier='"fast"' --yolo --no-alt-screen ${promptExpression}`;
}

export async function prepareRun(
  input: TmuxSolveRequest,
  requestId: string,
  options: TmuxSolveOptions,
): Promise<PreparedTmuxRun> {
  const now = resolveNow(options.now);
  const storageMode =
    options.storageMode ?? resolveStorageMode((options.env ?? Bun.env).TRIPLETEX_STORAGE_MODE);
  const runId =
    options.createRunId?.({ now, storageMode }) ?? buildRunId(storageMode, now);
  const runDir = path.join(options.dataRoot, storageMode, "runs", runId);
  const scriptsDir = path.join(runDir, "scripts");
  const effectiveCredentials = await resolveEffectiveCredentials(input, storageMode, options);

  await mkdir(scriptsDir, { recursive: true });

  const storedFiles = await stageAttachmentFiles(runDir, input.files);

  const createdAt = now.toISOString();
  const requestFilePath = path.join(runDir, "request.json");
  const promptFilePath = path.join(runDir, "codex-prompt.txt");
  const launchScriptPath = path.join(runDir, "launch-codex.zsh");
  const tmuxSessionName = options.tmuxSessionName ?? DEFAULT_TMUX_SESSION_NAME;
  const tmuxWindow = runId.slice(0, 48);
  const preparedRun: PreparedTmuxRun = {
    createdAt,
    codexPrompt: buildCodexPrompt(input, storedFiles, effectiveCredentials, scriptsDir),
    effectiveCredentials,
    files: storedFiles,
    launchScriptPath,
    promptFilePath,
    requestFilePath,
    requestId,
    runDir,
    runId,
    scriptsDir,
    solvePrompt: input.prompt,
    storageMode,
    tmuxSessionName,
    tmuxWindow,
  };

  await writeFile(
    requestFilePath,
    JSON.stringify(
      {
        prompt: input.prompt,
        files: input.files.map((file) => ({
          filename: file.fileName,
          content_base64: file.contentBase64,
          ...(file.mediaType ? { mime_type: file.mediaType } : {}),
        })),
        tripletex_credentials: {
          ...(input.tripletex_credentials.base_url !== undefined
            ? { base_url: input.tripletex_credentials.base_url }
            : {}),
          ...(input.tripletex_credentials.session_token !== undefined
            ? { session_token: input.tripletex_credentials.session_token }
            : {}),
          ...(input.tripletex_credentials.company_id !== undefined
            ? { company_id: input.tripletex_credentials.company_id }
            : {}),
          ...(input.tripletex_credentials.credential_source !== undefined
            ? { credential_source: input.tripletex_credentials.credential_source }
            : {}),
        },
      },
      null,
      2,
    ),
    "utf8",
  );
  await writeFile(preparedRun.promptFilePath, preparedRun.codexPrompt, "utf8");
  const leaderboardBeforeSnapshot = await captureLeaderboardSnapshot(
    preparedRun,
    "before",
    options,
  );
  const submissionsBeforeSnapshot = await persistSubmissionSnapshot(
    preparedRun,
    "before",
    options,
  );
  await writeFile(
    path.join(runDir, "manifest.json"),
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
        credentials_source: effectiveCredentials.source,
        effective_base_url: effectiveCredentials.baseUrl,
        leaderboard_before_captured: Boolean(leaderboardBeforeSnapshot),
        submissions_before_captured: Boolean(submissionsBeforeSnapshot),
        attachments: storedFiles.map((file) => ({
          filename: file.fileName,
          ...(file.mediaType ? { mime_type: file.mediaType } : {}),
          path: file.path,
        })),
      },
      null,
      2,
    ),
    "utf8",
  );
  await writeFile(
    launchScriptPath,
    buildLaunchScript(preparedRun, {
      codexEnvironmentDir: options.codexEnvironmentDir,
    }),
    "utf8",
  );
  await chmod(launchScriptPath, 0o755);

  return preparedRun;
}

export async function launchTmuxRun(
  preparedRun: PreparedTmuxRun,
  options: TmuxSolveOptions,
): Promise<void> {
  const codexEnvironmentDir =
    options.codexEnvironmentDir ?? DEFAULT_CODEX_ENVIRONMENT_DIR;
  await launchTmuxCommand(
    {
      command: preparedRun.launchScriptPath,
      commandCwd: codexEnvironmentDir,
      tmuxSessionName: preparedRun.tmuxSessionName,
      tmuxWindow: preparedRun.tmuxWindow,
    },
    options,
  );
}

export async function launchTmuxCommand(
  input: LaunchTmuxCommandInput,
  options: Pick<TmuxSolveOptions, "runCommand" | "tmuxSessionExists"> = {},
): Promise<void> {
  const runCommand = options.runCommand ?? defaultRunCommand;
  const tmuxSessionExists =
    options.tmuxSessionExists ??
    ((sessionName) => defaultTmuxSessionExists(sessionName));

  await withTmuxLaunchLock(async () => {
    const sessionExisted = await tmuxSessionExists(input.tmuxSessionName);

    if (!sessionExisted) {
      await runCommand([
        "tmux",
        "new-session",
        "-d",
        "-s",
        input.tmuxSessionName,
        "-n",
        "__control__",
        "-c",
        input.commandCwd,
      ]);
      await runCommand([
        "tmux",
        "set-option",
        "-t",
        input.tmuxSessionName,
        "remain-on-exit",
        "on",
      ]);
    }

    await runCommand([
      "tmux",
      "new-window",
      "-d",
      "-t",
      input.tmuxSessionName,
      "-n",
      input.tmuxWindow,
      "-c",
      input.commandCwd,
      input.command,
    ]);
  });
}

export async function waitForSolveCompletion(
  preparedRun: PreparedTmuxRun,
  options: Pick<
    TmuxSolveOptions,
    | "codexEnvironmentDir"
    | "codexHomeDir"
    | "env"
    | "logger"
    | "now"
    | "runCommand"
    | "sleep"
    | "solveTimeoutMs"
  > = {},
): Promise<WaitForSolveResult> {
  const solveTimeoutMs = resolveSolveTimeoutMs(options);
  const deadline = Date.now() + solveTimeoutMs;
  const sleep = options.sleep ?? defaultSleep;
  let matchedSession: MatchedCodexSession | undefined;

  while (Date.now() < deadline) {
    if (!matchedSession) {
      matchedSession = await findMatchingCodexSession(
        preparedRun.codexPrompt,
        preparedRun.createdAt,
        options,
      );
    }

    if (matchedSession) {
      const completion = await readInteractiveTaskCompletion(matchedSession);
      if (completion) {
        return {
          matchedSession,
          reason: "completed",
          taskCompleteTimestamp: completion.taskCompleteTimestamp,
        };
      }
    }

    await sleep(1000);
  }

  await handleSolveTimeout(preparedRun, matchedSession, {
    ...options,
    solveTimeoutMs,
  });

  return {
    matchedSession,
    reason: "timeout",
  };
}

export async function findMatchingCodexSession(
  prompt: string,
  createdAt: string,
  options: Pick<TmuxSolveOptions, "codexEnvironmentDir" | "codexHomeDir"> = {},
): Promise<MatchedCodexSession | undefined> {
  const createdAtMs = Date.parse(createdAt);
  const codexEnvironmentDir =
    options.codexEnvironmentDir ?? DEFAULT_CODEX_ENVIRONMENT_DIR;
  const candidates = await collectCodexSessionFiles(resolveCodexHomeDir(options));
  const ranked = await Promise.all(
    candidates.map(async (candidatePath) => {
      const fileStat = await stat(candidatePath).catch(() => undefined);
      return {
        mtimeMs: fileStat?.mtimeMs ?? 0,
        path: candidatePath,
      };
    }),
  );

  ranked.sort((left, right) => right.mtimeMs - left.mtimeMs);

  for (const candidate of ranked.slice(0, 80)) {
    const raw = await readFile(candidate.path, "utf8").catch(() => "");
    if (!raw) {
      continue;
    }

    const lines = raw.split("\n").filter(Boolean);
    if (lines.length === 0) {
      continue;
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
      timestamp:
        typeof first.payload.timestamp === "string"
          ? first.payload.timestamp
          : undefined,
      cwd:
        typeof first.payload.cwd === "string"
          ? first.payload.cwd
          : undefined,
      cli_version:
        typeof first.payload.cli_version === "string"
          ? first.payload.cli_version
          : undefined,
    };

    if (sessionMeta.cwd !== codexEnvironmentDir) {
      continue;
    }

    if (
      sessionMeta.timestamp &&
      Math.abs(Date.parse(sessionMeta.timestamp) - createdAtMs) >
        15 * 60 * 1000
    ) {
      continue;
    }

    const userMessageLine = lines.find((line) =>
      line.includes('"type":"user_message"'),
    );
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

export async function readInteractiveTaskCompletion(
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

export async function fetchLeaderboard(
  preparedRun: PreparedTmuxRun,
  source: string,
  options: Pick<TmuxSolveOptions, "env" | "leaderboardFetch" | "now"> = {},
): Promise<LeaderboardSnapshot> {
  const config = resolveLeaderboardPollingConfig(options.env);
  const response = await (options.leaderboardFetch ?? fetch)(
    config.leaderboardUrl,
    {
      signal: AbortSignal.timeout(30_000),
    },
  );

  if (!response.ok) {
    throw new Error(
      `leaderboard fetch failed with ${response.status} ${response.statusText}`,
    );
  }

  const body = await response.json();
  if (!Array.isArray(body) || !body.every(isLeaderboardEntry)) {
    throw new Error("leaderboard response did not match expected schema");
  }

  return {
    captured_at: resolveNow(options.now).toISOString(),
    entries: body,
    run_id: preparedRun.runId,
    source,
    url: config.leaderboardUrl,
  };
}

export async function captureLeaderboardSnapshot(
  preparedRun: PreparedTmuxRun,
  source: "before" | "after",
  options: Pick<
    TmuxSolveOptions,
    "dataRoot" | "env" | "leaderboardFetch" | "now"
  >,
): Promise<LeaderboardSnapshot | undefined> {
  const config = resolveLeaderboardPollingConfig(options.env);

  try {
    const snapshot = await fetchLeaderboard(preparedRun, source, options);
    await writeJsonFile(
      path.join(preparedRun.runDir, `leaderboard.${source}.json`),
      snapshot,
    );
    await appendJsonl(path.join(options.dataRoot, "leaderboard-history.jsonl"), snapshot);
    return snapshot;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await writeJsonFile(
      path.join(preparedRun.runDir, `leaderboard.${source}.error.json`),
      {
        captured_at: resolveNow(options.now).toISOString(),
        error: message,
        run_id: preparedRun.runId,
        source,
        url: config.leaderboardUrl,
      },
    );
    return undefined;
  }
}

export function diffLeaderboardSnapshots(
  beforeSnapshot: Pick<LeaderboardSnapshot, "entries">,
  afterSnapshot: Pick<LeaderboardSnapshot, "entries">,
): LeaderboardDiffEntry[] {
  const beforeByTaskId = new Map(
    beforeSnapshot.entries.map((entry) => [entry.tx_task_id, entry]),
  );
  const afterByTaskId = new Map(
    afterSnapshot.entries.map((entry) => [entry.tx_task_id, entry]),
  );
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
        attempt_delta: attemptDelta,
        best_score_after: bestScoreAfter,
        best_score_before: bestScoreBefore,
        last_attempt_after: lastAttemptAfter,
        last_attempt_before: lastAttemptBefore,
        total_attempts_after: after?.total_attempts,
        total_attempts_before: before?.total_attempts,
        tx_task_id: txTaskId,
      });
    }
  }

  return diff;
}

export function inferTaskAttribution(
  diff: readonly LeaderboardDiffEntry[],
): TaskAttributionInference {
  const attemptCandidates = diff.filter((entry) => entry.attempt_delta > 0);
  if (attemptCandidates.length === 1) {
    return {
      attempt_delta: attemptCandidates[0].attempt_delta,
      inference_status: "unique_attempt_delta",
      tx_task_id: attemptCandidates[0].tx_task_id,
    };
  }

  if (attemptCandidates.length > 1) {
    return {
      attempt_delta: undefined,
      inference_status: "ambiguous",
    };
  }

  if (diff.length === 1) {
    return {
      attempt_delta: diff[0].attempt_delta,
      inference_status: "metadata_changed",
      tx_task_id: diff[0].tx_task_id,
    };
  }

  return {
    attempt_delta: undefined,
    inference_status: "no_change_detected",
  };
}

export async function attributeRunToLeaderboardTask(
  preparedRun: PreparedTmuxRun,
  completionReason: WaitForSolveResult["reason"],
  taskCompleteTimestamp: string | undefined,
  options: Pick<
    TmuxSolveOptions,
    | "dataRoot"
    | "env"
    | "leaderboardFetch"
    | "logger"
    | "now"
    | "sleep"
  >,
): Promise<void> {
  const config = resolveLeaderboardPollingConfig(options.env);
  const sleep = options.sleep ?? defaultSleep;
  const beforePath = path.join(preparedRun.runDir, "leaderboard.before.json");
  const beforeRaw = await readFile(beforePath, "utf8").catch(() => "");
  if (!beforeRaw) {
    await writeJsonFile(path.join(preparedRun.runDir, "task-attribution.json"), {
      completed_reason: completionReason,
      generated_at: resolveNow(options.now).toISOString(),
      leaderboard_url: config.leaderboardUrl,
      reason: "missing_leaderboard_before_snapshot",
      request_id: preparedRun.requestId,
      run_id: preparedRun.runId,
      status: "skipped",
      task_complete_timestamp: taskCompleteTimestamp,
    });
    return;
  }

  const parsedBefore = safeJsonParse(beforeRaw);
  if (
    !isRecord(parsedBefore) ||
    !Array.isArray(parsedBefore.entries) ||
    !parsedBefore.entries.every(isLeaderboardEntry)
  ) {
    await writeJsonFile(path.join(preparedRun.runDir, "task-attribution.json"), {
      completed_reason: completionReason,
      generated_at: resolveNow(options.now).toISOString(),
      leaderboard_url: config.leaderboardUrl,
      reason: "invalid_leaderboard_before_snapshot",
      request_id: preparedRun.requestId,
      run_id: preparedRun.runId,
      status: "skipped",
      task_complete_timestamp: taskCompleteTimestamp,
    });
    return;
  }

  options.logger?.("INFO", "Leaderboard attribution waiting before refetch.", {
    delayMs: config.delayMs,
    requestId: preparedRun.requestId,
    runId: preparedRun.runId,
  });
  await sleep(config.delayMs);

  const beforeSnapshot = parsedBefore as LeaderboardSnapshot;
  const deadline = Date.now() + config.pollWindowMs;
  let afterSnapshot: LeaderboardSnapshot | undefined;
  let diff: LeaderboardDiffEntry[] = [];
  let inference = inferTaskAttribution(diff);

  while (Date.now() <= deadline) {
    afterSnapshot = await captureLeaderboardSnapshot(preparedRun, "after", options);
    if (afterSnapshot) {
      diff = diffLeaderboardSnapshots(beforeSnapshot, afterSnapshot);
      inference = inferTaskAttribution(diff);
      await writeJsonFile(path.join(preparedRun.runDir, "leaderboard.diff.json"), diff);

      if (inference.inference_status !== "no_change_detected") {
        break;
      }
    }

    if (Date.now() + config.pollIntervalMs > deadline) {
      break;
    }

    await sleep(config.pollIntervalMs);
  }

  const attribution = {
    attempt_delta: inference.attempt_delta,
    after_captured_at: afterSnapshot?.captured_at,
    before_captured_at: beforeSnapshot.captured_at,
    completed_reason: completionReason,
    diff_entry_count: diff.length,
    generated_at: resolveNow(options.now).toISOString(),
    inference_status: inference.inference_status,
    leaderboard_delay_ms: config.delayMs,
    leaderboard_url: config.leaderboardUrl,
    poll_interval_ms: config.pollIntervalMs,
    poll_window_ms: config.pollWindowMs,
    prompt_raw: preparedRun.solvePrompt,
    request_id: preparedRun.requestId,
    run_id: preparedRun.runId,
    task_complete_timestamp: taskCompleteTimestamp,
    tx_task_id: inference.tx_task_id,
  };
  await writeJsonFile(path.join(preparedRun.runDir, "task-attribution.json"), attribution);

  if (inference.tx_task_id) {
    await appendJsonl(path.join(options.dataRoot, "prompt-task-labels.jsonl"), attribution);
  }

  options.logger?.("INFO", "Completed leaderboard attribution polling.", {
    attemptDelta: inference.attempt_delta,
    inferenceStatus: inference.inference_status,
    requestId: preparedRun.requestId,
    runId: preparedRun.runId,
    txTaskId: inference.tx_task_id,
  });
}

export async function continuePostRunProcessing(
  result: TmuxSolvePipelineResult,
  options: Pick<
    TmuxSolveOptions,
    | "dataRoot"
    | "env"
    | "leaderboardFetch"
    | "logger"
    | "now"
    | "sandboxEnvPath"
    | "sleep"
    | "submissionsFetch"
  >,
): Promise<void> {
  try {
    await pollAndMatchSubmission(
      result.preparedRun,
      result.waitResult,
      options,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    options.logger?.("ERROR", "Submission score polling failed.", {
      error: message,
      requestId: result.preparedRun.requestId,
      runId: result.preparedRun.runId,
    });
  }

  try {
    await attributeRunToLeaderboardTask(
      result.preparedRun,
      result.waitResult.reason,
      result.waitResult.taskCompleteTimestamp,
      options,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    options.logger?.("ERROR", "Leaderboard attribution failed.", {
      error: message,
      requestId: result.preparedRun.requestId,
      runId: result.preparedRun.runId,
    });
  }
}

export async function runTmuxSolvePipeline(
  input: TmuxSolveRequest,
  requestId: string,
  options: TmuxSolveOptions,
): Promise<TmuxSolvePipelineResult> {
  const preparedRun = await prepareRun(input, requestId, options);
  await launchTmuxRun(preparedRun, options);
  const waitResult = await waitForSolveCompletion(preparedRun, options);
  const runtimeStatus: RuntimeStatus =
    waitResult.reason === "completed" ? "completed" : "timeout";

  await writeFile(
    path.join(preparedRun.runDir, "result.json"),
    `${JSON.stringify(
      {
        completedAt: resolveNow(options.now).toISOString(),
        requestId: preparedRun.requestId,
        runId: preparedRun.runId,
        runtimeStatus,
        waitReason: waitResult.reason,
        taskCompleteTimestamp: waitResult.taskCompleteTimestamp,
        matchedSession: waitResult.matchedSession
          ? {
              sessionId: waitResult.matchedSession.sessionMeta.id,
              sessionPath: waitResult.matchedSession.path,
            }
          : undefined,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  return {
    preparedRun,
    runtimeStatus,
    waitResult,
  };
}

export async function fetchSubmissions(
  preparedRun: PreparedTmuxRun,
  source: string,
  options: Pick<TmuxSolveOptions, "env" | "sandboxEnvPath" | "submissionsFetch"> = {},
): Promise<SubmissionSnapshot | undefined> {
  const submissionsAccessToken = await loadSubmissionsAccessToken({
    env: options.env,
    sandboxEnvPath: options.sandboxEnvPath,
  });
  if (!submissionsAccessToken) {
    return undefined;
  }

  const config = resolveSubmissionPollingConfig(options.env);
  const response = await (options.submissionsFetch ?? fetch)(config.submissionsApiUrl, {
    headers: {
      accept: "application/json",
      cookie: `access_token=${submissionsAccessToken}`,
    },
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new Error(
      `submissions fetch failed with ${response.status} ${response.statusText}`,
    );
  }

  const body = await response.json();
  if (!Array.isArray(body) || !body.every(isSubmissionEntry)) {
    throw new Error("submissions response did not match expected schema");
  }

  return {
    captured_at: resolveNow().toISOString(),
    entries: body,
    run_id: preparedRun.runId,
    source,
    url: config.submissionsApiUrl,
  };
}

export function inferSubmissionMatch(
  beforeEntries: SubmissionEntry[],
  afterEntries: SubmissionEntry[],
  runCreatedAt: string,
  solveCompletedAt: string | undefined,
  queuedAtSkewMs: number = DEFAULT_SUBMISSIONS_QUEUE_SKEW_MS,
): SubmissionMatch {
  const beforeById = new Map(beforeEntries.map((entry) => [entry.id, entry]));
  const runStartMs = parseIsoTimestampMs(runCreatedAt) ?? 0;
  const windowStartMs = runStartMs - queuedAtSkewMs;
  const windowEndMs =
    (parseIsoTimestampMs(solveCompletedAt) ?? Number.POSITIVE_INFINITY) +
    queuedAtSkewMs;
  const recentAfterEntries = afterEntries.filter((entry) => {
    const queuedAtMs = parseIsoTimestampMs(entry.queued_at);
    return (
      queuedAtMs !== undefined &&
      queuedAtMs >= windowStartMs &&
      queuedAtMs <= windowEndMs
    );
  });

  const transitionedExisting = recentAfterEntries.filter((entry) => {
    const before = beforeById.get(entry.id);
    return before && !isSubmissionScored(before) && isSubmissionScored(entry);
  });
  if (transitionedExisting.length === 1) {
    return {
      candidate_count: 1,
      inference_status: "existing_processing_transition",
      submission: transitionedExisting[0],
    };
  }
  if (transitionedExisting.length > 1) {
    return {
      candidate_count: transitionedExisting.length,
      inference_status: "ambiguous",
    };
  }

  const trackedExisting = recentAfterEntries.filter((entry) => {
    const before = beforeById.get(entry.id);
    return before && !isSubmissionScored(before);
  });
  if (trackedExisting.length === 1) {
    return {
      candidate_count: 1,
      inference_status: isSubmissionScored(trackedExisting[0])
        ? "existing_processing_transition"
        : "existing_processing_still_running",
      submission: trackedExisting[0],
    };
  }
  if (trackedExisting.length > 1) {
    return {
      candidate_count: trackedExisting.length,
      inference_status: "ambiguous",
    };
  }

  const newRecentEntries = recentAfterEntries.filter(
    (entry) => !beforeById.has(entry.id),
  );
  if (newRecentEntries.length === 1) {
    return {
      candidate_count: 1,
      inference_status: isSubmissionScored(newRecentEntries[0])
        ? "new_submission_completed"
        : "new_submission_processing",
      submission: newRecentEntries[0],
    };
  }
  if (newRecentEntries.length > 1) {
    return {
      candidate_count: newRecentEntries.length,
      inference_status: "ambiguous",
    };
  }

  return {
    candidate_count: 0,
    inference_status: "no_candidate",
  };
}

export async function pollAndMatchSubmission(
  preparedRun: PreparedTmuxRun,
  waitResult: WaitForSolveResult,
  options: Pick<
    TmuxSolveOptions,
    "env" | "logger" | "sandboxEnvPath" | "sleep" | "submissionsFetch"
  > = {},
): Promise<void> {
  const config = resolveSubmissionPollingConfig(options.env);
  const submissionsAccessToken = await loadSubmissionsAccessToken({
    env: options.env,
    sandboxEnvPath: options.sandboxEnvPath,
  });
  if (!submissionsAccessToken) {
    await writeSubmissionScore(preparedRun, {
      generated_at: resolveNow().toISOString(),
      reason: "missing_submissions_access_token",
      request_id: preparedRun.requestId,
      run_id: preparedRun.runId,
      solve_completed_at: waitResult.taskCompleteTimestamp,
      status: "skipped",
      submissions_poll_interval_ms: config.pollIntervalMs,
      submissions_poll_window_ms: config.pollWindowMs,
      submissions_queue_skew_ms: config.queuedAtSkewMs,
      submissions_url: config.submissionsApiUrl,
    });
    return;
  }

  if (waitResult.reason !== "completed") {
    await writeSubmissionScore(preparedRun, {
      generated_at: resolveNow().toISOString(),
      reason: "solve_not_completed",
      request_id: preparedRun.requestId,
      run_id: preparedRun.runId,
      runtime_status: waitResult.reason,
      status: "skipped",
      submissions_poll_interval_ms: config.pollIntervalMs,
      submissions_poll_window_ms: config.pollWindowMs,
      submissions_queue_skew_ms: config.queuedAtSkewMs,
      submissions_url: config.submissionsApiUrl,
    });
    return;
  }

  if (!waitResult.taskCompleteTimestamp) {
    await writeSubmissionScore(preparedRun, {
      generated_at: resolveNow().toISOString(),
      reason: "missing_task_complete_timestamp",
      request_id: preparedRun.requestId,
      run_id: preparedRun.runId,
      status: "skipped",
      submissions_poll_interval_ms: config.pollIntervalMs,
      submissions_poll_window_ms: config.pollWindowMs,
      submissions_queue_skew_ms: config.queuedAtSkewMs,
      submissions_url: config.submissionsApiUrl,
    });
    return;
  }

  const beforePath = path.join(preparedRun.runDir, "submissions.before.json");
  const beforeRaw = await readFile(beforePath, "utf8").catch(() => "");
  if (!beforeRaw) {
    await writeSubmissionScore(preparedRun, {
      generated_at: resolveNow().toISOString(),
      reason: "missing_submissions_before_snapshot",
      request_id: preparedRun.requestId,
      run_id: preparedRun.runId,
      solve_completed_at: waitResult.taskCompleteTimestamp,
      status: "skipped",
      submissions_poll_interval_ms: config.pollIntervalMs,
      submissions_poll_window_ms: config.pollWindowMs,
      submissions_queue_skew_ms: config.queuedAtSkewMs,
      submissions_url: config.submissionsApiUrl,
    });
    return;
  }

  const parsedBefore = safeJsonParse(beforeRaw);
  if (
    !isRecord(parsedBefore) ||
    !Array.isArray(parsedBefore.entries) ||
    !parsedBefore.entries.every(isSubmissionEntry)
  ) {
    await writeSubmissionScore(preparedRun, {
      generated_at: resolveNow().toISOString(),
      reason: "invalid_submissions_before_snapshot",
      request_id: preparedRun.requestId,
      run_id: preparedRun.runId,
      solve_completed_at: waitResult.taskCompleteTimestamp,
      status: "skipped",
      submissions_poll_interval_ms: config.pollIntervalMs,
      submissions_poll_window_ms: config.pollWindowMs,
      submissions_queue_skew_ms: config.queuedAtSkewMs,
      submissions_url: config.submissionsApiUrl,
    });
    return;
  }

  const beforeSnapshot = parsedBefore as SubmissionSnapshot;
  const sleep = options.sleep ?? defaultSleep;
  const deadline = Date.now() + config.pollWindowMs;
  let afterSnapshot: SubmissionSnapshot | undefined;
  let match = inferSubmissionMatch(
    beforeSnapshot.entries,
    [],
    preparedRun.createdAt,
    waitResult.taskCompleteTimestamp,
    config.queuedAtSkewMs,
  );

  while (Date.now() <= deadline) {
    afterSnapshot = await persistSubmissionSnapshot(preparedRun, "after", options);
    if (afterSnapshot) {
      match = inferSubmissionMatch(
        beforeSnapshot.entries,
        afterSnapshot.entries,
        preparedRun.createdAt,
        waitResult.taskCompleteTimestamp,
        config.queuedAtSkewMs,
      );

      if (match.inference_status === "ambiguous") {
        break;
      }

      if (match.submission && isSubmissionScored(match.submission)) {
        break;
      }
    }

    if (Date.now() + config.pollIntervalMs > deadline) {
      break;
    }

    await sleep(config.pollIntervalMs);
  }

  const correctness = computeSubmissionCorrectness(match.submission);
  const checks = match.submission?.feedback?.checks;
  const allChecksPassed =
    checks && checks.length > 0
      ? checks.every((check) => /passed/i.test(check))
      : undefined;

  await writeSubmissionScore(preparedRun, {
    after_captured_at: afterSnapshot?.captured_at,
    all_checks_passed: allChecksPassed,
    before_captured_at: beforeSnapshot.captured_at,
    candidate_count: match.candidate_count,
    completed_at: match.submission?.completed_at,
    correctness,
    duration_ms: match.submission?.duration_ms,
    feedback_checks: checks,
    feedback_comment: match.submission?.feedback?.comment,
    generated_at: resolveNow().toISOString(),
    inference_status: match.inference_status,
    normalized_score: match.submission?.normalized_score,
    queued_at: match.submission?.queued_at,
    request_id: preparedRun.requestId,
    run_id: preparedRun.runId,
    score_max: match.submission?.score_max,
    score_raw: match.submission?.score_raw,
    solve_completed_at: waitResult.taskCompleteTimestamp,
    status:
      match.inference_status === "ambiguous"
        ? "ambiguous"
        : match.submission && isSubmissionScored(match.submission)
          ? "completed"
          : "timed_out",
    submission_id: match.submission?.id,
    submission_status: match.submission?.status,
    submissions_poll_interval_ms: config.pollIntervalMs,
    submissions_poll_window_ms: config.pollWindowMs,
    submissions_queue_skew_ms: config.queuedAtSkewMs,
    submissions_url: config.submissionsApiUrl,
  });

  options.logger?.("INFO", "Completed submission score polling.", {
    correctness,
    inferenceStatus: match.inference_status,
    requestId: preparedRun.requestId,
    runId: preparedRun.runId,
    submissionId: match.submission?.id,
  });
}

async function resolveEffectiveCredentials(
  input: TmuxSolveRequest,
  storageMode: StorageMode,
  options: Pick<TmuxSolveOptions, "env" | "sandboxEnvPath">,
): Promise<EffectiveCredentials> {
  if (storageMode === "testing") {
    const sandboxCredentials = await loadSandboxCredentials({
      env: options.env,
      sandboxEnvPath: options.sandboxEnvPath,
    });
    if (sandboxCredentials) {
      return {
        baseUrl: sandboxCredentials.base_url,
        sessionToken: sandboxCredentials.session_token,
        source: "sandbox",
      };
    }
  }

  return {
    baseUrl: requireConfiguredCredentialString(
      input.tripletex_credentials.base_url,
      'solve request field "tripletex_credentials.base_url"',
    ),
    companyId: input.tripletex_credentials.company_id,
    sessionToken: requireConfiguredCredentialString(
      input.tripletex_credentials.session_token,
      'solve request field "tripletex_credentials.session_token"',
    ),
    source: "request",
  };
}

function buildRunId(storageMode: StorageMode, now: Date): string {
  const timestamp = now.toISOString().replace(/[:.]/g, "").replace("T", "-");
  const modePrefix = storageMode === "production" ? "prod" : "test";
  return `${modePrefix}-${timestamp}-${randomUUID().slice(0, 8)}`;
}

async function collectCodexSessionFiles(codexHomeDir: string): Promise<string[]> {
  const sessionsRoot = path.join(codexHomeDir, "sessions");
  const years = await readdir(sessionsRoot, { withFileTypes: true }).catch(
    () => [],
  );
  const files: string[] = [];

  for (const yearEntry of years) {
    if (!yearEntry.isDirectory()) {
      continue;
    }

    const yearPath = path.join(sessionsRoot, yearEntry.name);
    const months = await readdir(yearPath, { withFileTypes: true }).catch(
      () => [],
    );
    for (const monthEntry of months) {
      if (!monthEntry.isDirectory()) {
        continue;
      }

      const monthPath = path.join(yearPath, monthEntry.name);
      const days = await readdir(monthPath, { withFileTypes: true }).catch(
        () => [],
      );
      for (const dayEntry of days) {
        if (!dayEntry.isDirectory()) {
          continue;
        }

        const dayPath = path.join(monthPath, dayEntry.name);
        const dayFiles = await readdir(dayPath, { withFileTypes: true }).catch(
          () => [],
        );
        for (const fileEntry of dayFiles) {
          if (fileEntry.isFile() && fileEntry.name.endsWith(".jsonl")) {
            files.push(path.join(dayPath, fileEntry.name));
          }
        }
      }
    }
  }

  return files;
}

async function defaultRunCommand(cmd: readonly string[]): Promise<string> {
  const subprocess = Bun.spawn({
    cmd: [...cmd],
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

async function handleSolveTimeout(
  preparedRun: PreparedTmuxRun,
  matchedSession: MatchedCodexSession | undefined,
  options: Pick<
    TmuxSolveOptions,
    "logger" | "now" | "runCommand" | "solveTimeoutMs"
  >,
): Promise<void> {
  const log = options.logger;
  const runCommand = options.runCommand ?? defaultRunCommand;
  const tmuxTarget = `${preparedRun.tmuxSessionName}:${preparedRun.tmuxWindow}`;
  const timedOutAt = resolveNow(options.now).toISOString();
  let killWindowSucceeded = false;
  let killWindowError: string | undefined;

  try {
    await killTmuxWindow(tmuxTarget, { runCommand });
    killWindowSucceeded = true;
  } catch (error) {
    killWindowError = error instanceof Error ? error.message : String(error);
  }

  await writeFile(
    path.join(preparedRun.runDir, TIMEOUT_STATUS_FILENAME),
    JSON.stringify(
      {
        status: "timeout",
        timed_out_at: timedOutAt,
        request_id: preparedRun.requestId,
        run_id: preparedRun.runId,
        run_dir: preparedRun.runDir,
        tmux_session: preparedRun.tmuxSessionName,
        tmux_window: preparedRun.tmuxWindow,
        tmux_target: tmuxTarget,
        solve_timeout_ms: options.solveTimeoutMs ?? DEFAULT_SOLVE_TIMEOUT_MS,
        matched_session_id: matchedSession?.sessionMeta.id,
        matched_session_path: matchedSession?.path,
        kill_window_attempted: true,
        kill_window_succeeded: killWindowSucceeded,
        ...(killWindowError ? { kill_window_error: killWindowError } : {}),
      },
      null,
      2,
    ),
    "utf8",
  );

  log?.("WARN", "Tmux solve timed out.", {
    requestId: preparedRun.requestId,
    runId: preparedRun.runId,
    tmuxTarget,
    solveTimeoutMs: options.solveTimeoutMs ?? DEFAULT_SOLVE_TIMEOUT_MS,
    matchedSessionId: matchedSession?.sessionMeta.id,
    killWindowSucceeded,
    ...(killWindowError ? { killWindowError } : {}),
  });
}

export async function killTmuxWindow(
  tmuxTarget: string,
  options: Pick<TmuxSolveOptions, "runCommand"> = {},
): Promise<void> {
  const runCommand = options.runCommand ?? defaultRunCommand;
  await runCommand(["tmux", "kill-window", "-t", tmuxTarget]);
}

async function defaultTmuxSessionExists(sessionName: string): Promise<boolean> {
  const subprocess = Bun.spawn({
    cmd: ["tmux", "has-session", "-t", sessionName],
    stderr: "pipe",
    stdout: "pipe",
  });

  return (await subprocess.exited) === 0;
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

function resolveCodexHomeDir(
  options: Pick<TmuxSolveOptions, "codexHomeDir" | "env">,
): string {
  if (options.codexHomeDir) {
    return path.resolve(options.codexHomeDir);
  }

  const env = options.env ?? Bun.env;
  if (env.CODEX_HOME) {
    return path.resolve(env.CODEX_HOME);
  }

  if (env.HOME) {
    return path.join(env.HOME, ".codex");
  }

  return path.resolve(".codex");
}

function resolveSolveTimeoutMs(
  options: Pick<TmuxSolveOptions, "env" | "solveTimeoutMs">,
): number {
  if (options.solveTimeoutMs !== undefined) {
    return options.solveTimeoutMs;
  }

  const envValue = (options.env ?? Bun.env).TRIPLETEX_SOLVE_TIMEOUT_MS?.trim();
  if (!envValue) {
    return DEFAULT_SOLVE_TIMEOUT_MS;
  }

  const parsed = Number(envValue);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return DEFAULT_SOLVE_TIMEOUT_MS;
  }

  return parsed;
}

function requireConfiguredCredentialString(
  value: string | undefined,
  label: string,
): string {
  const normalized = value?.trim();
  if (!normalized) {
    throw new Error(`Expected ${label} to be a non-empty string.`);
  }

  if (isPlaceholderCredentialValue(normalized)) {
    throw new Error(
      `Expected ${label} to be configured, not placeholder "replace-me".`,
    );
  }

  return normalized;
}

function isPlaceholderCredentialValue(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === "replace-me";
}

function resolveNow(now?: () => Date): Date {
  return now ? now() : new Date();
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

async function appendJsonl(filePath: string, value: unknown): Promise<void> {
  await appendFile(filePath, `${JSON.stringify(value)}\n`);
}

async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function resolveLeaderboardPollingConfig(
  env: Record<string, string | undefined> | undefined,
): {
  delayMs: number;
  leaderboardUrl: string;
  pollIntervalMs: number;
  pollWindowMs: number;
} {
  return {
    delayMs: readNumberEnv(
      env?.TRIPLETEX_LEADERBOARD_DELAY_MS,
      DEFAULT_LEADERBOARD_DELAY_MS,
    ),
    leaderboardUrl:
      env?.TRIPLETEX_LEADERBOARD_URL?.trim() || DEFAULT_LEADERBOARD_URL,
    pollIntervalMs: readNumberEnv(
      env?.TRIPLETEX_LEADERBOARD_POLL_INTERVAL_MS,
      DEFAULT_LEADERBOARD_POLL_INTERVAL_MS,
    ),
    pollWindowMs: readNumberEnv(
      env?.TRIPLETEX_LEADERBOARD_POLL_WINDOW_MS,
      DEFAULT_LEADERBOARD_POLL_WINDOW_MS,
    ),
  };
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

async function persistSubmissionSnapshot(
  preparedRun: PreparedTmuxRun,
  source: "before" | "after",
  options: Pick<
    TmuxSolveOptions,
    "env" | "logger" | "sandboxEnvPath" | "submissionsFetch"
  > = {},
): Promise<SubmissionSnapshot | undefined> {
  try {
    const snapshot = await fetchSubmissions(preparedRun, source, options);
    if (!snapshot) {
      return undefined;
    }

    await writeFile(
      path.join(preparedRun.runDir, `submissions.${source}.json`),
      `${JSON.stringify(snapshot, null, 2)}\n`,
      "utf8",
    );
    return snapshot;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await writeFile(
      path.join(preparedRun.runDir, `submissions.${source}.error.json`),
      `${JSON.stringify(
        {
          captured_at: resolveNow().toISOString(),
          error: message,
          run_id: preparedRun.runId,
          source,
          url: resolveSubmissionPollingConfig(options.env).submissionsApiUrl,
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    options.logger?.("WARN", "Failed to capture submissions snapshot.", {
      error: message,
      requestId: preparedRun.requestId,
      runId: preparedRun.runId,
      source,
    });
    return undefined;
  }
}

function resolveSubmissionPollingConfig(
  env: Record<string, string | undefined> | undefined,
): SubmissionPollingConfig {
  return {
    pollIntervalMs: readNumberEnv(
      env?.TRIPLETEX_SUBMISSIONS_POLL_INTERVAL_MS,
      DEFAULT_SUBMISSIONS_POLL_INTERVAL_MS,
    ),
    pollWindowMs: readNumberEnv(
      env?.TRIPLETEX_SUBMISSIONS_POLL_WINDOW_MS,
      DEFAULT_SUBMISSIONS_POLL_WINDOW_MS,
    ),
    queuedAtSkewMs: readNumberEnv(
      env?.TRIPLETEX_SUBMISSIONS_QUEUE_SKEW_MS,
      DEFAULT_SUBMISSIONS_QUEUE_SKEW_MS,
    ),
    submissionsApiUrl:
      env?.TRIPLETEX_MY_SUBMISSIONS_URL ?? DEFAULT_SUBMISSIONS_API_URL,
  };
}

function readNumberEnv(
  rawValue: string | undefined,
  defaultValue: number,
): number {
  const parsed = Number(rawValue);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : defaultValue;
}

function isSubmissionEntry(value: unknown): value is SubmissionEntry {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.queued_at === "string" &&
    typeof value.status === "string" &&
    (value.completed_at === null || typeof value.completed_at === "string") &&
    (value.duration_ms === null || typeof value.duration_ms === "number") &&
    (value.normalized_score === null ||
      typeof value.normalized_score === "number") &&
    (value.score_max === null || typeof value.score_max === "number") &&
    (value.score_raw === null || typeof value.score_raw === "number") &&
    (value.feedback === undefined || isSubmissionFeedback(value.feedback))
  );
}

function isSubmissionFeedback(value: unknown): value is SubmissionFeedback {
  return (
    isRecord(value) &&
    (value.comment === undefined || typeof value.comment === "string") &&
    (value.checks === undefined ||
      (Array.isArray(value.checks) &&
        value.checks.every((check) => typeof check === "string")))
  );
}

function parseIsoTimestampMs(
  value: string | null | undefined,
): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function isSubmissionScored(entry: SubmissionEntry): boolean {
  return (
    entry.completed_at !== null &&
    entry.score_raw !== null &&
    entry.score_max !== null
  );
}

function computeSubmissionCorrectness(
  entry: SubmissionEntry | undefined,
): number | undefined {
  if (
    !entry ||
    entry.score_raw === null ||
    entry.score_max === null ||
    entry.score_max <= 0
  ) {
    return undefined;
  }

  return entry.score_raw / entry.score_max;
}

async function writeSubmissionScore(
  preparedRun: PreparedTmuxRun,
  payload: Record<string, unknown>,
): Promise<void> {
  await writeFile(
    path.join(preparedRun.runDir, "submission-score.json"),
    `${JSON.stringify(payload, null, 2)}\n`,
    "utf8",
  );
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
