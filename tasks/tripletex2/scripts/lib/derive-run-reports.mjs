import fs from "node:fs/promises";
import path from "node:path";

import { CANONICAL_TASK_REGISTRY } from "../import_legacy_tripletex1_outcomes.mjs";

export const RUN_ARTIFACT_SCHEMA_VERSION = "tripletex2.run-artifact.v1";
export const RUN_REPORT_SCHEMA_VERSION = "tripletex2.run-reports.v1";

const DEFAULT_RUNS_DIR = path.resolve(process.cwd(), "runs");
const DEFAULT_REPORTS_DIR = path.resolve(process.cwd(), "reports");
const COMPLETED_RUNTIME_STATUSES = new Set(["completed"]);
const KNOWN_EVALUATION_STATUSES = new Set([
  "scored",
  "estimated",
  "pending",
  "not-available",
]);

export async function deriveRunReports(options = {}) {
  const runsDir = path.resolve(options.runsDir ?? DEFAULT_RUNS_DIR);
  const taskRegistry = options.taskRegistry ?? CANONICAL_TASK_REGISTRY;
  const registryById = new Map(taskRegistry.map((task) => [task.taskId, task]));
  const artifactPaths = await listJsonFiles(runsDir);
  const runs = [];

  for (const artifactPath of artifactPaths) {
    const artifact = await readJsonFile(artifactPath);
    if (!isRunArtifact(artifact)) {
      continue;
    }

    runs.push(normalizeRunArtifact({ artifact, artifactPath, registryById }));
  }

  runs.sort(compareRunRecords);
  const observedRunSources = summarizeObservedRunSources(runs);

  const observedTaskIds = new Set(runs.map((run) => run.effectiveTaskId));
  const allTaskIds = new Set([
    ...registryById.keys(),
    ...observedTaskIds,
  ]);
  const tasks = [...allTaskIds]
    .map((taskId) => buildTaskReport({ taskId, runs, registryById }))
    .sort(compareTaskReports);

  const openTasks = tasks
    .filter((task) => task.status !== "solved-scored")
    .sort(compareOpenTasks);

  const bestStrategies = tasks.map((task) => ({
    taskId: task.taskId,
    txTaskId: task.txTaskId,
    taskName: task.taskName,
    status: task.status,
    sourceCoverage: task.sourceCoverage,
    statusHeadline: task.statusHeadline,
    bestKnownEvidence: task.bestKnownEvidence,
    bestDirectEvidence: task.bestDirectEvidence,
    bestKnownRun: task.bestKnownRun,
    bestVerifiedRun: task.bestVerifiedRun,
    bestNativeRun: task.bestNativeRun,
    bestLegacyImportRun: task.bestLegacyImportRun,
    optimizationTarget: task.optimizationTarget,
    bestKnownStrategy: task.strategyFrontier[0]
      ? toStrategyLeaderSummary(task.strategyFrontier[0], 1, "best-known")
      : null,
    bestVerifiedStrategy: selectBestVerifiedStrategy(task.strategyFrontier),
    topStrategies: task.strategyFrontier.slice(0, 3),
  }));

  const strategyFrontiers = tasks.map((task) => ({
    taskId: task.taskId,
    txTaskId: task.txTaskId,
    taskName: task.taskName,
    status: task.status,
    openReason: task.openReason,
    bestKnownRun: task.bestKnownRun,
    bestVerifiedRun: task.bestVerifiedRun,
    frontier: task.runFrontier,
    strategyFrontier: task.strategyFrontier,
  }));
  const strategyComparisons = tasks.map(buildStrategyComparisonReport);

  const generatedAt = new Date().toISOString();
  const source = {
    runsDir: relativizeToCwd(runsDir),
    canonicalArtifactCount: runs.length,
    nativeArtifactCount: observedRunSources.nativeArtifactCount,
    legacyImportArtifactCount: observedRunSources.legacyImportArtifactCount,
    observedTaskCount: [...observedTaskIds].length,
    registeredTaskCount: registryById.size,
  };
  const scoringPolicy = {
    taskBucketing:
      "Use attribution.attributedTaskId only when attribution.status is matched; otherwise keep the declared task.taskId.",
    bestKnownRanking: [
      "Prefer taskSolved=true over unsolved or unknown outcomes.",
      "When correctnessScore exists, higher correctnessScore ranks first.",
      "When scoreTotal exists, higher scoreTotal ranks first.",
      "Lower apiCallCount ranks ahead of higher apiCallCount when score metrics tie.",
      "Direct scored evidence ranks above estimated evidence, which ranks above unscored runs when metrics tie or are absent.",
      "Completed runs rank above failed, timeout, aborted, or not-run outcomes.",
      "Lower durationMs breaks remaining ties.",
      "Newer createdAt and then lexical runId make ties deterministic.",
    ],
    scoreEvidence: {
      scored:
        "Direct score evidence recorded in the canonical evaluation block.",
      estimated:
        "Estimated score evidence. This includes legacy leaderboard-delta imports and local estimates, and it is never counted as direct verification.",
      unscored:
        "No comparable score evidence was recorded in the canonical evaluation block.",
    },
  };

  return {
    generatedAt,
    source,
    scoringPolicy,
    runs,
    tasks,
    reports: {
      taskStatus: {
        reportSchemaVersion: RUN_REPORT_SCHEMA_VERSION,
        generatedAt,
        source,
        scoringPolicy,
        summary: summarizeTaskStatuses(tasks),
        tasks: tasks.map(toTaskStatusEntry),
      },
      bestStrategies: {
        reportSchemaVersion: RUN_REPORT_SCHEMA_VERSION,
        generatedAt,
        source,
        scoringPolicy,
        tasks: bestStrategies,
      },
      strategyComparison: {
        reportSchemaVersion: RUN_REPORT_SCHEMA_VERSION,
        generatedAt,
        source,
        scoringPolicy,
        summary: summarizeStrategyComparisons(strategyComparisons),
        tasks: strategyComparisons,
      },
      openTasks: {
        reportSchemaVersion: RUN_REPORT_SCHEMA_VERSION,
        generatedAt,
        source,
        scoringPolicy,
        summary: summarizeOpenTasks(openTasks),
        tasks: openTasks.map(toTaskStatusEntry),
      },
      strategyFrontiers: {
        reportSchemaVersion: RUN_REPORT_SCHEMA_VERSION,
        generatedAt,
        source,
        scoringPolicy,
        tasks: strategyFrontiers,
      },
      taskFrontiers: strategyFrontiers.map((task) => ({
        fileName: `${safeReportName(task.taskId)}.json`,
        report: {
          reportSchemaVersion: RUN_REPORT_SCHEMA_VERSION,
          generatedAt,
          source,
          scoringPolicy,
          task,
        },
      })),
    },
    rendered: {
      taskStatusMarkdown: formatTaskStatusMarkdown({
        generatedAt,
        source,
        scoringPolicy,
        tasks,
      }),
      openTasksMarkdown: formatOpenTasksMarkdown({
        generatedAt,
        source,
        scoringPolicy,
        openTasks,
      }),
      strategyComparisonMarkdown: formatStrategyComparisonMarkdown({
        generatedAt,
        source,
        scoringPolicy,
        strategyComparisons,
      }),
    },
  };
}

