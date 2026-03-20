import { readFile } from "node:fs/promises";

import {
  ACTIVE_STRATEGY_SELECTION_SCHEMA_VERSION,
  type ActiveStrategySelectionConfig,
  type TaskModule,
  type TaskStrategy,
} from "../runtime/contracts";
import type { TaskRegistry } from "./task-registry";

type AnyTaskModule = TaskModule<any, string>;
type AnyTaskStrategy = TaskStrategy<any, string>;

export interface LoadedActiveStrategySelectionConfig {
  config: ActiveStrategySelectionConfig;
  configPath: string;
}

export interface ResolvedActiveTaskStrategy {
  taskId: string;
  strategyId: string;
  strategy: AnyTaskStrategy;
  taskModule: AnyTaskModule;
}

export interface ActiveStrategyResolver {
  config: ActiveStrategySelectionConfig;
  configPath: string;
  listTaskIds(): readonly string[];
  getSelectedStrategyId(taskId: string): string | undefined;
  requireSelectedStrategyId(taskId: string): string;
  getResolvedSelection(
    taskId: string,
  ): ResolvedActiveTaskStrategy | undefined;
  requireResolvedSelection(taskId: string): ResolvedActiveTaskStrategy;
  resolveStrategy(taskId: string): AnyTaskStrategy | undefined;
  requireStrategy(taskId: string): AnyTaskStrategy;
}

export async function loadActiveStrategySelectionConfig(
  configPath: string,
): Promise<LoadedActiveStrategySelectionConfig> {
  const rawFile = await readFile(configPath, "utf8");
  const rawValue = JSON.parse(rawFile) as unknown;

  return {
    config: parseActiveStrategySelectionConfig(rawValue),
    configPath,
  };
}

export function parseActiveStrategySelectionConfig(
  rawValue: unknown,
): ActiveStrategySelectionConfig {
  const config = requireRecord(rawValue, "active strategy selection config");
  const schemaVersion = requireString(
    config.schemaVersion,
    'active strategy selection config field "schemaVersion"',
  );
  if (schemaVersion !== ACTIVE_STRATEGY_SELECTION_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported active strategy selection schemaVersion "${schemaVersion}". Expected "${ACTIVE_STRATEGY_SELECTION_SCHEMA_VERSION}".`,
    );
  }

  const selectionConfigId = requireNonEmptyString(
    config.selectionConfigId,
    'active strategy selection config field "selectionConfigId"',
  );
  const taskStrategies = requireStringRecord(
    config.taskStrategies,
    'active strategy selection config field "taskStrategies"',
  );
  if (Object.keys(taskStrategies).length === 0) {
    throw new Error(
      'Active strategy selection config field "taskStrategies" must include at least one task selection.',
    );
  }

  return {
    schemaVersion,
    selectionConfigId,
    taskStrategies,
  };
}

export async function createActiveStrategyResolver(params: {
  registry: TaskRegistry;
  config: ActiveStrategySelectionConfig;
  configPath: string;
}): Promise<ActiveStrategyResolver> {
  const { registry, config, configPath } = params;
  validateSelectedTasks(registry, config);

  const resolvedSelections = new Map<string, ResolvedActiveTaskStrategy>();

  for (const taskId of Object.keys(config.taskStrategies).sort()) {
    const taskModule = await registry.requireTaskModule(taskId);
    const strategyId = config.taskStrategies[taskId];
    const strategy = requireStrategyFromTaskModule(taskModule, strategyId);

    resolvedSelections.set(taskId, {
      taskId,
      strategyId,
      strategy,
      taskModule,
    });
  }

  const getResolvedSelection = (
    taskId: string,
  ): ResolvedActiveTaskStrategy | undefined => resolvedSelections.get(taskId);

  const requireResolvedSelection = (
    taskId: string,
  ): ResolvedActiveTaskStrategy => {
    const selection = getResolvedSelection(taskId);
    if (!selection) {
      throw new Error(
        `Task "${taskId}" is not pinned in active strategy config "${config.selectionConfigId}" (${configPath}).`,
      );
    }

    return selection;
  };

  return {
    config,
    configPath,
    listTaskIds: () => registry.listTaskIds(),
    getSelectedStrategyId: (taskId: string) => config.taskStrategies[taskId],
    requireSelectedStrategyId: (taskId: string) =>
      requireSelectedStrategyId(config, taskId, configPath),
    getResolvedSelection,
    requireResolvedSelection,
    resolveStrategy: (taskId: string) => getResolvedSelection(taskId)?.strategy,
    requireStrategy: (taskId: string) =>
      requireResolvedSelection(taskId).strategy,
  };
}

function validateSelectedTasks(
  registry: TaskRegistry,
  config: ActiveStrategySelectionConfig,
): void {
  const selectedTaskIds = Object.keys(config.taskStrategies).sort();

  const unknownTaskIds = selectedTaskIds.filter((taskId) => !registry.hasTask(taskId));
  if (unknownTaskIds.length > 0) {
    throw new Error(
      `Active strategy config "${config.selectionConfigId}" contains unknown taskIds: ${unknownTaskIds.join(", ")}.`,
    );
  }

  const implementedTaskIds = registry.taskSpecs
    .filter((task) => task.implementationStatus !== "placeholder")
    .map((task) => task.taskId)
    .sort();
  const missingTaskIds = implementedTaskIds.filter(
    (taskId) => !(taskId in config.taskStrategies),
  );
  if (missingTaskIds.length > 0) {
    throw new Error(
      `Active strategy config "${config.selectionConfigId}" is missing taskIds: ${missingTaskIds.join(", ")}.`,
    );
  }
}

function requireSelectedStrategyId(
  config: ActiveStrategySelectionConfig,
  taskId: string,
  configPath: string,
): string {
  const strategyId = config.taskStrategies[taskId];
  if (!strategyId) {
    throw new Error(
      `Task "${taskId}" is not pinned in active strategy config "${config.selectionConfigId}" (${configPath}).`,
    );
  }

  return strategyId;
}

function requireStrategyFromTaskModule(
  taskModule: AnyTaskModule,
  strategyId: string,
): AnyTaskStrategy {
  const matches = taskModule.strategies.filter(
    (strategy) => strategy.strategyId === strategyId,
  );

  if (matches.length === 0) {
    throw new Error(
      `Task "${taskModule.task.taskId}" does not export selected strategy "${strategyId}".`,
    );
  }

  if (matches.length > 1) {
    throw new Error(
      `Task "${taskModule.task.taskId}" exported selected strategy "${strategyId}" more than once.`,
    );
  }

  if (matches[0].taskId !== taskModule.task.taskId) {
    throw new Error(
      `Selected strategy "${strategyId}" declared taskId "${matches[0].taskId}" instead of "${taskModule.task.taskId}".`,
    );
  }

  return matches[0];
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

function requireStringRecord(
  value: unknown,
  label: string,
): Record<string, string> {
  const record = requireRecord(value, label);
  const parsed: Record<string, string> = {};

  for (const [key, entryValue] of Object.entries(record)) {
    const normalizedKey = key.trim();
    if (normalizedKey.length === 0) {
      throw new Error(`Expected ${label} keys to be non-empty strings.`);
    }

    parsed[normalizedKey] = requireNonEmptyString(
      entryValue,
      `${label}.${normalizedKey}`,
    );
  }

  return parsed;
}
