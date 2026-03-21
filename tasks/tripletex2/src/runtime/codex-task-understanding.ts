import { randomUUID } from "node:crypto";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type {
  ClassifierExtractorInput,
  ClassifierExtractorIssueCode,
  TaskSpec,
  TaskUnderstandingCode,
  TaskUnderstandingResult,
} from "./contracts";
import {
  registerPendingCodexTaskUnderstandingResult,
} from "./codex-task-understanding-callback";
import {
  buildTmuxCodexCommand,
  DEFAULT_CODEX_ENVIRONMENT_DIR,
  DEFAULT_TMUX_SESSION_NAME,
  killTmuxWindow,
  launchTmuxCommand,
} from "./tmux-solve";

const DEFAULT_CODEX_EXECUTABLE = process.env.CODEX_BIN ?? "codex";
const DEFAULT_CODEX_MODEL =
  process.env.TRIPLETEX2_TASK_UNDERSTANDING_MODEL ?? "gpt-5.4";
const DEFAULT_CALLBACK_BASE_URL =
  process.env.TRIPLETEX2_TASK_UNDERSTANDING_CALLBACK_BASE_URL ??
  `http://127.0.0.1:${process.env.PORT ?? "3000"}`;
const DEFAULT_TIMEOUT_MS = Number(
  process.env.TRIPLETEX2_TASK_UNDERSTANDING_TIMEOUT_MS ?? 120_000,
);
const TASK_UNDERSTANDING_CODES = [
  "ambiguous-task",
  "no-task-match",
  "missing-required-field",
  "ambiguous-field-value",
  "conflicting-field-values",
  "invalid-field-value",
  "unreadable-file",
  "unsupported-request",
] as const satisfies readonly TaskUnderstandingCode[];

export interface CodexTaskUnderstandingOptions {
  callbackBaseUrl?: string;
  cwd?: string;
  executable?: string;
  model?: string;
  timeoutMs?: number;
  executor?: CodexTaskUnderstandingExecutor;
}

export interface CodexTaskUnderstandingExecutorInput {
  callbackBaseUrl: string;
  cwd: string;
  executable: string;
  model: string;
  outputSchema: Record<string, unknown>;
  prompt: string;
  timeoutMs: number;
}

export type CodexTaskUnderstandingExecutor = (
  input: CodexTaskUnderstandingExecutorInput,
) => Promise<string>;

export interface CodexTaskUnderstandingRunResult {
  result: TaskUnderstandingResult<Record<string, unknown>, string>;
  notes: readonly string[];
}

interface CodexTaskUnderstandingResolved {
  status: "resolved";
  taskId: string;
  input: Record<string, unknown>;
  notes?: readonly string[];
}

interface CodexTaskUnderstandingUnresolved {
  status: "unresolved";
  code?: string;
  message?: string;
  taskId?: string;
  partialInput?: Record<string, unknown>;
  notes?: readonly string[];
}

type CodexTaskUnderstandingResponse =
  | CodexTaskUnderstandingResolved
  | CodexTaskUnderstandingUnresolved;

export class CodexTaskUnderstandingInvocationError extends Error {
  readonly stderr: string;
  readonly stdout: string;

  constructor(message: string, options: { stdout?: string; stderr?: string } = {}) {
    super(message);
    this.name = "CodexTaskUnderstandingInvocationError";
    this.stdout = options.stdout ?? "";
    this.stderr = options.stderr ?? "";
  }
}

export function createCodexTaskUnderstandingExtractor(
  options: CodexTaskUnderstandingOptions = {},
): (
  input: ClassifierExtractorInput,
) => Promise<TaskUnderstandingResult<Record<string, unknown>, string>> {
  return async (input) => {
    const runResult = await runCodexTaskUnderstanding(input, options);
    return runResult.result;
  };
}

export async function runCodexTaskUnderstanding(
  input: ClassifierExtractorInput,
  options: CodexTaskUnderstandingOptions = {},
): Promise<CodexTaskUnderstandingRunResult> {
  const callbackBaseUrl = options.callbackBaseUrl ?? DEFAULT_CALLBACK_BASE_URL;
  const cwd = options.cwd ?? DEFAULT_CODEX_ENVIRONMENT_DIR;
  const executable = options.executable ?? DEFAULT_CODEX_EXECUTABLE;
  const model = options.model ?? DEFAULT_CODEX_MODEL;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const executor = options.executor ?? executeCodexTaskUnderstanding;
  const prompt = buildCodexTaskUnderstandingPrompt(input);
  const rawResponseText = await executor({
    callbackBaseUrl,
    cwd,
    executable,
    model,
    outputSchema: createCodexTaskUnderstandingOutputSchema(),
    prompt,
    timeoutMs,
  });
  const response = parseCodexTaskUnderstandingResponse(rawResponseText);
  const adapted = adaptCodexTaskUnderstandingResult(response, input.taskSpecs);

  return {
    result: adapted.result,
    notes: [
      `Task understanding ran via ${path.basename(executable)} in tmux using ./AGENTS.md and an internal callback handoff.`,
      "This path requires a locally installed, authenticated Codex CLI, tmux, and the local Tripletex2 server.",
      ...adapted.notes,
    ],
  };
}

