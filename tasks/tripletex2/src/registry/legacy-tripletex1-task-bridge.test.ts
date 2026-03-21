import assert from "node:assert/strict";
import test from "node:test";

import {
  CANONICAL_TASK_REGISTRY,
  LEGACY_TRIPLETEX1_TASK_BRIDGE,
  slugToTxTaskId,
  txTaskIdToSlug,
} from "./legacy-tripletex1-task-bridge";

const EXPECTED_CANONICAL_MAPPING = [
  ["01", "create-customer"],
  ["02", "create-supplier"],
  ["03", "create-department"],
  ["04", "create-product"],
  ["05", "create-project"],
  ["06", "create-employee"],
  ["07", "create-accounting-dimension-and-post-voucher"],
  ["08", "create-and-send-invoice"],
  ["09", "create-customer-invoice"],
  ["10", "issue-full-credit-note"],
  ["11", "create-order-invoice-and-register-payment"],
  ["12", "run-payroll-with-bonus"],
  ["13", "register-travel-expense"],
  ["14", "set-project-fixed-price-and-invoice-milestone"],
  ["15", "register-project-hours-and-create-project-invoice"],
  ["16", "register-supplier-invoice"],
  ["17", "register-customer-invoice-payment"],
  ["18", "reverse-customer-invoice-payment"],
  ["19", "onboard-employee-from-contract"],
  ["20", "register-supplier-invoice-pdf"],
  ["21", "correct-ledger-errors-audit"],
  ["22", "register-receipt-expense-voucher"],
  ["23", "reconcile-bank-statement"],
  ["24", "correct-ledger-errors"],
  ["25", "overdue-reminder-fee-and-partial-payment"],
  ["26", "unknown-task-26"],
  ["27", "register-foreign-currency-payment-with-exchange-gain"],
  ["28", "analyze-expense-increase-create-internal-projects"],
  ["29", "full-project-lifecycle"],
  ["30", "unknown-task-30"],
] as const;

test("canonical registry matches the fixed tx_task_id numbering", () => {
  assert.deepEqual(
    CANONICAL_TASK_REGISTRY.map((task) => [task.txTaskId, task.taskSlug]),
    EXPECTED_CANONICAL_MAPPING,
  );
});

test("legacy bridge maps every tx_task_id to the canonical numeric task id", () => {
  assert.deepEqual(
    EXPECTED_CANONICAL_MAPPING.map(([txTaskId]) => [
      txTaskId,
      LEGACY_TRIPLETEX1_TASK_BRIDGE[txTaskId]?.canonicalTaskId,
    ]),
    EXPECTED_CANONICAL_MAPPING.map(([txTaskId]) => [txTaskId, txTaskId]),
  );
});

test("txTaskId and slug lookups are bidirectional", () => {
  for (const [txTaskId, taskSlug] of EXPECTED_CANONICAL_MAPPING) {
    assert.equal(txTaskIdToSlug[txTaskId], taskSlug);
    assert.equal(slugToTxTaskId[taskSlug], txTaskId);
  }
});
