import { randomUUID } from "node:crypto";
import path from "node:path";

import {
  type CompetitionSolveRequest,
  type SolvePipelineOptions,
  isNotImplementedStrategySelection,
  normalizeCompetitionSolveRequest,
  resolveDeterministicSolveSelection,
  runCompetitionSolvePipeline,
} from "./runtime/solve-pipeline";
import {
  continuePostRunProcessing,
  resolveStorageMode,
  runTmuxSolvePipeline,
  type TmuxSolveRequest,
} from "./runtime/tmux-solve";
import { resolvePendingCodexTaskUnderstandingResult } from "./runtime/codex-task-understanding-callback";
import { appendTaskUnderstandingToPromptCorpus } from "./runtime/prompt-corpus";
import { loadSandboxCredentials } from "./sandbox-credentials";

interface ParsedSolveRequestPayload {
  prompt: string;
  files: readonly ParsedSolveRequestFile[];
  tripletex_credentials: {
    base_url?: string;
    session_token?: string;
    company_id?: string | number;
    credential_source?: string;
  };
}

interface ParsedSolveRequestFile {
  content_base64: string;
  filename: string;
  mime_type?: string;
  textContent: string;
}

export interface SolveServerOptions
  extends Omit<SolvePipelineOptions, "mode" | "requestId" | "runContext"> {
  bearerToken?: string;
  port?: number;
  mode?: "sandbox" | "competition" | "replay" | "dry-run";
  maxConcurrentSolveRequests?: number;
  dataRoot?: string;
  artifactRoot?: string;
  sandboxEnvPath?: string;
  createRunId?: (input: { mode: string; now: Date }) => string;
  solveBackend?: "deterministic" | "tmux";
  env?: Record<string, string | undefined>;
  codexEnvironmentDir?: string;
  codexHomeDir?: string;
  solveTimeoutMs?: number;
  tmuxSessionExists?: (sessionName: string) => Promise<boolean>;
  tmuxSessionName?: string;
  tmuxRunCommand?: (cmd: readonly string[]) => Promise<string>;
  tmuxSleep?: (ms: number) => Promise<void>;
  tmuxLeaderboardFetch?: typeof fetch;
  logger?: (
    level: "INFO" | "WARN" | "ERROR",
    message: string,
    details?: Record<string, unknown>,
  ) => void;
}

interface SolveRequestHandler {
  (request: Request): Promise<Response>;
}

const DEFAULT_PORT = Number(Bun.env.PORT ?? 3000);
const DEFAULT_BEARER_TOKEN = Bun.env.API_KEY ?? "";
const DEFAULT_MAX_CONCURRENCY = Number(
  Bun.env.TRIPLETEX2_MAX_CONCURRENT_SOLVES ?? 3,
);
const INTERNAL_CLASSIFY_RESULT_PATH = "/internal/classify-result";