export function buildCodexTaskUnderstandingPrompt(
  input: ClassifierExtractorInput,
): string {
  const lines = [
    "Tripletex2 task-understanding run.",
    "Follow ./AGENTS.md exactly.",
    "Construct one classification JSON object that matches the runtime schema.",
    "Do not return a solve plan, strategy hint, or API sequence.",
    "",
    "Registered task surfaces:",
    JSON.stringify(input.taskSpecs, null, 2),
    "",
    "Request prompt:",
    input.request.prompt,
  ];

  if (!input.request.files || input.request.files.length === 0) {
    return lines.join("\n");
  }

  return [
    ...lines,
    "",
    "Attachment text:",
    ...input.request.files.flatMap((file, index) => [
      `--- FILE ${index + 1} ---`,
      `fileName: ${file.fileName}`,
      `mediaType: ${file.mediaType ?? "unknown"}`,
      file.textContent,
    ]),
  ].join("\n");
}

export function adaptCodexTaskUnderstandingResult(
  response: CodexTaskUnderstandingResponse,
  taskSpecs: readonly TaskSpec<any, string>[],
): {
  result: TaskUnderstandingResult<Record<string, unknown>, string>;
  notes: readonly string[];
} {
  const taskSpecsById = new Map(taskSpecs.map((taskSpec) => [taskSpec.taskId, taskSpec]));
  const notes = normalizeNotes(response.notes);

  if (response.status === "resolved") {
    const taskSpec = taskSpecsById.get(response.taskId);
    if (!taskSpec) {
      return {
        result: {
          status: "unresolved",
          code: "no-task-match",
          message: `Codex returned unknown taskId "${response.taskId}".`,
        },
        notes,
      };
    }

    if (taskSpec.implementationStatus !== "implemented") {
      return {
        result: {
          status: "unresolved",
          code: "unsupported-request",
          message:
            `Request matched "${response.taskId}", but Tripletex2 does not yet ` +
            "implement deterministic extraction/runtime for that task.",
          taskId: response.taskId,
        },
        notes,
      };
    }

    const inputValue = isRecord(response.input) ? response.input : {};
    const allowedFields = new Set<string>([
      ...taskSpec.requiredFields,
      ...(taskSpec.optionalFields ?? []),
    ]);
    const problems: Array<{
      code: TaskUnderstandingCode;
      message: string;
    }> = [];

    for (const fieldName of taskSpec.requiredFields) {
      if (!(fieldName in inputValue)) {
        problems.push({
          code: "missing-required-field",
          message: `Missing required field "${fieldName}" for task "${response.taskId}".`,
        });
      }
    }

    for (const fieldName of Object.keys(inputValue)) {
      if (!allowedFields.has(fieldName)) {
        problems.push({
          code: "invalid-field-value",
          message:
            `Extracted field "${fieldName}" is not part of task ` +
            `"${response.taskId}".`,
        });
      }
    }

    if (problems.length > 0) {
      return {
        result: {
          status: "unresolved",
          code: problems[0].code,
          message: problems.map((problem) => problem.message).join("; "),
          taskId: response.taskId,
          partialInput: inputValue,
        },
        notes,
      };
    }

    return {
      result: {
        status: "resolved",
        taskId: response.taskId,
        input: inputValue,
      },
      notes,
    };
  }

  const normalizedTaskId =
    response.taskId && taskSpecsById.has(response.taskId)
      ? response.taskId
      : undefined;
  const unknownTaskNote =
    response.taskId && !taskSpecsById.has(response.taskId)
      ? ` Codex also returned unknown taskId "${response.taskId}".`
      : "";

  return {
    result: {
      status: "unresolved",
      code: normalizeIssueCode(
        response.code,
        normalizedTaskId ? "unsupported-request" : "no-task-match",
      ),
      message:
        normalizeMessage(response.message) ??
        `Codex task understanding returned unresolved status without a usable message.${unknownTaskNote}`,
      ...(normalizedTaskId ? { taskId: normalizedTaskId } : {}),
      ...(isRecord(response.partialInput)
        ? { partialInput: response.partialInput }
        : {}),
    },
    notes,
  };
}

