import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { NonEligibleTaskReasonCode } from "./contracts";

export const NON_ELIGIBLE_TASK_POLICY_SCHEMA_VERSION =
  "tripletex2.non-eligible-task-policy.v1";

export interface NonEligibleTaskPolicyEntry {
  reasonCode: NonEligibleTaskReasonCode;
  reason: string;
}

export interface NonEligibleTaskPolicyConfig {
  schemaVersion: typeof NON_ELIGIBLE_TASK_POLICY_SCHEMA_VERSION;
  policyId: string;
  excludedCanonicalTasks: Record<string, NonEligibleTaskPolicyEntry>;
}

export interface LoadedNonEligibleTaskPolicy {
  config: NonEligibleTaskPolicyConfig;
  configPath: string;
}

export const DEFAULT_NON_ELIGIBLE_TASK_POLICY_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../configs/non-eligible-task-policy.json",
);

export async function loadNonEligibleTaskPolicy(
  configPath: string,
): Promise<LoadedNonEligibleTaskPolicy> {
  const rawFile = await readFile(configPath, "utf8");
  const rawValue = JSON.parse(rawFile) as unknown;

  return {
    config: parseNonEligibleTaskPolicyConfig(rawValue),
    configPath,
  };
}

export function parseNonEligibleTaskPolicyConfig(
  rawValue: unknown,
): NonEligibleTaskPolicyConfig {
  const config = requireRecord(rawValue, "non-eligible task policy config");
  const schemaVersion = requireString(
    config.schemaVersion,
    'non-eligible task policy config field "schemaVersion"',
  );

  if (schemaVersion !== NON_ELIGIBLE_TASK_POLICY_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported non-eligible task policy schemaVersion "${schemaVersion}". Expected "${NON_ELIGIBLE_TASK_POLICY_SCHEMA_VERSION}".`,
    );
  }

  const policyId = requireNonEmptyString(
    config.policyId,
    'non-eligible task policy config field "policyId"',
  );
  const excludedTasksRecord = requireRecord(
    config.excludedCanonicalTasks,
    'non-eligible task policy config field "excludedCanonicalTasks"',
  );
  const excludedTasks: Record<string, NonEligibleTaskPolicyEntry> = {};

  for (const [taskId, value] of Object.entries(excludedTasksRecord)) {
    const normalizedTaskId = taskId.trim();
    if (normalizedTaskId.length === 0) {
      throw new Error(
        'Expected non-eligible task policy config field "excludedCanonicalTasks" keys to be non-empty strings.',
      );
    }

    const entry = requireRecord(
      value,
      `non-eligible task policy config field "excludedCanonicalTasks.${normalizedTaskId}"`,
    );
    const reasonCode = requireReasonCode(
      entry.reasonCode,
      `non-eligible task policy config field "excludedCanonicalTasks.${normalizedTaskId}.reasonCode"`,
    );
    const reason = requireNonEmptyString(
      entry.reason,
      `non-eligible task policy config field "excludedCanonicalTasks.${normalizedTaskId}.reason"`,
    );

    excludedTasks[normalizedTaskId] = {
      reasonCode,
      reason,
    };
  }

  return {
    schemaVersion,
    policyId,
    excludedCanonicalTasks: excludedTasks,
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

function requireReasonCode(
  value: unknown,
  label: string,
): NonEligibleTaskReasonCode {
  const reasonCode = requireNonEmptyString(value, label);
  if (reasonCode === "already-perfect" || reasonCode === "non-eligible") {
    return reasonCode;
  }

  throw new Error(
    `Expected ${label} to be "already-perfect" or "non-eligible".`,
  );
}