export function createSolveRequestHandler(
  options: SolveServerOptions = {},
): SolveRequestHandler {
  const bearerToken = options.bearerToken ?? DEFAULT_BEARER_TOKEN;
  const mode = options.mode ?? "sandbox";
  const solveBackend = options.solveBackend ?? resolveSolveBackend(mode);
  const env = options.env ?? Bun.env;
  const storageMode = resolveStorageMode(env.TRIPLETEX_STORAGE_MODE);
  const dataRoot = path.resolve(process.cwd(), options.dataRoot ?? "data");
  const artifactRoot = path.resolve(process.cwd(), options.artifactRoot ?? "runs");
  const maxConcurrentSolveRequests =
    options.maxConcurrentSolveRequests ?? DEFAULT_MAX_CONCURRENCY;
  const log = options.logger ?? defaultLogger;
  const callbackBaseUrl =
    options.codexTaskUnderstanding?.callbackBaseUrl ??
    `http://127.0.0.1:${options.port ?? DEFAULT_PORT}`;
  let activeSolveRequests = 0;

  return async (request: Request): Promise<Response> => {
    const requestId = request.headers.get("x-request-id") ?? randomUUID();
    const url = new URL(request.url);
    const pathname = url.pathname;

    if (pathname === INTERNAL_CLASSIFY_RESULT_PATH) {
      return handleInternalClassifyResultRequest(request, requestId, url);
    }

    if (pathname !== "/solve") {
      return jsonResponse(
        404,
        { error: "Not found." },
        {
          "x-request-id": requestId,
        },
      );
    }

    if (request.method !== "POST") {
      return jsonResponse(
        405,
        { error: "Method not allowed." },
        {
          Allow: "POST",
          "x-request-id": requestId,
        },
      );
    }

    if (!isJsonRequest(request)) {
      return jsonResponse(
        415,
        { error: "Expected application/json request body." },
        {
          "x-request-id": requestId,
        },
      );
    }

    const authorizationError = authorizeRequest(request, bearerToken);
    if (authorizationError) {
      return jsonResponse(
        401,
        { error: authorizationError },
        {
          "x-request-id": requestId,
        },
      );
    }

    if (activeSolveRequests >= maxConcurrentSolveRequests) {
      log("WARN", "Rejected /solve request at concurrency limit.", {
        requestId,
        activeSolveRequests,
        maxConcurrentSolveRequests,
      });
      return jsonResponse(
        503,
        { error: "Server is at solve concurrency limit." },
        {
          "x-request-id": requestId,
        },
      );
    }

    let parsedRequest: ParsedSolveRequestPayload;
    try {
      parsedRequest = parseSolveRequestPayload(await request.json());
    } catch (error) {
      return jsonResponse(
        400,
        {
          error:
            error instanceof Error
              ? error.message
              : "Invalid /solve request body.",
        },
        {
          "x-request-id": requestId,
        },
      );
    }

    const now = options.now ? options.now() : new Date();
    let runId: string | undefined;

    activeSolveRequests += 1;
    log("INFO", "Accepted /solve request.", {
      requestId,
      activeSolveRequests,
      backend: solveBackend,
      mode,
      storageMode,
    });

    try {
      if (solveBackend === "tmux") {
        const result = await runTmuxSolvePipeline(
          toTmuxSolveRequest(parsedRequest),
          requestId,
          {
            codexEnvironmentDir: options.codexEnvironmentDir,
            codexHomeDir: options.codexHomeDir,
            createRunId: options.createRunId
              ? ({ now, storageMode }) =>
                  options.createRunId?.({ mode: storageMode, now }) ??
                  createDefaultRunId(storageMode, now)
              : undefined,
            dataRoot,
            env,
            leaderboardFetch: options.tmuxLeaderboardFetch,
            logger: log,
            now: () => now,
            runCommand: options.tmuxRunCommand,
            sandboxEnvPath: options.sandboxEnvPath,
            sleep: options.tmuxSleep,
            solveTimeoutMs: options.solveTimeoutMs,
            storageMode,
            tmuxSessionExists: options.tmuxSessionExists,
            tmuxSessionName: options.tmuxSessionName,
          },
        );
        runId = result.preparedRun.runId;

        log("INFO", "Completed /solve request.", {
          requestId,
          runId: result.preparedRun.runId,
          runtimeStatus: result.runtimeStatus,
          stageDirectory: result.preparedRun.runDir,
          storageMode,
        });

        void continuePostRunProcessing(result, {
          dataRoot,
          env,
          leaderboardFetch: options.tmuxLeaderboardFetch,
          logger: log,
          now: options.now,
          sleep: options.tmuxSleep,
        });

        return jsonResponse(
          200,
          { status: "completed" },
          {
            "x-request-id": requestId,
            "x-tripletex2-run-id": result.preparedRun.runId,
            "x-tripletex2-runtime-status": result.runtimeStatus,
          },
        );
      }

      const solveRequest = await resolveDeterministicSolveRequestPayload(parsedRequest, {
        mode,
        sandboxEnvPath: options.sandboxEnvPath,
      });
      runId =
        options.createRunId?.({ mode, now }) ??
        createDefaultRunId(mode, now);
      const normalizedSolveRequest =
        normalizeCompetitionSolveRequest(solveRequest);
      const selectionResult = await resolveDeterministicSolveSelection(
        normalizedSolveRequest,
        {
          ...options,
          codexTaskUnderstanding: {
            ...options.codexTaskUnderstanding,
            callbackBaseUrl,
          },
          mode,
          now: () => now,
        },
      );
      if (isNotImplementedStrategySelection(selectionResult.selection)) {
        await appendTaskUnderstandingToPromptCorpus({
          corpusPath: options.promptCorpusPath,
          request: normalizedSolveRequest,
          result: selectionResult.taskUnderstanding.result,
          runId,
          source: storageMode,
          timestamp: now.toISOString(),
        });
        const result = await runTmuxSolvePipeline(
          toTmuxSolveRequest(parsedRequest),
          requestId,
          {
            codexEnvironmentDir: options.codexEnvironmentDir,
            codexHomeDir: options.codexHomeDir,
            createRunId: () => runId!,
            dataRoot,
            env,
            leaderboardFetch: options.tmuxLeaderboardFetch,
            logger: log,
            now: () => now,
            runCommand: options.tmuxRunCommand,
            sandboxEnvPath: options.sandboxEnvPath,
            sleep: options.tmuxSleep,
            solveTimeoutMs: options.solveTimeoutMs,
            storageMode,
            tmuxSessionExists: options.tmuxSessionExists,
            tmuxSessionName: options.tmuxSessionName,
          },
        );

        log("INFO", "Completed /solve request via tmux fallback.", {
          requestId,
          runId,
          taskId: selectionResult.selection.taskId,
          strategyId: selectionResult.selection.strategy.strategyId,
          runtimeStatus: result.runtimeStatus,
          stageDirectory: result.preparedRun.runDir,
          storageMode,
        });

        void continuePostRunProcessing(result, {
          dataRoot,
          env,
          leaderboardFetch: options.tmuxLeaderboardFetch,
          logger: log,
          now: options.now,
          sleep: options.tmuxSleep,
        });

        return jsonResponse(
          200,
          { status: "completed" },
          {
            "x-request-id": requestId,
            "x-tripletex2-run-id": result.preparedRun.runId,
            "x-tripletex2-runtime-status": result.runtimeStatus,
          },
        );
      }
      const runContext = {
        runId,
        stageDirectory: path.join(dataRoot, mode, "runs", runId),
        artifactRoot,
      };
      const result = await runCompetitionSolvePipeline(solveRequest, {
        ...options,
        codexTaskUnderstanding: {
          ...options.codexTaskUnderstanding,
          callbackBaseUrl,
        },
        mode,
        now: () => now,
        requestId,
        runContext,
        taskUnderstanding: selectionResult.taskUnderstanding,
      });

      log("INFO", "Completed /solve request.", {
        requestId,
        runId,
        runtimeStatus: result.artifact.execution.runtimeStatus,
        artifactPath: result.artifactPath,
      });

      return jsonResponse(
        200,
        { status: "completed" },
        {
          "x-request-id": requestId,
          "x-tripletex2-run-id": runId,
          "x-tripletex2-runtime-status": result.artifact.execution.runtimeStatus,
        },
      );
    } catch (error) {
      log("ERROR", "Failed /solve request.", {
        requestId,
        runId,
        error:
          error instanceof Error ? { name: error.name, message: error.message } : error,
      });
      return jsonResponse(
        500,
        { error: "Solve request failed before a canonical artifact could be written." },
        {
          "x-request-id": requestId,
          ...(runId ? { "x-tripletex2-run-id": runId } : {}),
        },
      );
    } finally {
      activeSolveRequests = Math.max(activeSolveRequests - 1, 0);
    }
  };
}