export async function writeRunReports(options = {}) {
  const reportsDir = path.resolve(options.reportsDir ?? DEFAULT_REPORTS_DIR);
  const derived = await deriveRunReports(options);

  await fs.mkdir(reportsDir, { recursive: true });
  await writeJsonFile(
    path.join(reportsDir, "task-status.json"),
    derived.reports.taskStatus,
  );
  await writeJsonFile(
    path.join(reportsDir, "best-strategies.json"),
    derived.reports.bestStrategies,
  );
  await writeJsonFile(
    path.join(reportsDir, "strategy-comparison.json"),
    derived.reports.strategyComparison,
  );
  await writeJsonFile(
    path.join(reportsDir, "open-tasks.json"),
    derived.reports.openTasks,
  );
  await writeJsonFile(
    path.join(reportsDir, "strategy-frontiers.json"),
    derived.reports.strategyFrontiers,
  );

  const taskFrontiersDir = path.join(reportsDir, "task-frontiers");
  await fs.mkdir(taskFrontiersDir, { recursive: true });
  for (const taskFrontier of derived.reports.taskFrontiers) {
    await writeJsonFile(
      path.join(taskFrontiersDir, taskFrontier.fileName),
      taskFrontier.report,
    );
  }
  await fs.writeFile(
    path.join(reportsDir, "task-status.md"),
    derived.rendered.taskStatusMarkdown,
    "utf8",
  );
  await fs.writeFile(
    path.join(reportsDir, "open-tasks.md"),
    derived.rendered.openTasksMarkdown,
    "utf8",
  );
  await fs.writeFile(
    path.join(reportsDir, "strategy-comparison.md"),
    derived.rendered.strategyComparisonMarkdown,
    "utf8",
  );

  return {
    ...derived,
    reportsDir,
  };
}

export function formatRunReportSummary(derived) {
  const summary = derived.reports.taskStatus.summary;
  const strategySummary = derived.reports.strategyComparison.summary;
  const headline = [
    `Canonical artifacts: ${derived.source.canonicalArtifactCount}`,
    `Native artifacts: ${derived.source.nativeArtifactCount}`,
    `Live-imported artifacts: ${derived.source.legacyImportArtifactCount}`,
    `Observed task buckets: ${derived.source.observedTaskCount}`,
    `Registered tasks: ${derived.source.registeredTaskCount}`,
  ];
  const statusLine = [
    `Solved (direct): ${summary.solvedScoredTasks}`,
    `Solved (estimated only): ${summary.solvedEstimatedTasks}`,
    `Scored but unsolved: ${summary.attemptedScoredTasks}`,
    `Estimated only: ${summary.attemptedEstimatedTasks}`,
    `Unscored attempts: ${summary.attemptedUnscoredTasks}`,
    `No runs: ${summary.notRunTasks}`,
  ];
  const coverageLine = [
    `Tasks with native runs: ${summary.tasksWithNativeRuns}`,
    `Tasks with live-imported runs: ${summary.tasksWithLegacyImportRuns}`,
    `Tasks with combined evidence: ${summary.tasksWithCombinedEvidence}`,
  ];

  const topOpenTasks = derived.reports.openTasks.tasks.slice(0, 5).map((task) => {
    const bestRun = task.bestKnownRun;
    const scoreText =
      typeof bestRun?.scoreTotal === "number"
        ? `score=${bestRun.scoreTotal}`
        : "score=none";
    const evidenceText = bestRun
      ? `evidence=${bestRun.evidenceClass}`
      : "evidence=none";

    return [
      task.taskId,
      task.status,
      scoreText,
      evidenceText,
      task.optimizationTarget?.headline ?? task.openReason ?? "open",
    ].join(" | ");
  });
  const currentLeaders = derived.reports.strategyComparison.tasks
    .filter((task) => task.bestKnownStrategy)
    .slice(0, 5)
    .map((task) =>
      [
        task.taskId,
        `current=${formatStrategySummaryCell(task.bestKnownStrategy)}`,
        `verified=${
          task.bestVerifiedStrategy
            ? formatStrategySummaryCell(task.bestVerifiedStrategy)
            : "none"
        }`,
      ].join(" | "),
    );

  const lines = [headline.join(" | "), statusLine.join(" | "), coverageLine.join(" | ")];
  lines.push(
    [
      `Tasks with runs: ${strategySummary.tasksWithRuns}`,
      `Tasks with multi-strategy coverage: ${strategySummary.tasksWithMultipleStrategies}`,
      `Estimated leaders needing verification: ${strategySummary.tasksWithEstimatedLeader}`,
    ].join(" | "),
  );
  if (topOpenTasks.length > 0) {
    lines.push("Top open tasks:");
    lines.push(...topOpenTasks.map((line) => `- ${line}`));
  }
  if (currentLeaders.length > 0) {
    lines.push("Current strategy leaders:");
    lines.push(...currentLeaders.map((line) => `- ${line}`));
  }

  return lines.join("\n");
}

