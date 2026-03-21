import { appendFile, mkdir, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { RunMode, TaskUnderstandingResult } from "./contracts";

const tripletex2Root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const UNRESOLVED_TASK_ID = "unresolved-task-understanding";

export const DEFAULT_PROMPT_CORPUS_RELATIVE_PATH = path.join(
  "data",
  "prompt-corpus.jsonl",
);
export const DEFAULT_PROMPT_CORPUS_BACKFILL_RUN_ROOTS = [
  path.join(tripletex2Root, "data", "production", "runs"),
  path.join(tripletex2Root, "../tripletex/data/production/runs"),
] as const;

export type PromptCorpusSource = RunMode | "production" | "testing";

export interface PromptCorpusEntry {
  taskId: string;
  txTaskId: string;
  status: "resolved" | "unresolved";
  prompt: string;
  files: string[];
  runId: string;
  timestamp: string;
  source: PromptCorpusSource;
}

interface RequestFileLike {
  fileName?: string;
  filename?: string;
}

interface RequestLike {
  prompt: string;
  files?: readonly RequestFileLike[];
}

export interface BackfillPromptCorpusOptions {
  corpusPath?: string;
  runRoots?: readonly string[];
  source?: PromptCorpusSource;
}

export interface BackfillPromptCorpusResult {
  appendedCount: number;
  existingRunCount: number;
  scannedRunCount: number;
  skippedMissingRequestCount: number;
  skippedMissingTaskIdCount: number;
}

export function resolvePromptCorpusPath(customPath?: string): string {
  const target = customPath?.trim() || DEFAULT_PROMPT_CORPUS_RELATIVE_PATH;
  return path.isAbsolute(target)
    ? path.normalize(target)
    : path.join(tripletex2Root, target);
}

export function inferPromptCorpusSource(input: {
  mode?: RunMode;
  runId?: string;
  stageDirectory?: string;
}): PromptCorpusSource {
  if (
    input.runId?.startsWith("prod-") ||
    includesPathSegment(input.stageDirectory, "production")
  ) {
    return "production";
  }

  if (
    input.runId?.startsWith("test-") ||
    includesPathSegment(input.stageDirectory, "testing")
  ) {
    return "testing";
  }

  return input.mode ?? "sandbox";
}

export function buildPromptCorpusEntry(input: {
  request: RequestLike;
  result: TaskUnderstandingResult<Record<string, unknown>, string>;
  runId: string;
  source: PromptCorpusSource;
  timestamp: string;
}): PromptCorpusEntry | undefined {
  const taskId = input.result.taskId;
  if (!taskId) {
    return undefined;
  }

  return {
    taskId,
    txTaskId: taskId,
    status: input.result.status,
    prompt: input.request.prompt,
    files: listRequestFileNames(input.request.files),
    runId: input.runId,
    timestamp: input.timestamp,
    source: input.source,
  };
}

export async function appendPromptCorpusEntry(
  filePath: string,
  entry: PromptCorpusEntry,
): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await appendFile(filePath, `${JSON.stringify(entry)}\n`, "utf8");
}

export async function appendTaskUnderstandingToPromptCorpus(input: {
  corpusPath?: string;
  request: RequestLike;
  result: TaskUnderstandingResult<Record<string, unknown>, string>;
  runId: string;
  source: PromptCorpusSource;
  timestamp: string;
}): Promise<boolean> {
  const entry = buildPromptCorpusEntry(input);
  if (!entry) {
    return false;
  }

  await appendPromptCorpusEntry(
    resolvePromptCorpusPath(input.corpusPath),
    entry,
  );
  return true;
}

export async function backfillPromptCorpus(
  options: BackfillPromptCorpusOptions = {},
): Promise<BackfillPromptCorpusResult> {
  const corpusPath = resolvePromptCorpusPath(options.corpusPath);
  const runRoots =
    options.runRoots ?? DEFAULT_PROMPT_CORPUS_BACKFILL_RUN_ROOTS;
  const source = options.source ?? "production";
  const existingRunIds = await loadExistingPromptCorpusRunIds(corpusPath);
  const pendingEntries: PromptCorpusEntry[] = [];
  let scannedRunCount = 0;
  let skippedMissingRequestCount = 0;
  let skippedMissingTaskIdCount = 0;

  for (const runRoot of runRoots) {
    const runDirectories = await listRunDirectories(runRoot);
    for (const runDirectory of runDirectories) {
      scannedRunCount += 1;
      if (existingRunIds.has(runDirectory.name)) {
        continue;
      }

      const requestJson = await readJsonIfExists(
        path.join(runDirectory.path, "request.json"),
      );
      if (!requestJson) {
        skippedMissingRequestCount += 1;
        continue;
      }

      const entry = buildPromptCorpusBackfillEntry({
        requestJson,
        resultJson: await readJsonIfExists(path.join(runDirectory.path, "result.json")),
        runId: runDirectory.name,
        source,
        taskAttributionJson: await readJsonIfExists(
          path.join(runDirectory.path, "task-attribution.json"),
        ),
      });

      if (!entry) {
        skippedMissingTaskIdCount += 1;
        continue;
      }

      existingRunIds.add(entry.runId);
      pendingEntries.push(entry);
    }
  }

  pendingEntries.sort(
    (left, right) =>
      left.timestamp.localeCompare(right.timestamp) ||
      left.runId.localeCompare(right.runId),
  );

  if (pendingEntries.length > 0) {
    await mkdir(path.dirname(corpusPath), { recursive: true });
    await appendFile(
      corpusPath,
      pendingEntries.map((entry) => JSON.stringify(entry)).join("\n") + "\n",
      "utf8",
    );
  }

  return {
    appendedCount: pendingEntries.length,
    existingRunCount: existingRunIds.size - pendingEntries.length,
    scannedRunCount,
    skippedMissingRequestCount,
    skippedMissingTaskIdCount,
  };
}

