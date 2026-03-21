import assert from "node:assert/strict";
import test from "node:test";

import { formatResetReportForResearch } from "../sandbox/cleanup";

test("formatResetReportForResearch preserves verifier-compatible reset fields", () => {
  const result = formatResetReportForResearch({
    taskId: "06",
    strategyId: "06.create-employee.v1",
    report: {
      schemaVersion: "tripletex2.sandbox-reset-report.v1",
      reportId: "sandbox-reset-1",
      createdAt: "2026-03-21T22:10:00.000Z",
      dryRun: false,
      scannedFiles: 3,
      discoveredRefs: [],
      actionResults: [],
      summary: {
        completed: 0,
        failed: 0,
        skipped: 0,
        alreadyClean: 0,
      },
    },
    reportPath: "research/sandbox/reset/sandbox-reset-1.json",
    durationMs: 25,
  });

  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /research sandbox reset summary:/);
  assert.match(result.stdout, /reportPath/);
  assert.equal(result.durationMs, 25);
});
