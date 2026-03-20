import type { ActiveStrategySelectionConfig } from "../runtime/contracts";
import {
  createActiveStrategyResolver,
  loadActiveStrategySelectionConfig,
} from "./active-strategy-selection";
import {
  CANONICAL_TASK_REGISTRY,
  slugToTxTaskId,
  txTaskIdToSlug,
} from "./legacy-tripletex1-task-bridge";
import { createPlaceholderTaskRegistration } from "./placeholder-tasks";
import { createTaskRegistry } from "./task-registry";
import { taskRegistration as createAndSendInvoiceTask } from "../tasks/task-create-and-send-invoice/task";

const implementedTaskRegistrations = [createAndSendInvoiceTask] as const;
const implementedTaskRegistrationsById = new Map(
  implementedTaskRegistrations.map((registration) => [
    registration.task.taskId,
    registration,
  ]),
);

export const taskRegistrations = CANONICAL_TASK_REGISTRY.map(
  (canonicalTask) =>
    implementedTaskRegistrationsById.get(canonicalTask.taskId) ??
    createPlaceholderTaskRegistration(canonicalTask),
);
export const DEFAULT_ACTIVE_STRATEGY_SELECTION_CONFIG_PATH =
  "configs/active-strategies.json";

export const taskRegistry = createTaskRegistry(taskRegistrations);

export const taskSpecs = taskRegistry.taskSpecs;

export { slugToTxTaskId, txTaskIdToSlug };

export const listTaskIds = (): readonly string[] => taskRegistry.listTaskIds();

export const hasTask = (taskId: string): boolean => taskRegistry.hasTask(taskId);

export const getTaskSpec = (taskId: string) => taskRegistry.getTaskSpec(taskId);

export const requireTaskSpec = (taskId: string) =>
  taskRegistry.requireTaskSpec(taskId);

export const loadTaskModule = (taskId: string) =>
  taskRegistry.loadTaskModule(taskId);

export const requireTaskModule = (taskId: string) =>
  taskRegistry.requireTaskModule(taskId);

export const loadActiveStrategyResolver = async (
  configPath: string = DEFAULT_ACTIVE_STRATEGY_SELECTION_CONFIG_PATH,
  configOverride?: ActiveStrategySelectionConfig,
) => {
  if (configOverride) {
    return createActiveStrategyResolver({
      registry: taskRegistry,
      config: configOverride,
      configPath: "inline-override",
    });
  }

  const loadedConfig = await loadActiveStrategySelectionConfig(configPath);

  return createActiveStrategyResolver({
    registry: taskRegistry,
    ...loadedConfig,
  });
};
