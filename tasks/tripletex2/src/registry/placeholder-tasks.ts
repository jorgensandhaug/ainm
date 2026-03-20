import type { TaskRegistration, TaskSpec } from "../runtime/contracts";
import type { CanonicalTaskRegistryEntry } from "./legacy-tripletex1-task-bridge";

interface PlaceholderTaskInput {}

type PlaceholderTaskRegistration = TaskRegistration<PlaceholderTaskInput, string>;

function formatLegacyTaskIds(legacyTaskIds: readonly string[]): string {
  if (legacyTaskIds.length === 1) {
    return `legacy tx_task_id ${legacyTaskIds[0]}`;
  }

  return `legacy tx_task_ids ${legacyTaskIds.join(", ")}`;
}

export function createPlaceholderTaskRegistration(
  entry: CanonicalTaskRegistryEntry,
): PlaceholderTaskRegistration {
  const task = {
    taskId: entry.taskId,
    taskName: entry.taskName,
    implementationStatus: "placeholder",
    signature: `${entry.taskId}(<task-specific-inputs-pending>)`,
    summary: entry.summary,
    inputSchemaId: `${entry.taskId}.placeholder.v1`,
    requiredFields: [] as const,
    extractionNotes: [
      "Placeholder only. This task has a stable canonical id and summary, but its typed extraction contract and runtime strategy are not implemented in tripletex2 yet.",
      `Registry seed evidence comes from the legacy bridge via ${formatLegacyTaskIds(entry.legacyTripletex1TaskIds)}.`,
    ] as const,
  } satisfies TaskSpec<PlaceholderTaskInput, string>;

  return {
    task,
    async loadTaskModule() {
      return {
        task,
        strategies: [],
      };
    },
  };
}
