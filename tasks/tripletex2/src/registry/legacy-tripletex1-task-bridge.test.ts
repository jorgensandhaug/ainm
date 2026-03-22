import assert from "node:assert/strict";
import test from "node:test";

import {
  CANONICAL_TASK_REGISTRY,
  LEGACY_TRIPLETEX1_TASK_BRIDGE,
  slugToTxTaskId,
  txTaskIdToSlug,
} from "./legacy-tripletex1-task-bridge";

const EXPECTED_CANONICAL_MAPPING = [
  ["02", "create-customer"],
  ["04", "create-supplier"],
  ["05", "create-department"],
  ["03", "create-product"],
  ["08", "create-project"],
  ["01", "create-employee"],
  ["17", "create-accounting-dimension-and-post-voucher"],
  ["06", "create-and-send-invoice"],
  ["09", "create-customer-invoice"],
  ["14", "issue-full-credit-note"],
  ["10", "create-order-invoice-and-register-payment"],
  ["12", "run-payroll-with-bonus"],
  ["13", "register-travel-expense"],
  ["15", "set-project-fixed-price-and-invoice-milestone"],
  ["16", "register-project-hours-and-create-project-invoice"],
  ["11", "register-supplier-invoice"],
  ["07", "register-customer-invoice-payment"],
  ["18", "reverse-customer-invoice-payment"],
  ["19", "onboard-employee-from-contract"],
  ["20", "register-supplier-invoice-pdf"],
  ["21", "onboard-employee-offer-letter"],
  ["22", "register-receipt-expense-voucher"],
  ["23", "reconcile-bank-statement"],
  ["24", "correct-ledger-errors"],
  ["25", "overdue-reminder-fee-and-partial-payment"],
  ["26", "monthly-closing"],
  ["27", "register-foreign-currency-payment-with-exchange-gain"],
  ["28", "analyze-expense-increase-create-internal-projects"],
  ["29", "full-project-lifecycle"],
  ["30", "simplified-annual-closing"],
] as const;

test("canonical registry matches the fixed tx_task_id numbering", () => {
  assert.deepEqual(
    CANONICAL_TASK_REGISTRY.map((task) => [task.txTaskId, task.taskSlug]),
    EXPECTED_CANONICAL_MAPPING,
  );
});

test("legacy bridge maps every tx_task_id to the correct canonical task id", () => {
  const expectedBridgeMapping: [string, string][] = [
    ["02", "01"], ["04", "02"], ["05", "03"], ["03", "04"],
    ["08", "05"], ["01", "06"], ["17", "07"], ["06", "08"],
    ["09", "09"], ["14", "10"], ["10", "11"], ["12", "12"],
    ["13", "13"], ["15", "14"], ["16", "15"], ["11", "16"],
    ["07", "17"], ["18", "18"], ["19", "19"], ["20", "20"],
    ["21", "21"], ["22", "22"], ["23", "23"], ["24", "24"],
    ["25", "25"], ["26", "26"], ["27", "27"], ["28", "28"],
    ["29", "29"], ["30", "30"],
  ];
  for (const [txTaskId, canonicalTaskId] of expectedBridgeMapping) {
    assert.equal(
      LEGACY_TRIPLETEX1_TASK_BRIDGE[txTaskId]?.canonicalTaskId,
      canonicalTaskId,
      `tx_task_id ${txTaskId} should map to canonical task ${canonicalTaskId}`,
    );
  }
});

test("txTaskId and slug lookups are bidirectional", () => {
  for (const [txTaskId, taskSlug] of EXPECTED_CANONICAL_MAPPING) {
    assert.equal(txTaskIdToSlug[txTaskId], taskSlug);
    assert.equal(slugToTxTaskId[taskSlug], txTaskId);
  }
});

test("prod48 evidence: txTaskId mapping matches production run observations", () => {
  // Each entry: [txTaskId seen in leaderboard, prompt keyword pattern, expected canonical taskId]
  // Evidence source: unique_attempt_delta runs from prod48 wave (2026-03-21/22)
  const prod48Evidence: [string, string, string][] = [
    ["01", "create employee", "06"],
    ["02", "create customer", "01"],
    ["03", "create product", "04"],
    ["04", "register supplier", "02"],
    ["05", "create departments", "03"],
    ["06", "create and send invoice", "08"],
    ["07", "register full payment", "17"],
    ["08", "create project", "05"],
    ["09", "three product lines mixed VAT", "09"],
    ["10", "order then invoice then payment", "11"],
    ["11", "supplier invoice INV-2026", "16"],
    ["12", "payroll with bonus", "12"],
    ["13", "travel expense per diem", "13"],
    ["14", "full credit note / Gutschrift", "10"],
    ["15", "fixed price milestone", "14"],
    ["16", "register hours project invoice", "15"],
    ["17", "accounting dimension voucher", "07"],
    ["18", "returned by bank / reverse", "18"],
  ];
  for (const [txTaskId, _evidence, expectedCanonicalId] of prod48Evidence) {
    const bridgeEntry = LEGACY_TRIPLETEX1_TASK_BRIDGE[txTaskId];
    assert.ok(bridgeEntry, `Missing bridge entry for tx_task_id ${txTaskId}`);
    assert.equal(
      bridgeEntry.canonicalTaskId,
      expectedCanonicalId,
      `tx_task_id ${txTaskId} (${_evidence}) should bridge to canonical ${expectedCanonicalId}`,
    );
  }
});
