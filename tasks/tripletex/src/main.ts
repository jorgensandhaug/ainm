import { randomUUID } from "node:crypto";
import { chmod, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
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
  scriptsDir: string;
  storageMode: StorageMode;
  tmuxWindow: string;
};

type CodexSessionMeta = {
  cli_version?: string;
  cwd?: string;
  id: string;
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

const port = Number(Bun.env.PORT ?? 3000);
const requiredBearerToken = Bun.env.API_KEY ?? "HALLAGUTTA123";
const tmuxSessionName = "ainm-tripletex-sessions";
const tripletexRootDir = resolve(import.meta.dir, "..");
const codexEnvironmentDir = resolve(tripletexRootDir, "codex-environment");
const codexHomeDir = resolve(Bun.env.CODEX_HOME ?? `${Bun.env.HOME ?? "~"}/.codex`);
const dataRootDir = resolve(tripletexRootDir, "data");
const sandboxEnvPath = resolve(tripletexRootDir, ".sandbox.env");
const solveTimeoutMs = 5 * 60 * 1000;
const maxConcurrentSolveRequests = 3;
let activeSolveRequests = 0;
let tmuxLaunchLock: Promise<void> = Promise.resolve();

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
    "Execution rules:",
    "- Only interact with the Tripletex API by writing TypeScript code and running it with bun.",
    `- The only allowed location for API-interaction scripts is this run scripts directory: ${scriptsDir}`,
    "- Do not place API-interaction scripts anywhere else.",
    "- Reuse write responses and avoid unnecessary GET calls.",
    "",
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
    "# Codex Trace Snapshot",
    "",
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
  const filteredJsonl = snapshot.entries.map((entry) => JSON.stringify(entry)).join("\n");
  await writeFile(join(preparedRun.runDir, "codex-trace.filtered.jsonl"), filteredJsonl ? `${filteredJsonl}\n` : "");
  await writeFile(join(preparedRun.runDir, "codex-trace.snapshot.json"), JSON.stringify(snapshot, null, 2));
  await writeFile(join(preparedRun.runDir, "codex-trace.readable.md"), renderCodexTraceMarkdown(snapshot));
  await writeFile(
    captureStatusPath,
    JSON.stringify(
      {
        status: "captured",
        captured_at: nowIso(),
        session_id: matchedSession.sessionMeta.id,
        session_file: matchedSession.path,
        summary: snapshot.summary,
      },
      null,
      2,
    ),
  );

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
    "You are doing a post-run learning pass for this exact Codex session.",
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

async function finalizeReflectionRun(
  preparedRun: PreparedRun,
  matchedSession: MatchedCodexSession,
  baselineLineCount: number,
  baselineTaskCompleteCount: number,
  reflectionSummaryPath: string,
  reflectionEventsPath: string,
): Promise<void> {
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
      return;
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
}

async function maybeLaunchReflectionRun(
  preparedRun: PreparedRun,
  matchedSession: MatchedCodexSession | undefined,
): Promise<void> {
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
    return;
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
          sandbox_credentials_available: Boolean(sandboxCredentials),
        },
        null,
        2,
    ),
  );

  void finalizeReflectionRun(
    preparedRun,
    matchedSession,
    baselineLineCount,
    baselineTaskCompleteCount,
    reflectionSummaryPath,
    reflectionEventsPath,
  );
}

function buildLaunchScript(preparedRun: PreparedRun): string {
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
  const tmuxWindow = runId.slice(0, 48);
  const createdAt = new Date().toISOString();
  const codexPrompt = buildCodexPrompt(input, storedFiles, effectiveCredentials, scriptsDir);

  const preparedRun: PreparedRun = {
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
    scriptsDir,
    storageMode,
    tmuxWindow,
  };

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
        credentials_source: effectiveCredentials.source,
        effective_base_url: effectiveCredentials.baseUrl,
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

    if (matchedSession) {
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
): Promise<void> {
  try {
    const tracedSession = await persistCodexTraceArtifacts(preparedRun, matchedSession);
    await maybeLaunchReflectionRun(preparedRun, tracedSession ?? matchedSession);
    log("INFO", "Post-run processing completed", {
      requestId: preparedRun.requestId,
      runId: preparedRun.runId,
      tracedSessionId: (tracedSession ?? matchedSession)?.sessionMeta.id,
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

  void continuePostRunProcessing(preparedRun, waitResult.matchedSession);

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
  hasApiKey: Boolean(requiredBearerToken),
  maxConcurrentSolveRequests,
});