function buildPromptCorpusBackfillEntry(input: {
  requestJson: unknown;
  resultJson: unknown;
  runId: string;
  source: PromptCorpusSource;
  taskAttributionJson: unknown;
}): PromptCorpusEntry | undefined {
  const request = extractRequestLike(input.requestJson);
  if (!request) {
    return undefined;
  }
  const requestRecord = getRecord(input.requestJson);
  const nestedRequestRecord = getRecord(requestRecord?.request);

  const attributedTaskId = extractTaskId(input.taskAttributionJson);
  if (attributedTaskId) {
    return {
      taskId: attributedTaskId,
      txTaskId: attributedTaskId,
      status: "resolved",
      prompt: request.prompt,
      files: request.files,
      runId: input.runId,
      timestamp:
        firstString(
          getRecord(input.taskAttributionJson)?.generated_at,
          getRecord(input.taskAttributionJson)?.generatedAt,
          getRecord(input.taskAttributionJson)?.task_complete_timestamp,
          getRecord(input.taskAttributionJson)?.taskCompleteTimestamp,
          getRecord(input.resultJson)?.completedAt,
          getRecord(input.resultJson)?.createdAt,
          requestRecord?.createdAt,
          nestedRequestRecord?.createdAt,
        ) ?? new Date(0).toISOString(),
      source: input.source,
    };
  }

  const resultRecord = getRecord(input.resultJson);
  const resultTaskId = firstString(
    resultRecord?.taskId,
    resultRecord?.tx_task_id,
    resultRecord?.txTaskId,
  );
  if (!resultTaskId || resultTaskId === UNRESOLVED_TASK_ID) {
    return undefined;
  }

  return {
    taskId: resultTaskId,
    txTaskId: resultTaskId,
    status: readPromptCorpusStatus(resultRecord?.status) ?? "resolved",
    prompt: request.prompt,
    files: request.files,
    runId: input.runId,
    timestamp:
      firstString(
        resultRecord?.completedAt,
        resultRecord?.createdAt,
        requestRecord?.createdAt,
        nestedRequestRecord?.createdAt,
      ) ??
      new Date(0).toISOString(),
    source: input.source,
  };
}

function extractRequestLike(raw: unknown): { prompt: string; files: string[] } | undefined {
  const record = getRecord(raw);
  if (!record) {
    return undefined;
  }

  const nestedRequest = getRecord(record.request);
  const prompt = firstString(record.prompt, nestedRequest?.prompt);
  if (!prompt) {
    return undefined;
  }

  return {
    prompt,
    files: listRequestFileNames(
      Array.isArray(record.files)
        ? (record.files as RequestFileLike[])
        : Array.isArray(nestedRequest?.files)
          ? (nestedRequest.files as RequestFileLike[])
          : [],
    ),
  };
}

function extractTaskId(raw: unknown): string | undefined {
  const record = getRecord(raw);
  return firstString(record?.tx_task_id, record?.txTaskId, record?.taskId);
}

function readPromptCorpusStatus(raw: unknown): PromptCorpusEntry["status"] | undefined {
  if (raw === "resolved" || raw === "unresolved") {
    return raw;
  }

  return undefined;
}

async function loadExistingPromptCorpusRunIds(filePath: string): Promise<Set<string>> {
  const raw = await readFile(filePath, "utf8").catch((error: unknown) => {
    if (isMissingFileError(error)) {
      return "";
    }

    throw error;
  });
  const runIds = new Set<string>();

  for (const [index, line] of raw.split(/\r?\n/).entries()) {
    if (!line.trim()) {
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Invalid JSONL in prompt corpus at line ${index + 1}: ${message}`,
      );
    }

    const runId = firstString(getRecord(parsed)?.runId);
    if (runId) {
      runIds.add(runId);
    }
  }

  return runIds;
}

async function listRunDirectories(
  runRoot: string,
): Promise<Array<{ name: string; path: string }>> {
  const entries = await readdir(runRoot, { withFileTypes: true }).catch(
    (error: unknown) => {
      if (isMissingFileError(error)) {
        return [];
      }

      throw error;
    },
  );

  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      name: entry.name,
      path: path.join(runRoot, entry.name),
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

async function readJsonIfExists(filePath: string): Promise<unknown | undefined> {
  const raw = await readFile(filePath, "utf8").catch((error: unknown) => {
    if (isMissingFileError(error)) {
      return undefined;
    }

    throw error;
  });
  return raw === undefined ? undefined : JSON.parse(raw);
}

function listRequestFileNames(
  files: readonly RequestFileLike[] | undefined,
): string[] {
  return (files ?? [])
    .map((file) => firstString(file.fileName, file.filename))
    .filter((fileName): fileName is string => typeof fileName === "string");
}

function includesPathSegment(
  candidatePath: string | undefined,
  segment: string,
): boolean {
  if (!candidatePath) {
    return false;
  }

  const normalized = path.normalize(candidatePath);
  const pathSegments = normalized.split(path.sep).filter(Boolean);
  return pathSegments.includes(segment);
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }

  return undefined;
}

function getRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}
