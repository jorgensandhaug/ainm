import assert from "node:assert/strict";
import test from "node:test";

import { CANONICAL_TASK_REGISTRY } from "./legacy-tripletex1-task-bridge";
import {
  getTaskSpec,
  loadTaskModule,
  taskRegistrations,
  taskRegistry,
} from "./tasks";

test("task registrations seed every canonical task id exactly once", () => {
  assert.deepEqual(
    taskRegistrations.map((registration) => registration.task.taskId),
    CANONICAL_TASK_REGISTRY.map((task) => task.taskId),
  );
  assert.deepEqual(
    taskRegistry.listTaskIds(),
    CANONICAL_TASK_REGISTRY.map((task) => task.taskId),
  );
});

test("unimplemented canonical tasks load as honest placeholders", async () => {
  const placeholderSpec = getTaskSpec("create-employee");
  assert.ok(placeholderSpec);
  assert.equal(placeholderSpec.implementationStatus, "placeholder");
  assert.equal(placeholderSpec.inputSchemaId, "create-employee.placeholder.v1");
  assert.match(placeholderSpec.extractionNotes?.[0] ?? "", /Placeholder only\./);

  const placeholderTaskModule = await loadTaskModule("create-employee");
  assert.ok(placeholderTaskModule);
  assert.equal(placeholderTaskModule.strategies.length, 0);
});

test("implemented task remains the real registered task module", async () => {
  const taskSpec = getTaskSpec("create-and-send-invoice");
  assert.ok(taskSpec);
  assert.equal(taskSpec.implementationStatus, "implemented");

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
