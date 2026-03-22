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
  assert.equal(CANONICAL_TASK_REGISTRY.length, 30);
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
      "02", // 01 create-customer
      "04", // 02 create-supplier
      "05", // 03 create-department
      "03", // 04 create-product
      "08", // 05 create-project
      "01", // 06 create-employee
      "17", // 07 create-accounting-dimension-and-post-voucher
      "06", // 08 create-and-send-invoice
      "09", // 09 create-customer-invoice
      "14", // 10 issue-full-credit-note
      "10", // 11 create-order-invoice-and-register-payment
      "12", // 12 run-payroll-with-bonus
      "13", // 13 register-travel-expense
      "15", // 14 set-project-fixed-price-and-invoice-milestone
      "16", // 15 register-project-hours-and-create-project-invoice
      "11", // 16 register-supplier-invoice
      "07", // 17 register-customer-invoice-payment
      "18", // 18 reverse-customer-invoice-payment
      "19", // 19 onboard-employee-from-contract
      "20", // 20 register-supplier-invoice-pdf
      "21", // 21 onboard-employee-offer-letter
      "22", // 22 register-receipt-expense-voucher
      "23", // 23 reconcile-bank-statement
      "24", // 24 correct-ledger-errors
      "25", // 25 overdue-reminder-fee-and-partial-payment
      "26", // 26 monthly-closing
      "27", // 27 register-foreign-currency-payment-with-exchange-gain
      "28", // 28 analyze-expense-increase-create-internal-projects
      "29", // 29 full-project-lifecycle
      "30", // 30 simplified-annual-closing
    ],
  );
});

test("newly surfaced canonical tasks load real modules and strategies", async () => {
  const taskSpec = getTaskSpec("03");
  assert.ok(taskSpec);
  assert.equal(taskSpec.implementationStatus, "implemented");
  assert.equal(taskSpec.txTaskId, "05");
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

test("canonical registry metadata matches the registered task specs", () => {
  for (const canonicalTask of CANONICAL_TASK_REGISTRY) {
    const taskSpec = getTaskSpec(canonicalTask.taskId);
    assert.ok(taskSpec, canonicalTask.taskId);
    assert.equal(
      taskSpec?.taskName,
      canonicalTask.taskName,
      `taskName mismatch for ${canonicalTask.taskId}`,
    );
    assert.equal(
      taskSpec?.summary,
      canonicalTask.summary,
      `summary mismatch for ${canonicalTask.taskId}`,
    );
  }
});

test("implemented task remains the real registered task module", async () => {
  const taskSpec = getTaskSpec("08");
  assert.ok(taskSpec);
  assert.equal(taskSpec.implementationStatus, "implemented");
  assert.equal(taskSpec.txTaskId, "06");

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

test("task 19 now loads the contract-onboarding strategy", async () => {
  const taskModule = await loadTaskModule("19");
  assert.equal(taskModule.task.taskName, "Onboard employee from contract");
  assert.deepEqual(
    taskModule.strategies.map((strategy) => strategy.strategyId),
    ["19.onboard-employee-from-contract.v1"],
  );
});

test("task 21 loads the offer-letter onboarding strategy", async () => {
  const taskModule = await loadTaskModule("21");
  assert.equal(taskModule.task.taskName, "Onboard employee from offer letter");
  assert.deepEqual(
    taskModule.strategies.map((strategy) => strategy.strategyId),
    ["21.onboard-employee-offer-letter.v1"],
  );
});

test("registry exposes bidirectional tx task id lookups", () => {
  assert.equal(txTaskIdToSlug["05"], "create-department");
  assert.equal(txTaskIdToSlug["06"], "create-and-send-invoice");
  assert.equal(slugToTxTaskId["create-department"], "05");
  assert.equal(slugToTxTaskId["create-and-send-invoice"], "06");

  for (const task of CANONICAL_TASK_REGISTRY) {
    assert.equal(txTaskIdToSlug[task.txTaskId], task.taskSlug);
    assert.equal(slugToTxTaskId[task.taskSlug], task.txTaskId);
  }
});