function buildTaskReport({ taskId, runs, registryById }) {
  const taskRuns = runs.filter((run) => run.effectiveTaskId === taskId);
  const taskMeta = registryById.get(taskId);
  const runFrontier = [...taskRuns].sort(compareRunRecords).map(toRunFrontierEntry);
  const strategyFrontier = buildStrategyFrontier(taskRuns);
  const bestKnownRun = taskRuns.length > 0 ? toBestRunSummary(taskRuns[0]) : null;
  const verifiedRuns = taskRuns.filter((run) => run.evidenceClass === "scored");
  const bestVerifiedRun =
    verifiedRuns.length > 0 ? toBestRunSummary(verifiedRuns.sort(compareRunRecords)[0]) : null;
  const bestNativeRun = selectBestRunForOrigin(taskRuns, "native");
  const bestLegacyImportRun = selectBestRunForOrigin(taskRuns, "legacy-import");
  const sourceCoverage = summarizeTaskSourceCoverage(taskRuns);

  const status = determineTaskStatus(taskRuns, bestKnownRun, bestVerifiedRun);
  const openReason = determineOpenReason(status);
  const statusHeadline = buildTaskStatusHeadline({
    status,
    sourceCoverage,
    bestKnownRun,
    bestVerifiedRun,
  });
  const bestKnownEvidence = toEvidenceSummary(bestKnownRun);
  const bestDirectEvidence = toEvidenceSummary(bestVerifiedRun);
  const optimizationTarget = buildOptimizationTarget({
    status,
    sourceCoverage,
    bestKnownRun,
    bestVerifiedRun,
  });

  return {
    taskId,
    txTaskId: taskMeta?.txTaskId ?? null,
    taskName: taskMeta?.taskName ?? taskRuns[0]?.effectiveTaskName ?? taskId,
    taskSummary: taskMeta?.summary ?? null,
    registeredTask: Boolean(taskMeta),
    status,
    openReason,
    openCategory: determineOpenCategory(status),
    statusHeadline,
    runCount: taskRuns.length,
    nativeRunCount: taskRuns.filter((run) => run.origin === "native").length,
    legacyImportRunCount: taskRuns.filter((run) => run.origin === "legacy-import").length,
    scoredRunCount: taskRuns.filter((run) => run.evidenceClass === "scored").length,
    estimatedRunCount: taskRuns.filter((run) => run.evidenceClass === "estimated").length,
    solvedScoredRunCount: taskRuns.filter(
      (run) => run.evidenceClass === "scored" && run.taskSolved === true,
    ).length,
    solvedEstimatedRunCount: taskRuns.filter(
      (run) => run.evidenceClass === "estimated" && run.taskSolved === true,
    ).length,
    completedRunCount: taskRuns.filter((run) =>
      COMPLETED_RUNTIME_STATUSES.has(run.runtimeStatus),
    ).length,
    ambiguousAttributionRunCount: taskRuns.filter(
      (run) => run.attributionStatus === "ambiguous",
    ).length,
    sourceCoverage,
    bestKnownEvidence,
    bestDirectEvidence,
    bestKnownRun,
    bestVerifiedRun,
    bestNativeRun,
    bestLegacyImportRun,
    optimizationTarget,
    runFrontier,
    strategyFrontier,
  };
}

function buildStrategyFrontier(taskRuns) {
  const strategies = new Map();

  for (const run of taskRuns) {
    const existing = strategies.get(run.strategyId);
    if (!existing) {
      strategies.set(run.strategyId, {
        strategyId: run.strategyId,
        strategyName: run.strategyName,
        strategyPath: run.strategyPath,
        strategyStatus: run.strategyStatus,
        runCount: 0,
        nativeRunCount: 0,
        legacyImportRunCount: 0,
        modes: new Set(),
        evidenceClasses: new Set(),
        runs: [],
      });
    }

    const strategy = strategies.get(run.strategyId);
    strategy.runCount += 1;
    strategy.nativeRunCount += run.origin === "native" ? 1 : 0;
    strategy.legacyImportRunCount += run.origin === "legacy-import" ? 1 : 0;
    strategy.modes.add(run.mode);
    strategy.evidenceClasses.add(run.evidenceClass);
    strategy.runs.push(run);
  }

  return [...strategies.values()]
    .map((strategy) => {
      strategy.runs.sort(compareRunRecords);
      const verifiedRuns = strategy.runs.filter((run) => run.evidenceClass === "scored");

      return {
        strategyId: strategy.strategyId,
        strategyName: strategy.strategyName,
        strategyPath: strategy.strategyPath,
        strategyStatus: strategy.strategyStatus,
        runCount: strategy.runCount,
        nativeRunCount: strategy.nativeRunCount,
        legacyImportRunCount: strategy.legacyImportRunCount,
        modes: [...strategy.modes].sort(),
        evidenceClasses: [...strategy.evidenceClasses].sort(),
        latestRunId: strategy.runs
          .slice()
          .sort((left, right) => compareTextDesc(left.createdAt, right.createdAt) || compareTextAsc(left.runId, right.runId))[0]
          ?.runId,
        bestKnownRun: toBestRunSummary(strategy.runs[0]),
        bestVerifiedRun:
          verifiedRuns.length > 0
            ? toBestRunSummary(verifiedRuns.sort(compareRunRecords)[0])
            : null,
      };
    })
    .sort((left, right) => {
      const bestKnownComparison = compareBestRunSummaries(
        left.bestKnownRun,
        right.bestKnownRun,
      );
      if (bestKnownComparison !== 0) {
        return bestKnownComparison;
      }

      const runCountComparison = compareNumberDesc(left.runCount, right.runCount);
      if (runCountComparison !== 0) {
        return runCountComparison;
      }

      return compareTextAsc(left.strategyId, right.strategyId);
    });
}

function buildStrategyComparisonReport(task) {
  const rankedStrategies = task.strategyFrontier.map((strategy, index) =>
    toStrategyComparisonEntry(strategy, index + 1),
  );
  const bestKnownStrategy =
    rankedStrategies.length > 0 ? toStrategyLeaderSummary(rankedStrategies[0], 1, "best-known") : null;
  const bestVerifiedStrategy = selectBestVerifiedStrategy(rankedStrategies);
  const leaderEvidenceClass = bestKnownStrategy?.bestKnownRun?.evidenceClass ?? null;

  return {
    taskId: task.taskId,
    txTaskId: task.txTaskId,
    taskName: task.taskName,
    status: task.status,
    sourceCoverage: task.sourceCoverage,
    openReason: task.openReason,
    openCategory: task.openCategory,
    runCount: task.runCount,
    strategyCount: rankedStrategies.length,
    comparableStrategyCount: rankedStrategies.filter(hasComparableBestRun).length,
    bestKnownStrategy,
    bestVerifiedStrategy,
    leaderEvidenceClass,
    leaderNeedsVerification: leaderEvidenceClass === "estimated",
    rankedStrategies,
  };
}

function determineTaskStatus(taskRuns, bestKnownRun, bestVerifiedRun) {
  if (bestVerifiedRun?.taskSolved === true) {
    return "solved-scored";
  }

  if (bestKnownRun?.taskSolved === true) {
    return bestKnownRun.evidenceClass === "estimated"
      ? "solved-estimated"
      : "attempted-unscored";
  }

  if (taskRuns.some((run) => run.evidenceClass === "scored")) {
    return "attempted-scored";
  }

  if (taskRuns.some((run) => run.evidenceClass === "estimated")) {
    return "attempted-estimated";
  }

  if (taskRuns.length > 0) {
    return "attempted-unscored";
  }

  return "not-run";
}

function determineOpenReason(status) {
  switch (status) {
    case "solved-scored":
      return null;
    case "solved-estimated":
      return "Only estimated solve evidence exists; native scored confirmation is still needed.";
    case "attempted-scored":
      return "Direct score evidence exists, but the task is still unsolved.";
    case "attempted-estimated":
      return "Only estimated score evidence exists; native scoring is still needed.";
    case "attempted-unscored":
      return "Runs exist, but no comparable score evidence has been recorded yet.";
    case "not-run":
      return "No canonical run artifact exists for this task yet.";
    default:
      return "Open task.";
  }
}