async function executeCodexTaskUnderstanding(
  input: CodexTaskUnderstandingExecutorInput,
): Promise<string> {
  const tempDir = await mkdtemp(
    path.join(os.tmpdir(), "tripletex2-codex-task-understanding-"),
  );
  const callbackRequestId = `task-understanding-${randomUUID()}`;
  const callbackUrl = buildCodexTaskUnderstandingCallbackUrl(
    input.callbackBaseUrl,
    callbackRequestId,
  );
  const launchScriptPath = path.join(tempDir, "launch-codex.zsh");
  const promptFilePath = path.join(tempDir, "codex-prompt.txt");
  const tmuxWindow = callbackRequestId.slice(0, 48);
  const tmuxTarget = `${DEFAULT_TMUX_SESSION_NAME}:${tmuxWindow}`;
  const registration = registerPendingCodexTaskUnderstandingResult(
    callbackRequestId,
  );

  try {
    await writeFile(
      promptFilePath,
      buildCodexTaskUnderstandingSubmissionPrompt({
        callbackUrl,
        outputSchema: input.outputSchema,
        prompt: input.prompt,
      }),
      "utf8",
    );
    await writeFile(
      launchScriptPath,
      buildCodexTaskUnderstandingLaunchScript({
        callbackUrl,
        codexEnvironmentDir: input.cwd,
        executable: input.executable,
        promptFilePath,
      }),
      "utf8",
    );
    await chmod(launchScriptPath, 0o755);

    await launchTmuxCommand({
      command: launchScriptPath,
      commandCwd: input.cwd,
      tmuxSessionName: DEFAULT_TMUX_SESSION_NAME,
      tmuxWindow,
    });

    const rawResponseText = await waitForCodexTaskUnderstandingCallback(
      registration.promise,
      input.timeoutMs,
    );
    if (!rawResponseText.trim()) {
      throw new CodexTaskUnderstandingInvocationError(
        "codex task understanding completed without submitting a JSON response.",
      );
    }

    return rawResponseText;
  } finally {
    registration.cleanup();
    await killTmuxWindow(tmuxTarget).catch(() => {
      // The window may already be gone if tmux or Codex failed early.
    });
    await rm(tempDir, { recursive: true, force: true });
  }
}

const CLASSIFIER_PROMPT_PATH = path.resolve(
  import.meta.dir,
  "../../prompts/classifier.md",
);

let classifierPromptTemplateCache: string | undefined;

function loadClassifierPromptTemplate(): string {
  if (!classifierPromptTemplateCache) {
    const raw = require("node:fs").readFileSync(CLASSIFIER_PROMPT_PATH, "utf8") as string;
    const separator = "\n---\n";
    const separatorIndex = raw.indexOf(separator);
    classifierPromptTemplateCache =
      separatorIndex >= 0 ? raw.slice(separatorIndex + separator.length).trim() : raw.trim();
  }
  return classifierPromptTemplateCache;
}

function buildCodexTaskUnderstandingSubmissionPrompt(input: {
  callbackUrl: string;
  outputSchema: Record<string, unknown>;
  prompt: string;
}): string {
  return loadClassifierPromptTemplate()
    .replace("{{OUTPUT_SCHEMA}}", JSON.stringify(input.outputSchema, null, 2))
    .replace("{{CALLBACK_URL}}", input.callbackUrl)
    .replace("{{TASK_UNDERSTANDING_PROMPT}}", input.prompt);
}

function buildCodexTaskUnderstandingLaunchScript(input: {
  callbackUrl: string;
  codexEnvironmentDir: string;
  executable: string;
  promptFilePath: string;
}): string {
  return `#!/usr/bin/env zsh
set -u

cd ${shellQuote(input.codexEnvironmentDir)}

export TRIPLETEX2_CLASSIFY_CALLBACK_URL=${shellQuote(input.callbackUrl)}
PROMPT_FILE=${shellQuote(input.promptFilePath)}

${buildTmuxCodexCommand('"$(cat "$PROMPT_FILE")"', input.executable)}
status=$?

print
print "codex exited with status $status"
exec zsh -i
`;
}

function buildCodexTaskUnderstandingCallbackUrl(
  callbackBaseUrl: string,
  requestId: string,
): string {
  const url = new URL("/internal/classify-result", ensureTrailingSlash(callbackBaseUrl));
  url.searchParams.set("requestId", requestId);
  return url.toString();
}

