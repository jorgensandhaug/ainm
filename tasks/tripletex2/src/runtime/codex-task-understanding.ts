import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type {
  ClassifierExtractorInput,
  ClassifierExtractorIssueCode,
  TaskSpec,
  TaskUnderstandingCode,
  TaskUnderstandingResult,
} from "./contracts";

const TRIPLETEX2_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const DEFAULT_CODEX_ENVIRONMENT_DIR = path.join(
  TRIPLETEX2_ROOT,
  "codex-environment",
);
const DEFAULT_CODEX_EXECUTABLE = process.env.CODEX_BIN ?? "codex";
const DEFAULT_CODEX_MODEL =
  process.env.TRIPLETEX2_TASK_UNDERSTANDING_MODEL ?? "gpt-5.4";
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
  cwd?: string;
  executable?: string;
  model?: string;
  timeoutMs?: number;
  executor?: CodexTaskUnderstandingExecutor;
}

export interface CodexTaskUnderstandingExecutorInput {
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
  const cwd = options.cwd ?? DEFAULT_CODEX_ENVIRONMENT_DIR;
  const executable = options.executable ?? DEFAULT_CODEX_EXECUTABLE;
  const model = options.model ?? DEFAULT_CODEX_MODEL;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const executor = options.executor ?? executeCodexTaskUnderstanding;
  const prompt = buildCodexTaskUnderstandingPrompt(input);
  const rawResponseText = await executor({
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
      `Task understanding ran via ${path.basename(executable)} exec using ./AGENTS.md and a JSON-schema-constrained response.`,
      "This path requires a locally installed, authenticated Codex CLI.",
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
    "Return only JSON that matches the provided output schema.",
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
  const outputSchemaPath = path.join(tempDir, "output-schema.json");
  const outputPath = path.join(tempDir, "response.json");

  try {
    await writeFile(
      outputSchemaPath,
      JSON.stringify(input.outputSchema, null, 2),
      "utf8",
    );

    const args = [
      "exec",
      "-",
      "-C",
      input.cwd,
      "--skip-git-repo-check",
      "--sandbox",
      "read-only",
      "--color",
      "never",
      "--output-schema",
      outputSchemaPath,
      "--output-last-message",
      outputPath,
      "-m",
      input.model,
      "-c",
      'model_reasoning_effort="high"',
    ];

    const child = spawn(input.executable, args, {
      cwd: input.cwd,
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let timedOut = false;

    child.stdout?.on("data", (chunk: Buffer | string) => {
      stdoutChunks.push(Buffer.from(chunk));
    });
    child.stderr?.on("data", (chunk: Buffer | string) => {
      stderrChunks.push(Buffer.from(chunk));
    });

    const completion = new Promise<number>((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code) => {
        resolve(code ?? 1);
      });
    });

    child.stdin?.on("error", () => {
      // The child may exit before fully reading stdin.
    });
    child.stdin?.end(input.prompt);

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, input.timeoutMs);
    const exitCode = await completion.finally(() => clearTimeout(timeout));
    const stdout = Buffer.concat(stdoutChunks).toString("utf8");
    const stderr = Buffer.concat(stderrChunks).toString("utf8");

    if (timedOut) {
      throw new CodexTaskUnderstandingInvocationError(
        `codex exec timed out after ${input.timeoutMs}ms.`,
        { stdout, stderr },
      );
    }

    if (exitCode !== 0) {
      throw new CodexTaskUnderstandingInvocationError(
        `codex exec exited with status ${exitCode}.`,
        { stdout, stderr },
      );
    }

    const outputText = await readFile(outputPath, "utf8");
    if (!outputText.trim()) {
      throw new CodexTaskUnderstandingInvocationError(
        "codex exec completed without writing a final JSON response.",
        { stdout, stderr },
      );
    }

    return outputText;
  } finally {
    await rm(tempDir, { recursive: true, force: true });
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
      `codex exec returned invalid JSON: ${
        error instanceof Error ? error.message : "unknown parse error"
      }`,
      { stdout: rawText },
    );
  }

  if (!isRecord(parsed) || typeof parsed.status !== "string") {
    throw new CodexTaskUnderstandingInvocationError(
      "codex exec returned JSON without a valid task-understanding status.",
      { stdout: rawText },
    );
  }

  if (parsed.status === "resolved") {
    if (
      typeof parsed.taskId !== "string" ||
      typeof parsed.inputJson !== "string"
    ) {
      throw new CodexTaskUnderstandingInvocationError(
        'codex exec returned an invalid "resolved" payload.',
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
    `codex exec returned unsupported status "${String(parsed.status)}".`,
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
      `codex exec returned invalid ${fieldName}: ${
        error instanceof Error ? error.message : "unknown parse error"
      }`,
      { stdout: rawText },
    );
  }

  if (!isRecord(parsed)) {
    throw new CodexTaskUnderstandingInvocationError(
      `codex exec returned non-object JSON in ${fieldName}.`,
      { stdout: rawText },
    );
  }

  return parsed;
}