function determineOpenCategory(status) {
  switch (status) {
    case "solved-scored":
      return "closed";
    case "solved-estimated":
      return "needs-native-verification";
    case "attempted-scored":
      return "needs-correctness";
    case "attempted-estimated":
      return "needs-native-verification";
    case "attempted-unscored":
      return "needs-scoring";
    case "not-run":
      return "missing-coverage";
    default:
      return "open";
  }
}

function summarizeTaskStatuses(tasks) {
  const summary = {
    totalTasks: tasks.length,
    solvedScoredTasks: 0,
    solvedEstimatedTasks: 0,
    attemptedScoredTasks: 0,
    attemptedEstimatedTasks: 0,
    attemptedUnscoredTasks: 0,
    notRunTasks: 0,
    openTasks: 0,
    tasksWithNativeRuns: 0,
    tasksWithLegacyImportRuns: 0,
    tasksWithCombinedEvidence: 0,
    tasksWithNativeScoredRuns: 0,
  };

  for (const task of tasks) {
    if (task.sourceCoverage.hasNativeRuns) {
      summary.tasksWithNativeRuns += 1;
    }
    if (task.sourceCoverage.hasLegacyImportRuns) {
      summary.tasksWithLegacyImportRuns += 1;
    }
    if (task.sourceCoverage.sourceMix === "combined") {
      summary.tasksWithCombinedEvidence += 1;
    }
    if (task.sourceCoverage.nativeScoredRunCount > 0) {
      summary.tasksWithNativeScoredRuns += 1;
    }

    switch (task.status) {
      case "solved-scored":
        summary.solvedScoredTasks += 1;
        break;
      case "solved-estimated":
        summary.solvedEstimatedTasks += 1;
        summary.openTasks += 1;
        break;
      case "attempted-scored":
        summary.attemptedScoredTasks += 1;
        summary.openTasks += 1;
        break;
      case "attempted-estimated":
        summary.attemptedEstimatedTasks += 1;
        summary.openTasks += 1;
        break;
      case "attempted-unscored":
        summary.attemptedUnscoredTasks += 1;
        summary.openTasks += 1;
        break;
      case "not-run":
        summary.notRunTasks += 1;
        summary.openTasks += 1;
        break;
      default:
        summary.openTasks += 1;
        break;
    }
  }

  return summary;
}

function toTaskStatusEntry(task) {
  return {
    taskId: task.taskId,
    txTaskId: task.txTaskId,
    taskName: task.taskName,
    taskSummary: task.taskSummary,
    registeredTask: task.registeredTask,
    status: task.status,
    openCategory: task.openCategory,
    openReason: task.openReason,
    statusHeadline: task.statusHeadline,
    runCount: task.runCount,
    nativeRunCount: task.nativeRunCount,
    legacyImportRunCount: task.legacyImportRunCount,
    scoredRunCount: task.scoredRunCount,
    estimatedRunCount: task.estimatedRunCount,
    solvedScoredRunCount: task.solvedScoredRunCount,
    solvedEstimatedRunCount: task.solvedEstimatedRunCount,
    completedRunCount: task.completedRunCount,
    ambiguousAttributionRunCount: task.ambiguousAttributionRunCount,
    sourceCoverage: task.sourceCoverage,
    bestKnownEvidence: task.bestKnownEvidence,
    bestDirectEvidence: task.bestDirectEvidence,
    bestKnownRun: task.bestKnownRun,
    bestVerifiedRun: task.bestVerifiedRun,
    bestNativeRun: task.bestNativeRun,
    bestLegacyImportRun: task.bestLegacyImportRun,
    optimizationTarget: task.optimizationTarget,
  };
}

function toBestRunSummary(run) {
  if (!run) {
    return null;
  }

  return {
    runId: run.runId,
    createdAt: run.createdAt,
    artifactPath: run.artifactPath,
    mode: run.mode,
    origin: run.origin,
    strategyId: run.strategyId,
    strategyName: run.strategyName,
    strategyPath: run.strategyPath,
    strategyStatus: run.strategyStatus,
    declaredTaskId: run.declaredTaskId,
    effectiveTaskId: run.effectiveTaskId,
    attributionStatus: run.attributionStatus,
    evidenceClass: run.evidenceClass,
    evaluationStatus: run.evaluationStatus,
    evaluationSource: run.evaluationSource,
    scoreTotal: run.scoreTotal,
    correctnessScore: run.correctnessScore,
    tier: run.tier,
    taskSolved: run.taskSolved,
    runtimeStatus: run.runtimeStatus,
    apiCallCount: run.apiCallCount,
    durationMs: run.durationMs,
  };
}

function toStrategyComparisonEntry(strategy, rank) {
  return {
    rank,
    strategyId: strategy.strategyId,
    strategyName: strategy.strategyName,
    strategyPath: strategy.strategyPath,
    strategyStatus: strategy.strategyStatus,
    runCount: strategy.runCount,
    nativeRunCount: strategy.nativeRunCount,
    legacyImportRunCount: strategy.legacyImportRunCount,
    modes: strategy.modes,
    evidenceClasses: strategy.evidenceClasses,
    latestRunId: strategy.latestRunId,
    bestKnownRun: strategy.bestKnownRun,
    bestVerifiedRun: strategy.bestVerifiedRun,
  };
}

function toStrategyLeaderSummary(strategy, rank, leaderType) {
  if (!strategy) {
    return null;
  }

  return {
    rank,
    leaderType,
    strategyId: strategy.strategyId,
    strategyName: strategy.strategyName,
    strategyPath: strategy.strategyPath,
    strategyStatus: strategy.strategyStatus,
    runCount: strategy.runCount,
    nativeRunCount: strategy.nativeRunCount,
    legacyImportRunCount: strategy.legacyImportRunCount,
    bestKnownRun: strategy.bestKnownRun,
    bestVerifiedRun: strategy.bestVerifiedRun,
  };
}

function toEvidenceSummary(run) {
  if (!run) {
    return null;
  }

  return {
    runId: run.runId,
    origin: run.origin,
    evidenceClass: run.evidenceClass,
    taskSolved: run.taskSolved,
    scoreTotal: run.scoreTotal,
    correctnessScore: run.correctnessScore,
    summary: formatEvidenceSummary(run),
  };
}