export function startSolveServer(options: SolveServerOptions = {}) {
  const port = options.port ?? DEFAULT_PORT;
  const handler = createSolveRequestHandler(options);
  const server = Bun.serve({
    port,
    fetch: handler,
  });

  (options.logger ?? defaultLogger)("INFO", "Tripletex2 sandbox solve server listening.", {
    port,
    mode: options.mode ?? "sandbox",
    storageMode: resolveStorageMode((options.env ?? Bun.env).TRIPLETEX_STORAGE_MODE),
  });

  return server;
}

async function handleInternalClassifyResultRequest(
  request: Request,
  requestId: string,
  url: URL,
): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResponse(
      405,
      { error: "Method not allowed." },
      {
        Allow: "POST",
        "x-request-id": requestId,
      },
    );
  }

  const classificationRequestId = url.searchParams.get("requestId")?.trim();
  if (!classificationRequestId) {
    return jsonResponse(
      400,
      { error: "Missing requestId query parameter." },
      {
        "x-request-id": requestId,
      },
    );
  }

  const rawBody = await request.text();
  if (!rawBody.trim()) {
    return jsonResponse(
      400,
      { error: "Expected a JSON classification result body." },
      {
        "x-request-id": requestId,
      },
    );
  }

  try {
    JSON.parse(rawBody);
  } catch (error) {
    return jsonResponse(
      400,
      {
        error:
          error instanceof Error
            ? `Invalid classification JSON: ${error.message}`
            : "Invalid classification JSON.",
      },
      {
        "x-request-id": requestId,
      },
    );
  }

  if (
    !resolvePendingCodexTaskUnderstandingResult(
      classificationRequestId,
      rawBody,
    )
  ) {
    return jsonResponse(
      404,
      { error: "No pending task-understanding callback for that requestId." },
      {
        "x-request-id": requestId,
      },
    );
  }

  return jsonResponse(
    200,
    { status: "accepted" },
    {
      "x-request-id": requestId,
    },
  );
}

