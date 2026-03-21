import assert from "node:assert/strict";
import test from "node:test";

import {
  CANONICAL_TASK_REGISTRY,
  slugToTxTaskId,
  txTaskIdToSlug,
} from "./legacy-tripletex1-task-bridge";
import {
  getTaskSpec,
  loadTaskModule,
  taskRegistrations,
  taskRegistry,
} from "./tasks";

test("task registrations seed every canonical task id exactly once", () => {
  assert.equal(CANONICAL_TASK_REGISTRY.length, 18);
  assert.deepEqual(
    taskRegistrations.map((registration) => registration.task.taskId),
    CANONICAL_TASK_REGISTRY.map((task) => task.taskId),
  );
  assert.deepEqual(
    taskRegistry.listTaskIds(),
    CANONICAL_TASK_REGISTRY.map((task) => task.taskId),
  );
  assert.deepEqual(
    CANONICAL_TASK_REGISTRY.map((task) => task.txTaskId),
    [
      "01",
      "02",
      "03",
      "04",
      "05",
      "06",
      "07",
      "08",
      "09",
      "10",
      "11",
      "12",
      "13",
      "14",
      "15",
      "16",
      "17",
      "18",
    ],
  );
});

test("newly surfaced canonical tasks load real modules and strategies", async () => {
  const taskSpec = getTaskSpec("03");
  assert.ok(taskSpec);
  assert.equal(taskSpec.implementationStatus, "implemented");
  assert.equal(taskSpec.txTaskId, "03");
  assert.equal(taskSpec.inputSchemaId, "03.v1");
  assert.deepEqual(taskSpec.requiredFields, ["departmentNames"]);

  const taskModule = await loadTaskModule("03");
  assert.ok(taskModule);
  assert.deepEqual(
    taskModule.strategies.map((strategy) => strategy.strategyId),
    ["03.direct-create-departments.v1"],
  );
});

test("every canonical task now loads a task module with at least one strategy", async () => {
  for (const canonicalTask of CANONICAL_TASK_REGISTRY) {
    const taskModule = await loadTaskModule(canonicalTask.taskId);
    assert.ok(taskModule, canonicalTask.taskId);
    assert.equal(taskModule.task.taskId, canonicalTask.taskId);
    assert.ok(
      taskModule.strategies.length >= 1,
      `Expected at least one strategy for ${canonicalTask.taskId}.`,
    );
  }
});

test("implemented task remains the real registered task module", async () => {
  const taskSpec = getTaskSpec("08");
  assert.ok(taskSpec);
  assert.equal(taskSpec.implementationStatus, "implemented");
  assert.equal(taskSpec.txTaskId, "08");

  const taskModule = await loadTaskModule("08");
  assert.ok(taskModule);
  assert.equal(taskModule.task.taskId, "08");
  assert.deepEqual(
    taskModule.strategies.map((strategy) => strategy.strategyId),
    [
      "08.order-then-invoice-send.v1",
      "08.order-then-invoice-then-send.v1",
    ],
  );
});

test("registry exposes bidirectional tx task id lookups", () => {
  assert.equal(txTaskIdToSlug["03"], "create-department");
  assert.equal(txTaskIdToSlug["08"], "create-and-send-invoice");
  assert.equal(slugToTxTaskId["create-department"], "03");
  assert.equal(slugToTxTaskId["create-and-send-invoice"], "08");

  for (const task of CANONICAL_TASK_REGISTRY) {
    assert.equal(txTaskIdToSlug[task.txTaskId], task.taskSlug);
    assert.equal(slugToTxTaskId[task.taskSlug], task.txTaskId);
  }
});
