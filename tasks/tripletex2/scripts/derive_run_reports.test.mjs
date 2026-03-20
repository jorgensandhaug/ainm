import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  RUN_ARTIFACT_SCHEMA_VERSION,
  deriveRunReports,
  writeRunReports,
} from "./lib/derive-run-reports.mjs";

test("deriveRunReports groups matched legacy attribution into the canonical task bucket", async (t) => {
  const runsDir = await fs.mkdtemp(path.join(os.tmpdir(), "tripletex2-runs-"));
  t.after(async () => {
    await fs.rm(runsDir, { recursive: true, force: true });
  });

  await writeArtifact(
    path.join(runsDir, "2026-03-20", "run-legacy-estimated.json"),
    createArtifact({
      runId: "legacy-tripletex1-prod-2026-03-20-foo",
      createdAt: "2026-03-20T10:00:00Z",
      task: {
        taskId: "legacy-tripletex1-unattributed",
        taskName: "Legacy Tripletex1 unattributed task",
        taskSource: "replay-label",
      },
      strategy: {
        strategyId: "legacy-tripletex1-multi-script-run",
        strategyName: "Legacy multi-script run",
        strategyPath: "legacy/scripts",
        strategyStatus: "baseline",
      },
      attribution: {
        status: "matched",
        attributedTaskId: "create-product",
        source: "leaderboard-diff",
        confidence: "high",
        taskIdMatchesDeclared: false,
      },
      evaluation: {
        status: "estimated",
        source: "competition-ui",
        scoreTotal: 3.25,
        taskSolved: true,
      },
    }),
  );

  await writeArtifact(
    path.join(runsDir, "2026-03-20", "run-native-scored.json"),
    createArtifact({
      runId: "run-native-product",
      createdAt: "2026-03-20T11:00:00Z",
      task: {
        taskId: "create-product",
        taskName: "Create product",
        taskSource: "manual-label",
      },
      strategy: {
        strategyId: "create-product.direct",
        strategyName: "Direct create product",
        strategyPath: "src/tasks/task-create-product/strategies/direct.ts",
        strategyStatus: "active",
      },
      evaluation: {
        status: "scored",
        source: "submission-score",
        scoreTotal: 2.5,
        correctnessScore: 0.9,
        taskSolved: false,
      },
      execution: {
        runtimeStatus: "completed",
        apiCallCount: 4,
        api4xxCount: 0,
        api5xxCount: 0,
        apiCalls: [],
      },
    }),
  );

  const derived = await deriveRunReports({ runsDir });
  const createProduct = derived.reports.taskStatus.tasks.find(
    (task) => task.taskId === "create-product",
  );

  assert.ok(createProduct);
  assert.equal(createProduct.txTaskId, "04");
  assert.equal(createProduct.runCount, 2);
  assert.equal(createProduct.status, "solved-estimated");
  assert.equal(createProduct.sourceCoverage.sourceMix, "combined");
  assert.equal(createProduct.sourceCoverage.hasNativeRuns, true);
  assert.equal(createProduct.sourceCoverage.hasLegacyImportRuns, true);
  assert.equal(createProduct.bestKnownRun?.runId, "legacy-tripletex1-prod-2026-03-20-foo");
  assert.equal(createProduct.bestKnownRun?.evidenceClass, "estimated");
  assert.equal(createProduct.bestVerifiedRun?.runId, "run-native-product");
  assert.equal(createProduct.bestVerifiedRun?.evidenceClass, "scored");
  assert.equal(createProduct.bestNativeRun?.runId, "run-native-product");
  assert.equal(
    createProduct.bestLegacyImportRun?.runId,
    "legacy-tripletex1-prod-2026-03-20-foo",
  );
  assert.match(createProduct.statusHeadline, /combined live\+native/i);
  assert.equal(createProduct.bestKnownEvidence?.evidenceClass, "estimated");
  assert.equal(createProduct.bestDirectEvidence?.evidenceClass, "scored");
  assert.match(createProduct.bestKnownEvidence?.summary ?? "", /live-imported estimated solved/i);
  assert.equal(
    createProduct.optimizationTarget?.category,
    "verify-estimated-solve",
  );
});

