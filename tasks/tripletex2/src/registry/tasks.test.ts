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

test("unimplemented canonical tasks load as honest placeholders", async () => {
  const placeholderSpec = getTaskSpec("create-department");
  assert.ok(placeholderSpec);
  assert.equal(placeholderSpec.implementationStatus, "placeholder");
  assert.equal(placeholderSpec.txTaskId, "03");
  assert.equal(placeholderSpec.inputSchemaId, "create-department.placeholder.v1");
  assert.match(placeholderSpec.extractionNotes?.[0] ?? "", /Placeholder only\./);

  const placeholderTaskModule = await loadTaskModule("create-department");
  assert.ok(placeholderTaskModule);
  assert.equal(placeholderTaskModule.strategies.length, 0);
});

test("implemented task remains the real registered task module", async () => {
  const taskSpec = getTaskSpec("create-and-send-invoice");
  assert.ok(taskSpec);
  assert.equal(taskSpec.implementationStatus, "implemented");
  assert.equal(taskSpec.txTaskId, "08");

  const taskModule = await loadTaskModule("create-and-send-invoice");
  assert.ok(taskModule);
  assert.equal(taskModule.task.taskId, "create-and-send-invoice");
  assert.deepEqual(
    taskModule.strategies.map((strategy) => strategy.strategyId),
    [
      "create-and-send-invoice.order-then-invoice-send.v1",
      "create-and-send-invoice.order-then-invoice-then-send.v1",
    ],
  );
});

test("registry exposes bidirectional tx task id lookups", () => {
  assert.equal(txTaskIdToSlug["03"], "create-department");
  assert.equal(txTaskIdToSlug["08"], "create-and-send-invoice");
  assert.equal(slugToTxTaskId["create-department"], "03");
  assert.equal(slugToTxTaskId["create-and-send-invoice"], "08");

  for (const task of CANONICAL_TASK_REGISTRY) {
    assert.equal(txTaskIdToSlug[task.txTaskId], task.taskId);
    assert.equal(slugToTxTaskId[task.taskId], task.txTaskId);
  }
});
