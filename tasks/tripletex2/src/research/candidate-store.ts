import {
  CANDIDATE_STORE_SCHEMA_VERSION,
  type CandidateRecord,
  type CandidateStatus,
  type CandidateStore,
} from "./types";
import { readJsonFile, resolveResearchPath, writeJsonFile } from "./store";

export const DEFAULT_CANDIDATE_STORE_PATH = resolveResearchPath(
  "candidate-strategies.json",
);

export async function loadCandidateStore(
  filePath: string = DEFAULT_CANDIDATE_STORE_PATH,
): Promise<CandidateStore> {
  const rawValue = await readJsonFile<unknown>(filePath);
  return parseCandidateStore(rawValue, filePath);
}

export async function writeCandidateStore(
  store: CandidateStore,
  filePath: string = DEFAULT_CANDIDATE_STORE_PATH,
): Promise<void> {
  validateCandidateStore(store, filePath);
  await writeJsonFile(filePath, store);
}

export function parseCandidateStore(
  rawValue: unknown,
  sourcePath: string = DEFAULT_CANDIDATE_STORE_PATH,
): CandidateStore {
  const store = requireRecord(rawValue, `candidate store ${sourcePath}`);
  const schemaVersion = requireString(
    store.schemaVersion,
    'candidate store field "schemaVersion"',
  );
  if (schemaVersion !== CANDIDATE_STORE_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported candidate store schemaVersion "${schemaVersion}" in ${sourcePath}. Expected "${CANDIDATE_STORE_SCHEMA_VERSION}".`,
    );
  }

  const updatedAt = requireNonEmptyString(
    store.updatedAt,
    'candidate store field "updatedAt"',
  );
  const rawEntries = requireArray(store.entries, 'candidate store field "entries"');
  const entries = rawEntries.map((entry, index) =>
    parseCandidateRecord(
      entry,
      `candidate store entry at index ${index} in ${sourcePath}`,
    ),
  );

  const candidateIds = new Set<string>();
  for (const entry of entries) {
    if (candidateIds.has(entry.candidateId)) {
      throw new Error(
        `Candidate store ${sourcePath} contains duplicate candidateId "${entry.candidateId}".`,
      );
    }
    candidateIds.add(entry.candidateId);
  }

  return {
    schemaVersion,
    updatedAt,
    entries: entries.sort((left, right) =>
      left.candidateId.localeCompare(right.candidateId),
    ),
  };
}

export function createEmptyCandidateStore(now: Date = new Date()): CandidateStore {
  return {
    schemaVersion: CANDIDATE_STORE_SCHEMA_VERSION,
    updatedAt: now.toISOString(),
    entries: [],
  };
}

export function upsertCandidateRecord(
  store: CandidateStore,
  record: CandidateRecord,
): CandidateStore {
  const validatedRecord = parseCandidateRecord(
    record,
    `candidate record "${record.candidateId}"`,
  );
  const nextEntries = store.entries.filter(
    (entry) => entry.candidateId !== validatedRecord.candidateId,
  );
  nextEntries.push(validatedRecord);
  nextEntries.sort((left, right) => left.candidateId.localeCompare(right.candidateId));

  return {
    ...store,
    updatedAt: validatedRecord.updatedAt,
    entries: nextEntries,
  };
}

export function summarizeCandidateStatuses(
  store: CandidateStore,
  taskId?: string,
): Record<CandidateStatus, number> {
  const base: Record<CandidateStatus, number> = {
    draft: 0,
    "sandbox-pass": 0,
    "sandbox-fail": 0,
    "needs-review": 0,
    "promote-later": 0,
  };

  for (const entry of store.entries) {
    if (!taskId || entry.taskId === taskId) {
      base[entry.status] += 1;
    }
  }

  return base;
}

function validateCandidateStore(
  store: CandidateStore,
  sourcePath: string,
): void {
  parseCandidateStore(store, sourcePath);
}

function parseCandidateRecord(
  rawValue: unknown,
  label: string,
): CandidateRecord {
  const record = requireRecord(rawValue, label);
  const candidateId = requireNonEmptyString(record.candidateId, `${label}.candidateId`);
  const taskId = requireTaskId(record.taskId, `${label}.taskId`);
  const strategyId = requireNonEmptyString(record.strategyId, `${label}.strategyId`);
  const status = requireOneOf(
    record.status,
    [
      "draft",
      "sandbox-pass",
      "sandbox-fail",
      "needs-review",
      "promote-later",
    ] as const,
    `${label}.status`,
  );
  const notes = requireStringArray(record.notes, `${label}.notes`);
  const createdAt = requireNonEmptyString(record.createdAt, `${label}.createdAt`);
  const updatedAt = requireNonEmptyString(record.updatedAt, `${label}.updatedAt`);

  return {
    candidateId,
    taskId,
    strategyId,
    ...(typeof record.strategyPath === "string" && record.strategyPath.trim()
      ? { strategyPath: record.strategyPath.trim() }
      : {}),
    ...(typeof record.strategyName === "string" && record.strategyName.trim()
      ? { strategyName: record.strategyName.trim() }
      : {}),
    status,
    ...(typeof record.packetPath === "string" && record.packetPath.trim()
      ? { packetPath: record.packetPath.trim() }
      : {}),
    ...(typeof record.latestVerificationReportPath === "string" &&
    record.latestVerificationReportPath.trim()
      ? { latestVerificationReportPath: record.latestVerificationReportPath.trim() }
      : {}),
    ...(record.latestSandboxVerdict &&
    typeof record.latestSandboxVerdict === "object" &&
    !Array.isArray(record.latestSandboxVerdict)
      ? {
          latestSandboxVerdict: parseSandboxVerdict(
            record.latestSandboxVerdict,
            `${label}.latestSandboxVerdict`,
          ),
        }
      : {}),
    notes,
    createdAt,
    updatedAt,
  };
}

function parseSandboxVerdict(
  rawValue: Record<string, unknown>,
  label: string,
): CandidateRecord["latestSandboxVerdict"] {
  const correctnessPassed = requireBoolean(
    rawValue.correctnessPassed,
    `${label}.correctnessPassed`,
  );
  const withinBudget = requireBoolean(
    rawValue.withinBudget,
    `${label}.withinBudget`,
  );
  const apiCallCount = requireNonNegativeInteger(
    rawValue.apiCallCount,
    `${label}.apiCallCount`,
  );

  return {
    correctnessPassed,
    withinBudget,
    apiCallCount,
    ...(typeof rawValue.baselineCallBudget === "number"
      ? { baselineCallBudget: requireNonNegativeInteger(rawValue.baselineCallBudget, `${label}.baselineCallBudget`) }
      : {}),
    ...(typeof rawValue.verificationReportPath === "string" &&
    rawValue.verificationReportPath.trim()
      ? { verificationReportPath: rawValue.verificationReportPath.trim() }
      : {}),
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

function requireBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`Expected ${label} to be a boolean.`);
  }

  return value;
}

function requireNonNegativeInteger(value: unknown, label: string): number {
  if (!Number.isInteger(value) || Number(value) < 0) {
    throw new Error(`Expected ${label} to be a non-negative integer.`);
  }

  return Number(value);
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