test("writeRunReports writes deterministic top-level reports and includes zero-run registered tasks", async (t) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "tripletex2-reporting-"));
  const runsDir = path.join(tempDir, "runs");
  const reportsDir = path.join(tempDir, "reports");
  t.after(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  await writeArtifact(
    path.join(runsDir, "2026-03-20", "run-native-invoice.json"),
    createArtifact({
      runId: "run-native-invoice",
      createdAt: "2026-03-20T12:00:00Z",
      task: {
        taskId: "create-and-send-invoice",
        taskName: "Create and send invoice",
        taskSource: "manual-label",
      },
      strategy: {
        strategyId: "create-and-send-invoice.order-then-send",
        strategyName: "Order then send",
        strategyPath: "src/tasks/task-create-and-send-invoice/strategies/order.ts",
        strategyStatus: "active",
      },
      evaluation: {
        status: "scored",
        source: "submission-score",
        scoreTotal: 4,
        correctnessScore: 1,
        taskSolved: true,
      },
    }),
  );

  const derived = await writeRunReports({ runsDir, reportsDir });
  const taskStatus = JSON.parse(
    await fs.readFile(path.join(reportsDir, "task-status.json"), "utf8"),
  );
  const openTasks = JSON.parse(
    await fs.readFile(path.join(reportsDir, "open-tasks.json"), "utf8"),
  );
  const strategyComparison = JSON.parse(
    await fs.readFile(path.join(reportsDir, "strategy-comparison.json"), "utf8"),
  );
  const strategyComparisonMarkdown = await fs.readFile(
    path.join(reportsDir, "strategy-comparison.md"),
    "utf8",
  );
  const taskStatusMarkdown = await fs.readFile(
    path.join(reportsDir, "task-status.md"),
    "utf8",
  );
  const openTasksMarkdown = await fs.readFile(
    path.join(reportsDir, "open-tasks.md"),
    "utf8",
  );
  const productFrontier = JSON.parse(
    await fs.readFile(
      path.join(reportsDir, "task-frontiers", "create-product.json"),
      "utf8",
    ),
  );

  assert.equal(taskStatus.reportSchemaVersion, "tripletex2.run-reports.v1");
  assert.equal(taskStatus.summary.solvedScoredTasks, 1);
  assert.equal(taskStatus.summary.tasksWithNativeRuns, 1);
  assert.equal(taskStatus.source.nativeArtifactCount, 1);
  assert.equal(taskStatus.source.legacyImportArtifactCount, 0);
  assert.ok(
    taskStatus.tasks.some(
      (task) =>
        task.taskId === "create-product" &&
        task.txTaskId === "04" &&
        task.status === "not-run",
    ),
  );
  assert.ok(
    openTasks.tasks.some(
      (task) =>
        task.taskId === "create-product" &&
        task.txTaskId === "04" &&
        task.openCategory === "missing-coverage",
    ),
  );
  assert.equal(
    strategyComparison.tasks.find((task) => task.taskId === "create-and-send-invoice")
      ?.txTaskId,
    "08",
  );
  assert.equal(
    strategyComparison.reportSchemaVersion,
    "tripletex2.run-reports.v1",
  );
  assert.match(strategyComparisonMarkdown, /# Strategy Comparison/);
  assert.match(
    strategyComparisonMarkdown,
    /\| Task \| Status \| Sources \| Current best \| Verified best \|/,
  );
  assert.match(strategyComparisonMarkdown, /\[08\] create-and-send-invoice/);
  assert.match(taskStatusMarkdown, /# Combined Task Status/);
  assert.match(taskStatusMarkdown, /\[04\] create-product/);
  assert.match(taskStatusMarkdown, /combined live\+native evidence|Tasks with native runs/);
  assert.match(openTasksMarkdown, /# Open Optimization Targets/);
  assert.match(openTasksMarkdown, /\[04\] create-product/);
  assert.match(openTasksMarkdown, /Target: Add first canonical run coverage/);
  assert.equal(productFrontier.task.taskId, "create-product");
  assert.equal(productFrontier.task.txTaskId, "04");
  assert.equal(productFrontier.task.frontier.length, 0);
  assert.equal(
    derived.reports.strategyFrontiers.tasks.find(
      (task) => task.taskId === "create-and-send-invoice",
    )?.txTaskId,
    "08",
  );
  assert.equal(derived.reports.strategyFrontiers.tasks.length, taskStatus.tasks.length);
  assert.equal(derived.reports.openTasks.summary.highestPriorityOpenTasks > 0, true);
});

test("deriveRunReports ranks strategies by score then api-call count and keeps verified leader separate", async (t) => {
  const runsDir = await fs.mkdtemp(path.join(os.tmpdir(), "tripletex2-strategy-compare-"));
  t.after(async () => {
    await fs.rm(runsDir, { recursive: true, force: true });
  });

  await writeArtifact(
    path.join(runsDir, "2026-03-20", "run-estimated-leader.json"),
    createArtifact({
      runId: "run-estimated-leader",
      createdAt: "2026-03-20T10:00:00Z",
      task: {
        taskId: "create-and-send-invoice",
        taskName: "Create and send invoice",
        taskSource: "manual-label",
      },
      strategy: {
        strategyId: "create-and-send-invoice.estimated",
        strategyName: "Estimated leader",
        strategyPath: "src/tasks/task-create-and-send-invoice/strategies/estimated.ts",
        strategyStatus: "active",
      },
      evaluation: {
        status: "estimated",
        source: "local-estimate",
        scoreTotal: 4.5,
        correctnessScore: 1,
        taskSolved: true,
      },
      execution: {
        runtimeStatus: "completed",
        apiCallCount: 9,
        api4xxCount: 0,
        api5xxCount: 0,
        apiCalls: [],
      },
    }),
  );

  await writeArtifact(
    path.join(runsDir, "2026-03-20", "run-verified-faster.json"),
    createArtifact({
      runId: "run-verified-faster",
      createdAt: "2026-03-20T11:00:00Z",
      task: {
        taskId: "create-and-send-invoice",
        taskName: "Create and send invoice",
        taskSource: "manual-label",
      },
      strategy: {
        strategyId: "create-and-send-invoice.direct-fast",
        strategyName: "Direct fast",
        strategyPath: "src/tasks/task-create-and-send-invoice/strategies/direct-fast.ts",
        strategyStatus: "active",
      },
      evaluation: {
        status: "scored",
        source: "submission-score",
        scoreTotal: 4,
        correctnessScore: 1,
        taskSolved: true,
      },
      execution: {
        runtimeStatus: "completed",
        apiCallCount: 2,
        api4xxCount: 0,
        api5xxCount: 0,
        apiCalls: [],
      },
    }),
  );

  await writeArtifact(
    path.join(runsDir, "2026-03-20", "run-verified-slower.json"),
    createArtifact({
      runId: "run-verified-slower",
      createdAt: "2026-03-20T12:00:00Z",
      task: {
        taskId: "create-and-send-invoice",
        taskName: "Create and send invoice",
        taskSource: "manual-label",
      },
      strategy: {
        strategyId: "create-and-send-invoice.direct-slow",
        strategyName: "Direct slow",
        strategyPath: "src/tasks/task-create-and-send-invoice/strategies/direct-slow.ts",
        strategyStatus: "active",
      },
      evaluation: {
        status: "scored",
        source: "submission-score",
        scoreTotal: 4,
        correctnessScore: 1,
        taskSolved: true,
      },
      execution: {
        runtimeStatus: "completed",
        apiCallCount: 5,
        api4xxCount: 0,
        api5xxCount: 0,
        apiCalls: [],
      },
    }),
  );

  const derived = await deriveRunReports({ runsDir });
  const comparisonTask = derived.reports.strategyComparison.tasks.find(
    (task) => task.taskId === "create-and-send-invoice",
  );
  const bestStrategiesTask = derived.reports.bestStrategies.tasks.find(
    (task) => task.taskId === "create-and-send-invoice",
  );

  assert.ok(comparisonTask);
  assert.deepEqual(
    comparisonTask.rankedStrategies.map((strategy) => strategy.strategyId),
    [
      "create-and-send-invoice.estimated",
      "create-and-send-invoice.direct-fast",
      "create-and-send-invoice.direct-slow",
    ],
  );
  assert.equal(
    comparisonTask.bestKnownStrategy?.strategyId,
    "create-and-send-invoice.estimated",
  );
  assert.equal(comparisonTask.txTaskId, "08");
  assert.equal(
    comparisonTask.bestVerifiedStrategy?.strategyId,
    "create-and-send-invoice.direct-fast",
  );
  assert.equal(comparisonTask.leaderEvidenceClass, "estimated");
  assert.equal(comparisonTask.leaderNeedsVerification, true);
  assert.equal(comparisonTask.sourceCoverage.sourceMix, "native-only");
  assert.equal(bestStrategiesTask.txTaskId, "08");
  assert.equal(bestStrategiesTask.bestKnownStrategy?.strategyId, "create-and-send-invoice.estimated");
  assert.equal(bestStrategiesTask.bestVerifiedStrategy?.strategyId, "create-and-send-invoice.direct-fast");
});

async function writeArtifact(filePath, artifact) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
}

function createArtifact(overrides = {}) {
  return {
    schemaVersion: RUN_ARTIFACT_SCHEMA_VERSION,
    runId: "run-sample",
    createdAt: "2026-03-20T00:00:00Z",
    mode: "sandbox",
    task: {
      taskId: "create-and-send-invoice",
      taskName: "Create and send invoice",
      taskSource: "manual-label",
    },
    strategy: {
      strategyId: "sample-strategy",
      strategyName: "Sample strategy",
      strategyPath: "src/tasks/sample.ts",
      strategyStatus: "active",
    },
    selection: {
      selectionConfigId: "active-strategies-test",
      selectionConfigPath: "configs/active-strategies.json",
    },
    request: {
      requestFingerprint: "req:test",
      files: [],
    },
    input: {
      inputSchemaId: "test.v1",
      status: "resolved",
      source: "fixture",
      value: {},
    },
    execution: {
      runtimeStatus: "completed",
      apiCallCount: 1,
      api4xxCount: 0,
      api5xxCount: 0,
      apiCalls: [],
      durationMs: 1000,
    },
    ...overrides,
  };
}