async function waitForCodexTaskUnderstandingCallback(
  promise: Promise<string>,
  timeoutMs: number,
): Promise<string> {
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<string>((_, reject) => {
        timeout = setTimeout(() => {
          reject(
            new CodexTaskUnderstandingInvocationError(
              `codex task understanding timed out after ${timeoutMs}ms waiting for submit-classification.ts.`,
            ),
          );
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

function createCodexTaskUnderstandingOutputSchema(): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      status: {
        enum: ["resolved", "unresolved"],
      },
      taskId: {
        type: ["string", "null"],
      },
      inputJson: {
        type: ["string", "null"],
      },
      code: {
        enum: [...TASK_UNDERSTANDING_CODES, null],
      },
      message: {
        type: ["string", "null"],
      },
      partialInputJson: {
        type: ["string", "null"],
      },
      notes: {
        type: "array",
        items: { type: "string" },
      },
    },
    required: [
      "status",
      "taskId",
      "inputJson",
      "code",
      "message",
      "partialInputJson",
      "notes",
    ],
  };
}

function parseCodexTaskUnderstandingResponse(
  rawText: string,
): CodexTaskUnderstandingResponse {
  let parsed: unknown;

  try {
    parsed = JSON.parse(rawText);
  } catch (error) {
    throw new CodexTaskUnderstandingInvocationError(
      `codex task understanding returned invalid JSON: ${
        error instanceof Error ? error.message : "unknown parse error"
      }`,
      { stdout: rawText },
    );
  }

  if (!isRecord(parsed) || typeof parsed.status !== "string") {
    throw new CodexTaskUnderstandingInvocationError(
      "codex task understanding returned JSON without a valid task-understanding status.",
      { stdout: rawText },
    );
  }

  if (parsed.status === "resolved") {
    if (
      typeof parsed.taskId !== "string" ||
      typeof parsed.inputJson !== "string"
    ) {
      throw new CodexTaskUnderstandingInvocationError(
        'codex task understanding returned an invalid "resolved" payload.',
        { stdout: rawText },
      );
    }

    return {
      status: "resolved",
      taskId: parsed.taskId,
      input: parseJsonRecord(parsed.inputJson, "inputJson", rawText),
      notes: normalizeNotes(parsed.notes),
    };
  }

  if (parsed.status === "unresolved") {
    return {
      status: "unresolved",
      code: typeof parsed.code === "string" ? parsed.code : undefined,
      message: typeof parsed.message === "string" ? parsed.message : undefined,
      taskId: typeof parsed.taskId === "string" ? parsed.taskId : undefined,
      partialInput:
        typeof parsed.partialInputJson === "string"
          ? parseOptionalJsonRecord(
              parsed.partialInputJson,
              "partialInputJson",
              rawText,
            )
          : undefined,
      notes: normalizeNotes(parsed.notes),
    };
  }

  throw new CodexTaskUnderstandingInvocationError(
    `codex task understanding returned unsupported status "${String(parsed.status)}".`,
    { stdout: rawText },
  );
}

function normalizeIssueCode(
  value: string | undefined,
  fallbackCode: ClassifierExtractorIssueCode,
): TaskUnderstandingCode {
  return TASK_UNDERSTANDING_CODES.includes(value as TaskUnderstandingCode)
    ? (value as TaskUnderstandingCode)
    : fallbackCode;
}

function normalizeMessage(value: string | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeNotes(value: unknown): readonly string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseOptionalJsonRecord(
  rawJson: string,
  fieldName: string,
  rawText: string,
): Record<string, unknown> | undefined {
  if (rawJson.trim() === "") {
    return undefined;
  }

  return parseJsonRecord(rawJson, fieldName, rawText);
}

function parseJsonRecord(
  rawJson: string,
  fieldName: string,
  rawText: string,
): Record<string, unknown> {
  let parsed: unknown;

  try {
    parsed = JSON.parse(rawJson);
  } catch (error) {
    throw new CodexTaskUnderstandingInvocationError(
      `codex task understanding returned invalid ${fieldName}: ${
        error instanceof Error ? error.message : "unknown parse error"
      }`,
      { stdout: rawText },
    );
  }

  if (!isRecord(parsed)) {
    throw new CodexTaskUnderstandingInvocationError(
      `codex task understanding returned non-object JSON in ${fieldName}.`,
      { stdout: rawText },
    );
  }

  return parsed;
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}