function authorizeRequest(request: Request, bearerToken: string): string | undefined {
  const authorization = request.headers.get("authorization");
  if (!authorization) {
    return "Missing Authorization header.";
  }

  const [scheme, token] = authorization.split(" ", 2);
  if (scheme !== "Bearer" || token !== bearerToken) {
    return "Invalid bearer token.";
  }

  return undefined;
}

function isJsonRequest(request: Request): boolean {
  const contentType = request.headers.get("content-type");
  return typeof contentType === "string" && contentType.startsWith("application/json");
}

async function resolveDeterministicSolveRequestPayload(
  parsed: ParsedSolveRequestPayload,
  options: {
    mode: NonNullable<SolveServerOptions["mode"]>;
    sandboxEnvPath?: string;
  },
): Promise<CompetitionSolveRequest> {
  const requestCredentials = parsed.tripletex_credentials;
  const shouldUseSandboxFallback =
    options.mode === "sandbox" &&
    shouldFallbackToSandboxCredentials(requestCredentials);
  const sandboxCredentials = shouldUseSandboxFallback
    ? await loadSandboxCredentials({ sandboxEnvPath: options.sandboxEnvPath })
    : undefined;

  return {
    prompt: parsed.prompt,
    files: parsed.files.map((file) => ({
      fileName: file.filename,
      textContent: file.textContent,
      contentBase64: file.content_base64,
      ...(file.mime_type ? { mediaType: file.mime_type } : {}),
    })),
    tripletex_credentials: {
      base_url:
        sandboxCredentials?.base_url ??
        requireConfiguredCredentialString(
          requestCredentials.base_url,
          'solve request field "tripletex_credentials.base_url"',
        ),
      session_token:
        sandboxCredentials?.session_token ??
        requireConfiguredCredentialString(
          requestCredentials.session_token,
          'solve request field "tripletex_credentials.session_token"',
        ),
      ...(requestCredentials.company_id !== undefined
        ? { company_id: requestCredentials.company_id }
        : {}),
      ...((sandboxCredentials
        ? "sandbox"
        : requestCredentials.credential_source) !== undefined
        ? {
            credential_source: sandboxCredentials
              ? "sandbox"
              : requestCredentials.credential_source,
          }
        : {}),
    },
  };
}

function parseSolveRequestPayload(rawValue: unknown): ParsedSolveRequestPayload {
  const payload = requireRecord(rawValue, "solve request body");
  const allowedTopLevelKeys = new Set([
    "prompt",
    "files",
    "tripletex_credentials",
  ]);
  rejectUnknownKeys(payload, allowedTopLevelKeys, "solve request body");

  const prompt = requireNonEmptyString(payload.prompt, 'solve request field "prompt"');
  const tripletexCredentials = requireRecord(
    payload.tripletex_credentials,
    'solve request field "tripletex_credentials"',
  );
  rejectUnknownKeys(
    tripletexCredentials,
    new Set([
      "base_url",
      "session_token",
      "company_id",
      "credential_source",
    ]),
    'solve request field "tripletex_credentials"',
  );

  return {
    prompt,
    files: parseSolveFiles(payload.files),
    tripletex_credentials: {
      ...(tripletexCredentials.base_url !== undefined
        ? {
            base_url: parseOptionalString(
              tripletexCredentials.base_url,
              'solve request field "tripletex_credentials.base_url"',
            ),
          }
        : {}),
      ...(tripletexCredentials.session_token !== undefined
        ? {
            session_token: parseOptionalString(
              tripletexCredentials.session_token,
              'solve request field "tripletex_credentials.session_token"',
            ),
          }
        : {}),
      ...(tripletexCredentials.company_id !== undefined
        ? { company_id: parseCompanyId(tripletexCredentials.company_id) }
        : {}),
      ...(tripletexCredentials.credential_source !== undefined
        ? {
            credential_source: requireNonEmptyString(
              tripletexCredentials.credential_source,
              'solve request field "tripletex_credentials.credential_source"',
            ),
          }
        : {}),
    },
  };
}

