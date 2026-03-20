import assert from "node:assert/strict";
import test from "node:test";

import {
  ACTIVE_STRATEGY_SELECTION_SCHEMA_VERSION,
  type TaskModule,
  type TaskRegistration,
  type TaskSpec,
  type TaskStrategy,
} from "../runtime/contracts";
import {
  createActiveStrategyResolver,
  parseActiveStrategySelectionConfig,
} from "./active-strategy-selection";
import { createTaskRegistry } from "./task-registry";

interface FakeInput {
  value: string;
}

type FakeTaskModule = TaskModule<FakeInput, string>;
type FakeTaskRegistration = TaskRegistration<FakeInput, string>;
type FakeTaskStrategy = TaskStrategy<FakeInput, string>;

test("parseActiveStrategySelectionConfig accepts the explicit config shape", () => {
  const config = parseActiveStrategySelectionConfig({
    schemaVersion: ACTIVE_STRATEGY_SELECTION_SCHEMA_VERSION,
    selectionConfigId: "active-strategies-2026-03-20-a",
    taskStrategies: {
      "task-a": "task-a.strategy-1",
    },
  });

  assert.deepEqual(config, {
    schemaVersion: ACTIVE_STRATEGY_SELECTION_SCHEMA_VERSION,
    selectionConfigId: "active-strategies-2026-03-20-a",
    taskStrategies: {
      "task-a": "task-a.strategy-1",
    },
  });
});

test("createActiveStrategyResolver resolves the pinned strategy for each task", async () => {
  const registry = createTaskRegistry([
    createFakeTaskRegistration("task-a", ["task-a.strategy-1", "task-a.strategy-2"]),
    createFakeTaskRegistration("task-b", ["task-b.strategy-1"]),
  ]);

  const resolver = await createActiveStrategyResolver({
    registry,
    configPath: "configs/active-strategies.json",
    config: {
      schemaVersion: ACTIVE_STRATEGY_SELECTION_SCHEMA_VERSION,
      selectionConfigId: "active-strategies-2026-03-20-a",
      taskStrategies: {
        "task-a": "task-a.strategy-2",
        "task-b": "task-b.strategy-1",
      },
    },
  });

  assert.equal(
    resolver.requireSelectedStrategyId("task-a"),
    "task-a.strategy-2",
  );
  assert.equal(
    resolver.requireStrategy("task-a").strategyId,
    "task-a.strategy-2",
  );
  assert.equal(
    resolver.requireResolvedSelection("task-b").strategy.strategyId,
    "task-b.strategy-1",
  );
});

test("createActiveStrategyResolver allows placeholder tasks to remain unpinned", async () => {
  const registry = createTaskRegistry([
    createFakeTaskRegistration("task-a", ["task-a.strategy-1"]),
    createFakeTaskRegistration("task-b", [], {
      implementationStatus: "placeholder",
    }),
  ]);

  const resolver = await createActiveStrategyResolver({
    registry,
    configPath: "configs/active-strategies.json",
    config: {
      schemaVersion: ACTIVE_STRATEGY_SELECTION_SCHEMA_VERSION,
      selectionConfigId: "active-strategies-2026-03-20-a",
      taskStrategies: {
        "task-a": "task-a.strategy-1",
      },
    },
  });

  assert.equal(resolver.requireStrategy("task-a").strategyId, "task-a.strategy-1");
  assert.equal(resolver.getSelectedStrategyId("task-b"), undefined);
  assert.equal(resolver.getResolvedSelection("task-b"), undefined);
});

test("createActiveStrategyResolver rejects configs that omit an implemented task", async () => {
  const registry = createTaskRegistry([
    createFakeTaskRegistration("task-a", ["task-a.strategy-1"]),
    createFakeTaskRegistration("task-b", ["task-b.strategy-1"]),
  ]);

  await assert.rejects(
    () =>
      createActiveStrategyResolver({
        registry,
        configPath: "configs/active-strategies.json",
        config: {
          schemaVersion: ACTIVE_STRATEGY_SELECTION_SCHEMA_VERSION,
          selectionConfigId: "active-strategies-2026-03-20-a",
          taskStrategies: {
            "task-a": "task-a.strategy-1",
          },
        },
      }),
    /missing taskIds: task-b/,
  );
});

test("createActiveStrategyResolver rejects unknown taskIds and stale strategyIds", async () => {
  const registry = createTaskRegistry([
    createFakeTaskRegistration("task-a", ["task-a.strategy-1"]),
  ]);

  await assert.rejects(
    () =>
      createActiveStrategyResolver({
        registry,
        configPath: "configs/active-strategies.json",
        config: {
          schemaVersion: ACTIVE_STRATEGY_SELECTION_SCHEMA_VERSION,
          selectionConfigId: "active-strategies-2026-03-20-a",
          taskStrategies: {
            "task-a": "task-a.strategy-1",
            "task-b": "task-b.strategy-1",
          },
        },
      }),
    /unknown taskIds: task-b/,
  );

  await assert.rejects(
    () =>
      createActiveStrategyResolver({
        registry,
        configPath: "configs/active-strategies.json",
        config: {
          schemaVersion: ACTIVE_STRATEGY_SELECTION_SCHEMA_VERSION,
          selectionConfigId: "active-strategies-2026-03-20-a",
          taskStrategies: {
            "task-a": "task-a.strategy-2",
          },
        },
      }),
    /does not export selected strategy "task-a.strategy-2"/,
  );
});

function createFakeTaskRegistration(
  taskId: string,
  strategyIds: readonly string[],
  options: {
    implementationStatus?: "implemented" | "placeholder";
  } = {},
): FakeTaskRegistration {
  const task = {
    taskId,
    txTaskId: taskId,
    taskName: `Task ${taskId}`,
    implementationStatus: options.implementationStatus,
    signature: `${taskId}(value)`,
    summary: `Summary for ${taskId}.`,
    inputSchemaId: `${taskId}.v1`,
    requiredFields: ["value"] as const,
  } satisfies TaskSpec<FakeInput, string>;

  const strategies = strategyIds.map<FakeTaskStrategy>((strategyId) => ({
    strategyId,
    strategyPath: `src/tasks/${taskId}/strategies/${strategyId}.ts`,
    taskId,
    name: strategyId,
    summary: `Summary for ${strategyId}.`,
    hypothesis: `Hypothesis for ${strategyId}.`,
    stepOutline: ["One deterministic step."],
    status: "draft",
    async run() {
      return {};
    },
  }));

  const taskModule: FakeTaskModule = {
    task,
    strategies,
  };

  return {
    task,
    async loadTaskModule() {
      return taskModule;
    },
  };
}