function selectBestVerifiedStrategy(strategies) {
  const verifiedStrategies = strategies.filter((strategy) => strategy.bestVerifiedRun);
  if (verifiedStrategies.length === 0) {
    return null;
  }

  const bestStrategy = verifiedStrategies
    .slice()
    .sort((left, right) => {
      const comparison = compareBestRunSummaries(
        left.bestVerifiedRun,
        right.bestVerifiedRun,
      );
      if (comparison !== 0) {
        return comparison;
      }

      const runCountComparison = compareNumberDesc(left.runCount, right.runCount);
      if (runCountComparison !== 0) {
        return runCountComparison;
      }

      return compareTextAsc(left.strategyId, right.strategyId);
    })[0];

  return toStrategyLeaderSummary(
    bestStrategy,
    typeof bestStrategy.rank === "number" ? bestStrategy.rank : null,
    "best-verified",
  );
}

function toRunFrontierEntry(run) {
  return {
    runId: run.runId,
    createdAt: run.createdAt,
    artifactPath: run.artifactPath,
    origin: run.origin,
    mode: run.mode,
    strategyId: run.strategyId,
    strategyName: run.strategyName,
    evidenceClass: run.evidenceClass,
    evaluationStatus: run.evaluationStatus,
    evaluationSource: run.evaluationSource,
    scoreTotal: run.scoreTotal,
    correctnessScore: run.correctnessScore,
    tier: run.tier,
    taskSolved: run.taskSolved,
    runtimeStatus: run.runtimeStatus,
    apiCallCount: run.apiCallCount,
    durationMs: run.durationMs,
    declaredTaskId: run.declaredTaskId,
    attributionStatus: run.attributionStatus,
    attributedTaskId: run.attributedTaskId,
  };
}

function summarizeObservedRunSources(runs) {
  return {
    nativeArtifactCount: runs.filter((run) => run.origin === "native").length,
    legacyImportArtifactCount: runs.filter((run) => run.origin === "legacy-import").length,
  };
}

function selectBestRunForOrigin(taskRuns, origin) {
  const originRuns = taskRuns.filter((run) => run.origin === origin);
  if (originRuns.length === 0) {
    return null;
  }

  return toBestRunSummary(originRuns.sort(compareRunRecords)[0]);
}

function summarizeTaskSourceCoverage(taskRuns) {
  const nativeRuns = taskRuns.filter((run) => run.origin === "native");
  const legacyImportRuns = taskRuns.filter((run) => run.origin === "legacy-import");
  const hasNativeRuns = nativeRuns.length > 0;
  const hasLegacyImportRuns = legacyImportRuns.length > 0;

  return {
    sourceMix: determineSourceMix(hasNativeRuns, hasLegacyImportRuns),
    sourceMixLabel: formatSourceMixLabel(
      determineSourceMix(hasNativeRuns, hasLegacyImportRuns),
    ),
    hasNativeRuns,
    hasLegacyImportRuns,
    nativeScoredRunCount: nativeRuns.filter((run) => run.evidenceClass === "scored").length,
    nativeEstimatedRunCount: nativeRuns.filter((run) => run.evidenceClass === "estimated").length,
    nativeUnscoredRunCount: nativeRuns.filter((run) => run.evidenceClass === "unscored").length,
    legacyImportScoredRunCount: legacyImportRuns.filter(
      (run) => run.evidenceClass === "scored",
    ).length,
    legacyImportEstimatedRunCount: legacyImportRuns.filter(
      (run) => run.evidenceClass === "estimated",
    ).length,
    legacyImportUnscoredRunCount: legacyImportRuns.filter(
      (run) => run.evidenceClass === "unscored",
    ).length,
  };
}

function determineSourceMix(hasNativeRuns, hasLegacyImportRuns) {
  if (hasNativeRuns && hasLegacyImportRuns) {
    return "combined";
  }
  if (hasNativeRuns) {
    return "native-only";
  }
  if (hasLegacyImportRuns) {
    return "live-imported-only";
  }

  return "none";
}

function buildTaskStatusHeadline({
  status,
  sourceCoverage,
  bestKnownRun,
  bestVerifiedRun,
}) {
  const sourceLabel = sourceCoverage.sourceMixLabel;

  switch (status) {
    case "solved-scored":
      return `${sourceLabel}: direct scored solve evidence is recorded.`;
    case "solved-estimated":
      return `${sourceLabel}: the best solve is still estimated (${formatEvidenceSummary(bestKnownRun)}); direct confirmation is missing.`;
    case "attempted-scored":
      return `${sourceLabel}: direct scored evidence exists (${formatEvidenceSummary(bestVerifiedRun)}), but the task is still unsolved.`;
    case "attempted-estimated":
      return `${sourceLabel}: only estimated score evidence exists (${formatEvidenceSummary(bestKnownRun)}).`;
    case "attempted-unscored":
      return `${sourceLabel}: runs exist, but no comparable score evidence has been recorded yet.`;
    case "not-run":
      return "No live-imported or native canonical runs are recorded yet.";
    default:
      return `${sourceLabel}: task is still open.`;
  }
}

function buildOptimizationTarget({
  status,
  sourceCoverage,
  bestKnownRun,
  bestVerifiedRun,
}) {
  switch (status) {
    case "not-run":
      return {
        priorityRank: 1,
        priorityLabel: "highest",
        category: "add-coverage",
        preferredOrigin: "native",
        preferredEvidenceClass: "run-artifact",
        headline: "Add first canonical run coverage",
        rationale:
          "No live-imported or native canonical run exists for this task yet.",
      };
    case "attempted-unscored":
      if (sourceCoverage.hasNativeRuns) {
        return {
          priorityRank: 3,
          priorityLabel: "high",
          category: "add-scoring",
          preferredOrigin: "native",
          preferredEvidenceClass: "scored",
          headline: "Add direct scoring to existing native attempts",
          rationale:
            "Native runs exist, but neither source has comparable score evidence yet.",
        };
      }

      return {
        priorityRank: 2,
        priorityLabel: "high",
        category: "create-native-baseline",
        preferredOrigin: "native",
        preferredEvidenceClass: "scored",
        headline: "Create a native baseline and score it",
        rationale:
          "Only live-imported unscored attempts exist, so the next useful step is a native scored baseline.",
      };
    case "solved-estimated":
      return {
        priorityRank: 4,
        priorityLabel: "high",
        category: "verify-estimated-solve",
        preferredOrigin: "native",
        preferredEvidenceClass: "scored",
        headline: "Capture direct scored confirmation for the estimated solve",
        rationale: `The current solve leader is estimated only (${formatEvidenceSummary(bestKnownRun)}).`,
      };
    case "attempted-estimated":
      return {
        priorityRank: sourceCoverage.hasNativeRuns ? 5 : 6,
        priorityLabel: "medium",
        category: "verify-estimated-leader",
        preferredOrigin: "native",
        preferredEvidenceClass: "scored",
        headline: sourceCoverage.hasNativeRuns
          ? "Score native attempts against the current estimated leader"
          : "Reproduce the estimated leader natively and score it",
        rationale: `The best available evidence is estimated only (${formatEvidenceSummary(bestKnownRun)}).`,
      };
    case "attempted-scored":
      return {
        priorityRank: 7,
        priorityLabel: "medium",
        category: "improve-correctness",
        preferredOrigin: bestVerifiedRun?.origin ?? "native",
        preferredEvidenceClass: "scored",
        headline: "Improve correctness above the current scored baseline",
        rationale: `Direct evidence exists (${formatEvidenceSummary(bestVerifiedRun)}), but it does not solve the task.`,
      };
    default:
      return null;
  }
}

