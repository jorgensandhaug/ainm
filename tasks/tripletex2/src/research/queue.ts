import path from "node:path";

import {
  RESEARCH_QUEUE_SCHEMA_VERSION,
  type ResearchQueueEntry,
  type ResearchTaskQueue,
} from "./types";
import { readJsonFile, resolveResearchPath } from "./store";

export const DEFAULT_RESEARCH_QUEUE_PATH = resolveResearchPath("task-queue.json");

export async function loadResearchTaskQueue(
  filePath: string = DEFAULT_RESEARCH_QUEUE_PATH,
): Promise<ResearchTaskQueue> {
  const rawValue = await readJsonFile<unknown>(filePath);
  return parseResearchTaskQueue(rawValue, filePath);
}

export function parseResearchTaskQueue(
  rawValue: unknown,
  sourcePath: string = DEFAULT_RESEARCH_QUEUE_PATH,
): ResearchTaskQueue {
  const queue = requireRecord(rawValue, `research queue ${sourcePath}`);
  const schemaVersion = requireString(
    queue.schemaVersion,
    'research queue field "schemaVersion"',
  );
  if (schemaVersion !== RESEARCH_QUEUE_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported research queue schemaVersion "${schemaVersion}" in ${sourcePath}. Expected "${RESEARCH_QUEUE_SCHEMA_VERSION}".`,
    );
  }

  const updatedAt = requireNonEmptyString(
    queue.updatedAt,
    'research queue field "updatedAt"',
  );
  const rawEntries = requireArray(queue.entries, 'research queue field "entries"');
  if (rawEntries.length === 0) {
    throw new Error(`Research queue ${sourcePath} must contain at least one entry.`);
  }

  const seenTaskIds = new Set<string>();
  const entries = rawEntries.map((entry, index) => {
    const parsed = parseResearchQueueEntry(
      entry,
      `research queue entry at index ${index} in ${sourcePath}`,
    );
    if (seenTaskIds.has(parsed.taskId)) {
      throw new Error(
        `Research queue ${sourcePath} contains duplicate taskId "${parsed.taskId}".`,
      );
    }
    seenTaskIds.add(parsed.taskId);
    return parsed;
  });

  return {
    schemaVersion,
    updatedAt,
    entries: sortResearchQueueEntries(entries),
  };
}

export function sortResearchQueueEntries(
  entries: readonly ResearchQueueEntry[],
): ResearchQueueEntry[] {
  return [...entries].sort((left, right) => {
    if (left.priority !== right.priority) {
      return left.priority - right.priority;
    }
    return left.taskId.localeCompare(right.taskId);
  });
}

export function getResearchQueueEntry(
  queue: ResearchTaskQueue,
  taskId: string,
): ResearchQueueEntry | undefined {
  return queue.entries.find((entry) => entry.taskId === taskId);
}

export function getTopReadyQueueEntries(
  queue: ResearchTaskQueue,
  count: number,
): ResearchQueueEntry[] {
  if (!Number.isInteger(count) || count <= 0) {
    throw new Error(`Top-N queue count must be a positive integer. Received ${count}.`);
  }

  return queue.entries
    .filter((entry) => entry.queueEligibility === "ready")
    .slice(0, count);
}

function parseResearchQueueEntry(
  rawValue: unknown,
  label: string,
): ResearchQueueEntry {
  const entry = requireRecord(rawValue, label);
  const taskId = requireTaskId(entry.taskId, `${label}.taskId`);
  const txTaskId = requireTaskId(entry.txTaskId, `${label}.txTaskId`);
  const taskSlug = requireNonEmptyString(entry.taskSlug, `${label}.taskSlug`);
  const taskName = requireNonEmptyString(entry.taskName, `${label}.taskName`);
  const priority = requirePositiveInteger(entry.priority, `${label}.priority`);
  const band = requireOneOf(
    entry.band,
    ["focus", "watch", "kill"] as const,
    `${label}.band`,
  );
  const queueEligibility = requireOneOf(
    entry.queueEligibility,
    ["ready", "hold", "do-not-work"] as const,
    `${label}.queueEligibility`,
  );
  const notes = requireStringArray(entry.notes, `${label}.notes`);
  const operatorNotes = optionalStringArray(entry.operatorNotes, `${label}.operatorNotes`);

  return {
    taskId,
    txTaskId,
    taskSlug,
    taskName,
    priority,
    band,
    queueEligibility,
    ...(typeof entry.researchLane === "string" && entry.researchLane.trim()
      ? { researchLane: entry.researchLane.trim() }
      : {}),
    ...(typeof entry.bestKnownScore === "number"
      ? { bestKnownScore: entry.bestKnownScore }
      : {}),
    ...(typeof entry.maxScore === "number" ? { maxScore: entry.maxScore } : {}),
    ...(typeof entry.baselineCallBudget === "number"
      ? { baselineCallBudget: entry.baselineCallBudget }
      : {}),
    ...(typeof entry.proofInputPath === "string" && entry.proofInputPath.trim()
      ? { proofInputPath: normalizeRelativePath(entry.proofInputPath) }
      : {}),
    ...(typeof entry.verificationPlanId === "string" && entry.verificationPlanId.trim()
      ? { verificationPlanId: entry.verificationPlanId.trim() }
      : {}),
    notes,
    ...(operatorNotes.length > 0 ? { operatorNotes } : {}),
  };
}

function requireRecord(
  value: unknown,
  label: string,
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Expected ${label} to be an object.`);
  }

  return value as Record<string, unknown>;
}

function requireArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`Expected ${label} to be an array.`);
  }

  return value;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new Error(`Expected ${label} to be a string.`);
  }

  return value;
}

function requireNonEmptyString(value: unknown, label: string): string {
  const normalized = requireString(value, label).trim();
  if (normalized.length === 0) {
    throw new Error(`Expected ${label} to be a non-empty string.`);
  }

  return normalized;
}

function requirePositiveInteger(value: unknown, label: string): number {
  if (!Number.isInteger(value) || Number(value) <= 0) {
    throw new Error(`Expected ${label} to be a positive integer.`);
  }

  return Number(value);
}

function requireTaskId(value: unknown, label: string): string {
  const normalized = requireNonEmptyString(value, label);
  if (!/^\d{2}$/.test(normalized)) {
    throw new Error(`Expected ${label} to match the canonical task id form "NN".`);
  }

  return normalized;
}

function requireStringArray(value: unknown, label: string): string[] {
  const rawValues = requireArray(value, label);
  return rawValues.map((entry, index) =>
    requireNonEmptyString(entry, `${label}[${index}]`),
  );
}

function optionalStringArray(value: unknown, label: string): string[] {
  if (value === undefined) {
    return [];
  }

  return requireStringArray(value, label);
}

function requireOneOf<TValue extends readonly string[]>(
  value: unknown,
  allowed: TValue,
  label: string,
): TValue[number] {
  const normalized = requireNonEmptyString(value, label);
  if (!allowed.includes(normalized)) {
    throw new Error(
      `Expected ${label} to be one of ${allowed.map((entry) => `"${entry}"`).join(", ")}.`,
    );
  }

  return normalized as TValue[number];
}

function normalizeRelativePath(value: string): string {
  return path.normalize(value).replaceAll("\\", "/");
}
