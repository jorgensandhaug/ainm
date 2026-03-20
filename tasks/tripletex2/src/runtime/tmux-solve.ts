import { randomUUID } from "node:crypto";
import {
  chmod,
  mkdir,
  readdir,
  readFile,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadSandboxCredentials } from "../sandbox-credentials";
import type { RuntimeStatus, TripletexCredentialCompanyId } from "./contracts";

export type StorageMode = "testing" | "production";

export interface TmuxSolveRequestFile {
  fileName: string;
  contentBase64: string;
  mediaType?: string;
  textContent: string;
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
  tmuxSessionExists?: (sessionName: string) => Promise<boolean>;
  tmuxSessionName?: string;
}

const DEFAULT_TMUX_SESSION_NAME = "ainm-tripletex-sessions";
const DEFAULT_SOLVE_TIMEOUT_MS = 300_000;
const tripletex2Root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const DEFAULT_CODEX_ENVIRONMENT_DIR = tripletex2Root;

let tmuxLaunchLock: Promise<void> = Promise.resolve();

export function resolveStorageMode(rawMode: string | undefined): StorageMode {
  switch (rawMode?.trim().toLowerCase()) {
    case "testing":
    case "test":
      return "testing";
    default:
      return "production";
  }
}

export function buildCodexPrompt(
  input: TmuxSolveRequest,
  files: readonly StoredSolveFile[],
  effectiveCredentials: EffectiveCredentials,
  scriptsDir: string,
): string {
  const openApiPath = "../tripletex/codex-environment/openapi.json";
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
    "- 1. ./docs/trusted-standards/",
    "- 2. ./docs/task-playbooks/",
    `- 3. ${openApiPath}`,
    `- If this is an exact trusted-standard match, use it directly and do not re-check ${openApiPath}.`,
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
  ];

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
  const attachmentsDir = path.join(runDir, "attachments");
  const scriptsDir = path.join(runDir, "scripts");
  const effectiveCredentials = await resolveEffectiveCredentials(input, storageMode, options);

  await mkdir(attachmentsDir, { recursive: true });
  await mkdir(scriptsDir, { recursive: true });

  const storedFiles: StoredSolveFile[] = [];
  for (const [index, file] of input.files.entries()) {
    const storedFileName = `${String(index + 1).padStart(2, "0")}-${sanitizeFilename(file.fileName)}`;
    const filePath = path.join(attachmentsDir, storedFileName);
    await writeFile(filePath, Buffer.from(file.contentBase64, "base64"));
    storedFiles.push({
      ...file,
      path: filePath,
    });
  }

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
    `${JSON.stringify(
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
    )}\n`,
    "utf8",
  );
  await writeFile(preparedRun.promptFilePath, `${preparedRun.codexPrompt}\n`, "utf8");
  await writeFile(
    path.join(runDir, "manifest.json"),
    `${JSON.stringify(
      {
        created_at: createdAt,
        request_id: requestId,
        run_id: runId,
        run_dir: runDir,
        storage_mode: storageMode,
        tmux_session: tmuxSessionName,
        tmux_window: tmuxWindow,
        codex_environment_dir:
          options.codexEnvironmentDir ?? DEFAULT_CODEX_ENVIRONMENT_DIR,
        codex_home_dir: resolveCodexHomeDir(options),
        scripts_dir: scriptsDir,
        credentials_source: effectiveCredentials.source,
        effective_base_url: effectiveCredentials.baseUrl,
        attachments: storedFiles.map((file) => ({
          filename: file.fileName,
          ...(file.mediaType ? { mime_type: file.mediaType } : {}),
          path: file.path,
        })),
      },
      null,
      2,
    )}\n`,
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
  const runCommand = options.runCommand ?? defaultRunCommand;
  const tmuxSessionExists =
    options.tmuxSessionExists ??
    ((sessionName) => defaultTmuxSessionExists(sessionName));

  await withTmuxLaunchLock(async () => {
    const sessionExisted = await tmuxSessionExists(preparedRun.tmuxSessionName);

    if (!sessionExisted) {
      await runCommand([
        "tmux",
        "new-session",
        "-d",
        "-s",
        preparedRun.tmuxSessionName,
        "-n",
        "__control__",
        "-c",
        codexEnvironmentDir,
      ]);
      await runCommand([
        "tmux",
        "set-option",
        "-t",
        preparedRun.tmuxSessionName,
        "remain-on-exit",
        "on",
      ]);
    }

    await runCommand([
      "tmux",
      "new-window",
      "-d",
      "-t",
      preparedRun.tmuxSessionName,
      "-n",
      preparedRun.tmuxWindow,
      "-c",
      codexEnvironmentDir,
      preparedRun.launchScriptPath,
    ]);
  });
}

export async function waitForSolveCompletion(
  preparedRun: PreparedTmuxRun,
  options: Pick<
    TmuxSolveOptions,
    "codexEnvironmentDir" | "codexHomeDir" | "sleep" | "solveTimeoutMs"
  > = {},
): Promise<WaitForSolveResult> {
  const deadline = Date.now() + (options.solveTimeoutMs ?? DEFAULT_SOLVE_TIMEOUT_MS);
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

function sanitizeFilename(filename: string): string {
  const cleaned = path.basename(filename).replace(/[^A-Za-z0-9._-]/g, "_");
  return cleaned.length > 0 ? cleaned : "attachment";
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

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