function parseSolveFiles(rawValue: unknown): ParsedSolveRequestFile[] {
  if (rawValue === undefined) {
    return [];
  }

  if (!Array.isArray(rawValue)) {
    throw new Error('Expected solve request field "files" to be an array.');
  }

  return rawValue.map((entry, index) => {
    const file = requireRecord(entry, `solve request file[${index}]`);
    rejectUnknownKeys(
      file,
      new Set(["filename", "content_base64", "mime_type"]),
      `solve request file[${index}]`,
    );

    return {
      filename: requireNonEmptyString(
        file.filename,
        `solve request file[${index}].filename`,
      ),
      content_base64: requireString(
        file.content_base64,
        `solve request file[${index}].content_base64`,
      ),
      textContent: Buffer.from(
        requireString(file.content_base64, `solve request file[${index}].content_base64`),
        "base64",
      ).toString("utf8"),
      ...(file.mime_type !== undefined
        ? {
            mime_type: requireNonEmptyString(
              file.mime_type,
              `solve request file[${index}].mime_type`,
            ),
          }
        : {}),
    };
  });
}

function parseCompanyId(value: unknown): string | number {
  if (typeof value === "string" || typeof value === "number") {
    return value;
  }

  throw new Error(
    'Expected solve request field "tripletex_credentials.company_id" to be a string or number.',
  );
}

function createDefaultRunId(mode: string, now: Date): string {
  return `${mode}-${now.toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
}

function resolveSolveBackend(
  mode: NonNullable<SolveServerOptions["mode"]>,
): "deterministic" | "tmux" {
  return mode === "sandbox" || mode === "competition"
    ? "tmux"
    : "deterministic";
}

function toTmuxSolveRequest(parsed: ParsedSolveRequestPayload): TmuxSolveRequest {
  return {
    prompt: parsed.prompt,
    files: parsed.files.map((file) => ({
      fileName: file.filename,
      contentBase64: file.content_base64,
      textContent: file.textContent,
      ...(file.mime_type ? { mediaType: file.mime_type } : {}),
    })),
    tripletex_credentials: {
      ...parsed.tripletex_credentials,
    },
  };
}

function jsonResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  return new Response(`${JSON.stringify(body)}\n`, {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...headers,
    },
  });
}

function defaultLogger(
  level: "INFO" | "WARN" | "ERROR",
  message: string,
  details?: Record<string, unknown>,
): void {
  const prefix = `[${new Date().toISOString()}] [${level}]`;
  if (details && Object.keys(details).length > 0) {
    console.log(`${prefix} ${message}`, details);
    return;
  }

  console.log(`${prefix} ${message}`);
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Expected ${label} to be an object.`);
  }

  return value as Record<string, unknown>;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new Error(`Expected ${label} to be a string.`);
  }

  return value;
}

function requireNonEmptyString(value: unknown, label: string): string {
  const stringValue = requireString(value, label).trim();
  if (stringValue.length === 0) {
    throw new Error(`Expected ${label} to be a non-empty string.`);
  }

  return stringValue;
}

function parseOptionalString(value: unknown, label: string): string | undefined {
  const stringValue = requireString(value, label).trim();
  return stringValue.length > 0 ? stringValue : undefined;
}

function requireConfiguredCredentialString(
  value: string | undefined,
  label: string,
): string {
  if (value === undefined) {
    throw new Error(`Expected ${label} to be a non-empty string.`);
  }

  if (isPlaceholderCredentialValue(value)) {
    throw new Error(`Expected ${label} to be configured, not placeholder "replace-me".`);
  }

  return value;
}

function shouldFallbackToSandboxCredentials(
  credentials: ParsedSolveRequestPayload["tripletex_credentials"],
): boolean {
  return (
    credentials.base_url === undefined ||
    credentials.session_token === undefined ||
    isPlaceholderCredentialValue(credentials.base_url) ||
    isPlaceholderCredentialValue(credentials.session_token)
  );
}

function isPlaceholderCredentialValue(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === "replace-me";
}

function rejectUnknownKeys(
  record: Record<string, unknown>,
  allowedKeys: ReadonlySet<string>,
  label: string,
): void {
  const unknownKeys = Object.keys(record).filter((key) => !allowedKeys.has(key));
  if (unknownKeys.length > 0) {
    throw new Error(`${label} contained unknown keys: ${unknownKeys.join(", ")}.`);
  }
}

if (import.meta.main) {
  startSolveServer();
}