function normalizeRunArtifact({ artifact, artifactPath, registryById }) {
  const attribution = artifact.attribution ?? {};
  const evaluation = artifact.evaluation ?? {};
  const attributedTaskId =
    attribution.status === "matched" && typeof attribution.attributedTaskId === "string"
      ? attribution.attributedTaskId
      : null;
  const effectiveTaskId = attributedTaskId ?? artifact.task.taskId;
  const effectiveTaskName =
    registryById.get(effectiveTaskId)?.taskName ??
    (effectiveTaskId === artifact.task.taskId ? artifact.task.taskName : null) ??
    effectiveTaskId;

  return {
    artifactPath: relativizeToCwd(artifactPath),
    runId: artifact.runId,
    createdAt: artifact.createdAt,
    mode: artifact.mode,
    origin: detectRunOrigin(artifact),
    declaredTaskId: artifact.task.taskId,
    declaredTaskName: artifact.task.taskName ?? artifact.task.taskId,
    effectiveTaskId,
    effectiveTaskName,
    attributionStatus: artifact.attribution?.status ?? null,
    attributedTaskId,
    strategyId: artifact.strategy.strategyId,
    strategyName: artifact.strategy.strategyName ?? artifact.strategy.strategyId,
    strategyPath: artifact.strategy.strategyPath,
    strategyStatus: artifact.strategy.strategyStatus,
    runtimeStatus: artifact.execution.runtimeStatus,
    apiCallCount: artifact.execution.apiCallCount,
    durationMs: artifact.execution.durationMs ?? null,
    evaluationStatus: normalizeEvaluationStatus(evaluation.status),
    evaluationSource:
      typeof evaluation.source === "string" ? evaluation.source : null,
    evidenceClass: classifyEvidence(evaluation.status),
    scoreTotal:
      typeof evaluation.scoreTotal === "number" ? evaluation.scoreTotal : null,
    correctnessScore:
      typeof evaluation.correctnessScore === "number"
        ? evaluation.correctnessScore
        : null,
    tier: typeof evaluation.tier === "number" ? evaluation.tier : null,
    taskSolved:
      typeof evaluation.taskSolved === "boolean" ? evaluation.taskSolved : null,
  };
}

function normalizeEvaluationStatus(status) {
  return KNOWN_EVALUATION_STATUSES.has(status) ? status : null;
}

function classifyEvidence(status) {
  switch (status) {
    case "scored":
      return "scored";
    case "estimated":
      return "estimated";
    default:
      return "unscored";
  }
}

function detectRunOrigin(artifact) {
  if (
    artifact.runId.startsWith("legacy-tripletex1-") ||
    artifact.strategy.strategyId.startsWith("legacy-tripletex1-")
  ) {
    return "legacy-import";
  }

  return "native";
}

function isRunArtifact(value) {
  return (
    value &&
    typeof value === "object" &&
    value.schemaVersion === RUN_ARTIFACT_SCHEMA_VERSION &&
    typeof value.runId === "string"
  );
}

async function listJsonFiles(rootDir) {
  let dirEntries;
  try {
    dirEntries = await fs.readdir(rootDir, { withFileTypes: true });
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
  const files = [];

  for (const entry of dirEntries.sort((left, right) => left.name.localeCompare(right.name))) {
    const resolvedPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listJsonFiles(resolvedPath)));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".json")) {
      files.push(resolvedPath);
    }
  }

  return files;
}

async function readJsonFile(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function writeJsonFile(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function compareTaskReports(left, right) {
  const leftPriority = taskStatusRank(left.status);
  const rightPriority = taskStatusRank(right.status);
  if (leftPriority !== rightPriority) {
    return rightPriority - leftPriority;
  }

  const bestRunComparison = compareBestRunSummaries(
    left.bestKnownRun,
    right.bestKnownRun,
  );
  if (bestRunComparison !== 0) {
    return bestRunComparison;
  }

  return compareTaskIdentity(left, right);
}

function compareOpenTasks(left, right) {
  const priorityComparison = compareNumberAsc(
    left.optimizationTarget?.priorityRank ?? Number.POSITIVE_INFINITY,
    right.optimizationTarget?.priorityRank ?? Number.POSITIVE_INFINITY,
  );
  if (priorityComparison !== 0) {
    return priorityComparison;
  }

  const categoryComparison = compareNumberAsc(
    openCategoryRank(left.openCategory),
    openCategoryRank(right.openCategory),
  );
  if (categoryComparison !== 0) {
    return categoryComparison;
  }

  const bestRunComparison = compareBestRunSummaries(
    left.bestKnownRun,
    right.bestKnownRun,
  );
  if (bestRunComparison !== 0) {
    return bestRunComparison;
  }

  return compareTaskIdentity(left, right);
}

function compareTaskIdentity(left, right) {
  const leftTxTaskId = left.txTaskId ?? undefined;
  const rightTxTaskId = right.txTaskId ?? undefined;
  if (leftTxTaskId === undefined && rightTxTaskId !== undefined) {
    return 1;
  }
  if (leftTxTaskId !== undefined && rightTxTaskId === undefined) {
    return -1;
  }
  if (leftTxTaskId !== undefined && rightTxTaskId !== undefined) {
    const txTaskIdComparison = compareTextAsc(leftTxTaskId, rightTxTaskId);
    if (txTaskIdComparison !== 0) {
      return txTaskIdComparison;
    }
  }

  return compareTextAsc(left.taskId, right.taskId);
}

function compareRunRecords(left, right) {
  return compareComparableRuns(left, right);
}

function compareBestRunSummaries(left, right) {
  return compareComparableRuns(left, right);
}

function compareComparableRuns(left, right) {
  if (!left && !right) {
    return 0;
  }

  if (!left) {
    return 1;
  }

  if (!right) {
    return -1;
  }

  const solvedComparison = compareNumberDesc(
    solvedRank(left.taskSolved),
    solvedRank(right.taskSolved),
  );
  if (solvedComparison !== 0) {
    return solvedComparison;
  }

  const correctnessComparison = compareOptionalNumberDesc(
    left.correctnessScore,
    right.correctnessScore,
  );
  if (correctnessComparison !== 0) {
    return correctnessComparison;
  }

  const scoreComparison = compareOptionalNumberDesc(left.scoreTotal, right.scoreTotal);
  if (scoreComparison !== 0) {
    return scoreComparison;
  }

  const apiCallComparison = compareOptionalNumberAsc(
    left.apiCallCount,
    right.apiCallCount,
  );
  if (apiCallComparison !== 0) {
    return apiCallComparison;
  }

  const evidenceComparison = compareNumberDesc(
    evidenceRank(left.evidenceClass),
    evidenceRank(right.evidenceClass),
  );
  if (evidenceComparison !== 0) {
    return evidenceComparison;
  }

  const runtimeComparison = compareNumberDesc(
    runtimeStatusRank(left.runtimeStatus),
    runtimeStatusRank(right.runtimeStatus),
  );
  if (runtimeComparison !== 0) {
    return runtimeComparison;
  }

  const durationComparison = compareOptionalNumberAsc(
    left.durationMs,
    right.durationMs,
  );
  if (durationComparison !== 0) {
    return durationComparison;
  }

  const createdAtComparison = compareTextDesc(left.createdAt, right.createdAt);
  if (createdAtComparison !== 0) {
    return createdAtComparison;
  }

  return compareTextAsc(left.runId, right.runId);
}

function taskStatusRank(status) {
  switch (status) {
    case "not-run":
      return 5;
    case "attempted-unscored":
      return 4;
    case "attempted-estimated":
      return 3;
    case "attempted-scored":
      return 2;
    case "solved-estimated":
      return 1;
    case "solved-scored":
      return 0;
    default:
      return 0;
  }
}

function openCategoryRank(category) {
  switch (category) {
    case "missing-coverage":
      return 0;
    case "needs-scoring":
      return 1;
    case "needs-native-verification":
      return 2;
    case "needs-correctness":
      return 3;
    case "closed":
      return 4;
    default:
      return 5;
  }
}

function evidenceRank(evidenceClass) {
  switch (evidenceClass) {
    case "scored":
      return 2;
    case "estimated":
      return 1;
    default:
      return 0;
  }
}

function runtimeStatusRank(status) {
  switch (status) {
    case "completed":
      return 4;
    case "failed":
      return 3;
    case "timeout":
      return 2;
    case "aborted":
      return 1;
    case "not-run":
      return 0;
    default:
      return 0;
  }
}

function solvedRank(taskSolved) {
  if (taskSolved === true) {
    return 2;
  }

  if (taskSolved === false) {
    return 1;
  }

  return 0;
}

function compareOptionalNumberDesc(left, right) {
  const leftHasValue = typeof left === "number";
  const rightHasValue = typeof right === "number";
  if (!leftHasValue && !rightHasValue) {
    return 0;
  }
  if (leftHasValue && !rightHasValue) {
    return -1;
  }
  if (!leftHasValue && rightHasValue) {
    return 1;
  }
  return compareNumberDesc(left, right);
}

function compareOptionalNumberAsc(left, right) {
  const leftHasValue = typeof left === "number";
  const rightHasValue = typeof right === "number";
  if (!leftHasValue && !rightHasValue) {
    return 0;
  }
  if (leftHasValue && !rightHasValue) {
    return -1;
  }
  if (!leftHasValue && rightHasValue) {
    return 1;
  }
  return compareNumberAsc(left, right);
}

function compareNumberAsc(left, right) {
  return left - right;
}

function compareNumberDesc(left, right) {
  return right - left;
}

function compareTextAsc(left, right) {
  return String(left).localeCompare(String(right));
}

function compareTextDesc(left, right) {
  return String(right).localeCompare(String(left));
}

function safeReportName(taskId) {
  return taskId.replace(/[^A-Za-z0-9._-]+/g, "-");
}

function relativizeToCwd(filePath) {
  return path.relative(process.cwd(), filePath) || ".";
}

function summarizeStrategyComparisons(tasks) {
  return {
    totalTasks: tasks.length,
    tasksWithRuns: tasks.filter((task) => task.runCount > 0).length,
    tasksWithMultipleStrategies: tasks.filter((task) => task.strategyCount > 1).length,
    tasksWithComparableStrategies: tasks.filter((task) => task.comparableStrategyCount > 0)
      .length,
    tasksWithVerifiedLeader: tasks.filter((task) => task.bestVerifiedStrategy !== null).length,
    tasksWithEstimatedLeader: tasks.filter(
      (task) => task.leaderEvidenceClass === "estimated",
    ).length,
  };
}

function summarizeOpenTasks(tasks) {
  return {
    openTaskCount: tasks.length,
    highestPriorityOpenTasks: tasks.filter(
      (task) => task.optimizationTarget?.priorityLabel === "highest",
    ).length,
    highPriorityOpenTasks: tasks.filter(
      (task) => task.optimizationTarget?.priorityLabel === "high",
    ).length,
    mediumPriorityOpenTasks: tasks.filter(
      (task) => task.optimizationTarget?.priorityLabel === "medium",
    ).length,
  };
}

function formatStrategyComparisonMarkdown({
  generatedAt,
  source,
  scoringPolicy,
  strategyComparisons,
}) {
  const lines = [
    "# Strategy Comparison",
    "",
    `Generated: ${generatedAt}`,
    "",
    `Runs dir: \`${source.runsDir}\``,
    `Canonical artifacts: ${source.canonicalArtifactCount}`,
    `Native artifacts: ${source.nativeArtifactCount}`,
    `Live-imported artifacts: ${source.legacyImportArtifactCount}`,
    `Observed task buckets: ${source.observedTaskCount}`,
    `Registered tasks: ${source.registeredTaskCount}`,
    "",
    "Ranking policy:",
    ...scoringPolicy.bestKnownRanking.map((line) => `- ${line}`),
    "",
    "## Current Best Strategy Per Task",
    "",
    "| Task | Status | Sources | Current best | Verified best |",
    "| --- | --- | --- | --- | --- |",
    ...strategyComparisons.map((task) =>
      [
        "|",
        formatTaskLabel(task),
        "|",
        task.status,
        "|",
        task.sourceCoverage.sourceMixLabel,
        "|",
        task.bestKnownStrategy
          ? formatStrategyMarkdownCell(task.bestKnownStrategy)
          : "none",
        "|",
        task.bestVerifiedStrategy
          ? formatStrategyMarkdownCell(task.bestVerifiedStrategy)
          : "none",
        "|",
      ].join(" "),
    ),
  ];

  const detailedTasks = strategyComparisons.filter((task) => task.strategyCount > 0);
  if (detailedTasks.length > 0) {
    lines.push("", "## Ranked Strategies", "");
    for (const task of detailedTasks) {
      lines.push(`### ${formatTaskLabel(task)}`);
      lines.push(`Status: ${task.status}`);
      if (task.openReason) {
        lines.push(`Open reason: ${task.openReason}`);
      }
      for (const strategy of task.rankedStrategies) {
        lines.push(
          `${strategy.rank}. ${formatStrategyMarkdownCell(strategy)}${
            task.bestVerifiedStrategy?.strategyId === strategy.strategyId
              ? " [verified leader]"
              : ""
          }`,
        );
      }
      lines.push("");
    }
  }

  return `${lines.join("\n")}\n`;
}

function formatTaskStatusMarkdown({
  generatedAt,
  source,
  scoringPolicy,
  tasks,
}) {
  const summary = summarizeTaskStatuses(tasks);
  const lines = [
    "# Combined Task Status",
    "",
    `Generated: ${generatedAt}`,
    "",
    `Runs dir: \`${source.runsDir}\``,
    `Canonical artifacts: ${source.canonicalArtifactCount}`,
    `Native artifacts: ${source.nativeArtifactCount}`,
    `Live-imported artifacts: ${source.legacyImportArtifactCount}`,
    "",
    "Status summary:",
    `- Solved (direct): ${summary.solvedScoredTasks}`,
    `- Solved (estimated only): ${summary.solvedEstimatedTasks}`,
    `- Attempted with direct score: ${summary.attemptedScoredTasks}`,
    `- Attempted with estimated-only score: ${summary.attemptedEstimatedTasks}`,
    `- Attempted without comparable score: ${summary.attemptedUnscoredTasks}`,
    `- No runs yet: ${summary.notRunTasks}`,
    `- Tasks with native runs: ${summary.tasksWithNativeRuns}`,
    `- Tasks with live-imported runs: ${summary.tasksWithLegacyImportRuns}`,
    `- Tasks with combined live+native evidence: ${summary.tasksWithCombinedEvidence}`,
    "",
    "Ranking policy:",
    ...scoringPolicy.bestKnownRanking.map((line) => `- ${line}`),
    "",
    "## Per-Task Status",
    "",
    "| Task | Status | Sources | Best known evidence | Best direct evidence | Next target |",
    "| --- | --- | --- | --- | --- | --- |",
    ...tasks.map((task) =>
      [
        "|",
        formatTaskLabel(task),
        "|",
        task.status,
        "|",
        task.sourceCoverage.sourceMixLabel,
        "|",
        task.bestKnownEvidence?.summary ?? "none",
        "|",
        task.bestDirectEvidence?.summary ?? "none",
        "|",
        task.optimizationTarget?.headline ?? "closed",
        "|",
      ].join(" "),
    ),
    "",
  ];

  return `${lines.join("\n")}\n`;
}

function formatOpenTasksMarkdown({
  generatedAt,
  source,
  scoringPolicy,
  openTasks,
}) {
  const lines = [
    "# Open Optimization Targets",
    "",
    `Generated: ${generatedAt}`,
    "",
    `Runs dir: \`${source.runsDir}\``,
    `Canonical artifacts: ${source.canonicalArtifactCount}`,
    `Native artifacts: ${source.nativeArtifactCount}`,
    `Live-imported artifacts: ${source.legacyImportArtifactCount}`,
    "",
    "Evidence policy:",
    `- Direct evidence: ${scoringPolicy.scoreEvidence.scored}`,
    `- Estimated evidence: ${scoringPolicy.scoreEvidence.estimated}`,
    `- Unscored evidence: ${scoringPolicy.scoreEvidence.unscored}`,
    "",
    "## Prioritized Tasks",
    "",
  ];

  openTasks.forEach((task, index) => {
    lines.push(
      `${index + 1}. \`${formatTaskLabel(task)}\` | ${task.status} | ${task.sourceCoverage.sourceMixLabel}`,
    );
    lines.push(`Target: ${task.optimizationTarget?.headline ?? task.openReason ?? "Open task"}`);
    if (task.bestKnownEvidence?.summary) {
      lines.push(`Current best: ${task.bestKnownEvidence.summary}`);
    }
    if (task.bestDirectEvidence?.summary) {
      lines.push(`Direct baseline: ${task.bestDirectEvidence.summary}`);
    }
    lines.push(`Reason: ${task.optimizationTarget?.rationale ?? task.openReason ?? "Open task."}`);
    lines.push("");
  });

  return `${lines.join("\n")}\n`;
}

function formatStrategyMarkdownCell(strategy) {
  return [
    `\`${strategy.strategyId}\``,
    formatRunMetricSummary(strategy.bestKnownRun),
  ].join(" ");
}

function formatTaskLabel(task) {
  const displayName = task.taskName ?? task.taskId;
  return task.txTaskId ? `[${task.txTaskId}] ${displayName}` : displayName;
}

function formatEvidenceSummary(run) {
  if (!run) {
    return "none";
  }

  return [
    formatOriginLabel(run.origin),
    run.evidenceClass ?? "unscored",
    formatSolveLabel(run.taskSolved),
    `score=${formatMaybeNumber(run.scoreTotal)}`,
    `correctness=${formatMaybeNumber(run.correctnessScore)}`,
    `calls=${formatMaybeNumber(run.apiCallCount)}`,
  ].join(" ");
}

function formatStrategySummaryCell(strategy) {
  return `${strategy.strategyId}(${formatRunMetricSummary(strategy.bestKnownRun)})`;
}

function formatRunMetricSummary(run) {
  if (!run) {
    return "score=none, calls=none, evidence=none";
  }

  return [
    `score=${formatMaybeNumber(run.scoreTotal)}`,
    `calls=${formatMaybeNumber(run.apiCallCount)}`,
    `evidence=${run.evidenceClass ?? "none"}`,
  ].join(", ");
}

function formatMaybeNumber(value) {
  return typeof value === "number" ? String(value) : "none";
}

function formatOriginLabel(origin) {
  return origin === "legacy-import" ? "live-imported" : origin ?? "unknown";
}

function formatSolveLabel(taskSolved) {
  if (taskSolved === true) {
    return "solved";
  }
  if (taskSolved === false) {
    return "unsolved";
  }

  return "solve=unknown";
}

function formatSourceMixLabel(sourceMix) {
  switch (sourceMix) {
    case "combined":
      return "combined live+native";
    case "native-only":
      return "native only";
    case "live-imported-only":
      return "live-imported only";
    case "none":
      return "no evidence";
    default:
      return sourceMix;
  }
}

function hasComparableBestRun(strategy) {
  return (
    strategy.bestKnownRun !== null &&
    (typeof strategy.bestKnownRun.scoreTotal === "number" ||
      typeof strategy.bestKnownRun.apiCallCount === "number")
  );
}
