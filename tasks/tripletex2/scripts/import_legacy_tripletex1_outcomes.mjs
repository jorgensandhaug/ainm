#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const RUN_ARTIFACT_SCHEMA_VERSION = "tripletex2.run-artifact.v1";
const RUN_SIDECAR_SCHEMA_VERSION = "tripletex2.run-sidecar.v1";
const DEFAULT_SOURCE_DIR = path.resolve(
  process.cwd(),
  "../tripletex/data/production/runs",
);
const DEFAULT_OUTPUT_DIR = path.resolve(process.cwd(), "runs");
const UNKNOWN_TASK_ID = "legacy-tripletex1-unattributed";
const UNKNOWN_TASK_NAME = "Legacy Tripletex1 unattributed task";
const LEGACY_INPUT_SCHEMA_ID = "legacy-tripletex1.request-only.v1";
const LEGACY_SELECTION_CONFIG_ID = "legacy-tripletex1-implicit-selection.v1";

export const CANONICAL_TASK_REGISTRY = [
  {
    taskId: "01",
    txTaskId: "01",
    taskName: "Create customer",
    summary:
      "Create a customer with organization number, address, and contact email.",
    legacyTripletex1TaskIds: ["01"],
  },
  {
    taskId: "02",
    txTaskId: "02",
    taskName: "Create supplier",
    summary:
      "Create a supplier with organization number and invoice email details.",
    legacyTripletex1TaskIds: ["02"],
  },
  {
    taskId: "03",
    txTaskId: "03",
    taskName: "Create department",
    summary:
      "Create one or more new departments with the requested names.",
    legacyTripletex1TaskIds: ["03"],
  },
  {
    taskId: "04",
    txTaskId: "04",
    taskName: "Create product",
    summary:
      "Create a product with product number, price, and the required VAT treatment.",
    legacyTripletex1TaskIds: ["04"],
  },
  {
    taskId: "05",
    txTaskId: "05",
    taskName: "Create project",
    summary:
      "Create a project for an existing customer and assign a project manager.",
    legacyTripletex1TaskIds: ["05"],
  },
  {
    taskId: "06",
    txTaskId: "06",
    taskName: "Create employee",
    summary:
      "Create a new employee with identifying details, contact email, and start date.",
    legacyTripletex1TaskIds: ["06"],
  },
  {
    taskId: "07",
    txTaskId: "07",
    taskName: "Create accounting dimension and post voucher",
    summary:
      "Create a custom accounting dimension with values, then post a voucher linked to one value.",
    legacyTripletex1TaskIds: ["07"],
  },
  {
    taskId: "08",
    txTaskId: "08",
    taskName: "Create and send invoice",
    summary:
      "Create and send an outgoing invoice for an existing customer identified by organization number.",
    legacyTripletex1TaskIds: ["08"],
  },
  {
    taskId: "09",
    txTaskId: "09",
    taskName: "Create customer invoice",
    summary:
      "Create a customer invoice with explicit product lines and mixed VAT handling.",
    legacyTripletex1TaskIds: ["09"],
  },
  {
    taskId: "10",
    txTaskId: "10",
    taskName: "Issue full credit note",
    summary:
      "Find an invoice and issue a full credit note that reverses the entire amount.",
    legacyTripletex1TaskIds: ["10"],
  },
  {
    taskId: "11",
    txTaskId: "11",
    taskName: "Create order, invoice, and register payment",
    summary:
      "Create a sales order, convert it to an invoice, and register full payment.",
    legacyTripletex1TaskIds: ["11"],
  },
  {
    taskId: "12",
    txTaskId: "12",
    taskName: "Run payroll with bonus",
    summary:
      "Process payroll for an employee and include a one-time bonus amount.",
    legacyTripletex1TaskIds: ["12"],
  },
  {
    taskId: "13",
    txTaskId: "13",
    taskName: "Register travel expense",
    summary:
      "Register a travel expense claim with per diem and named out-of-pocket expenses.",
    legacyTripletex1TaskIds: ["13"],
  },
  {
    taskId: "14",
    txTaskId: "14",
    taskName: "Set project fixed price and invoice milestone",
    summary:
      "Set a fixed project price and invoice a requested milestone percentage.",
    legacyTripletex1TaskIds: ["14"],
  },
  {
    taskId: "15",
    txTaskId: "15",
    taskName: "Register project hours and create project invoice",
    summary:
      "Register billable hours to a project activity and generate the resulting project invoice.",
    legacyTripletex1TaskIds: ["15"],
  },
  {
    taskId: "16",
    txTaskId: "16",
    taskName: "Register supplier invoice",
    summary:
      "Register an incoming supplier invoice with the requested account and input VAT.",
    legacyTripletex1TaskIds: ["16"],
  },
  {
    taskId: "17",
    txTaskId: "17",
    taskName: "Register customer invoice payment",
    summary:
      "Locate an unpaid customer invoice and register full payment against it.",
    legacyTripletex1TaskIds: ["17"],
  },
  {
    taskId: "18",
    txTaskId: "18",
    taskName: "Reverse customer invoice payment",
    summary:
      "Reverse a customer invoice payment so the invoice becomes unpaid again.",
    legacyTripletex1TaskIds: ["18"],
  },
];

const canonicalTaskRegistryById = new Map(
  CANONICAL_TASK_REGISTRY.map((task) => [task.taskId, task]),
);

function createCanonicalBridgeEntry(task) {
  return {
    legacyTaskId: task.txTaskId,
    status: "mapped",
    canonicalTaskId: task.taskId,
    mappingConfidence: "high",
    observedUniqueAttemptDeltaRuns: 0,
    representativeRunIds: [],
    notes: [
      `Canonical Tripletex1 production evidence fixes tx_task_id ${task.txTaskId} to "${task.taskId}".`,
    ],
  };
}

const LEGACY_TRIPLETEX1_TASK_BRIDGE = Object.freeze(
  Object.fromEntries(
    CANONICAL_TASK_REGISTRY.map((task) => [
      task.txTaskId,
      createCanonicalBridgeEntry(task),
    ]),
  ),
);

function parseArgs(argv) {
  const parsed = {
    sourceDir: DEFAULT_SOURCE_DIR,
    outputDir: DEFAULT_OUTPUT_DIR,
    runIds: [],
    limit: undefined,
    force: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--source-dir") {
      parsed.sourceDir = path.resolve(argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg === "--output-dir") {
      parsed.outputDir = path.resolve(argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg === "--run-id") {
      parsed.runIds.push(argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg === "--limit") {
      parsed.limit = Number(argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg === "--force") {
      parsed.force = true;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return parsed;
}

function printHelp() {
  console.log(`Usage: node scripts/import_legacy_tripletex1_outcomes.mjs [options]

Options:
  --source-dir <path>   Legacy runs directory (default: ../tripletex/data/production/runs)
  --output-dir <path>   Canonical runs directory (default: ./runs)
  --run-id <id>         Import one specific legacy run id (repeatable)
  --limit <n>           Import at most n runs after filtering
  --force               Overwrite existing artifacts
  --help                Show this help
`);
}

function sha256Hex(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function fingerprintObject(prefix, value) {
  return `${prefix}:${sha256Hex(stableStringify(value))}`;
}

function stableStringify(value) {
  return JSON.stringify(sortValue(value));
}

function sortValue(value) {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortValue(value[key])]),
  );
}

async function readJsonIfExists(filePath) {
  try {
    const text = await fs.readFile(filePath, "utf8");
    return JSON.parse(text);
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return undefined;
    }

    throw error;
  }
}

async function readDirectoryNamesIfExists(dirPath) {
  try {
    return await fs.readdir(dirPath);
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

function sanitizeSlug(text) {
  return text
    .replace(/\.ts$/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function toRepoRelativePath(absolutePath) {
  return path.relative(process.cwd(), absolutePath).split(path.sep).join(path.posix.sep);
}

function mapLegacyMode(manifest) {
  switch (manifest?.storage_mode) {
    case "production":
      return "competition";
    case "sandbox":
      return "sandbox";
    default:
      return "replay";
  }
}

function mapCompletionReasonToRuntimeStatus(taskAttribution) {
  switch (taskAttribution?.completion_reason) {
    case "completed":
      return "completed";
    case "timeout":
      return "timeout";
    case "aborted":
      return "aborted";
    default:
      return "failed";
  }
}

function degradeConfidence(confidence) {
  switch (confidence) {
    case "high":
      return "medium";
    case "medium":
      return "low";
    default:
      return "low";
  }
}

function buildBridgeEvidenceNotes(bridgeEntry, legacyTaskId, inferenceStatus, extraNote) {
  const notes = [];

  if (legacyTaskId) {
    notes.push(`legacy Tripletex1 tx_task_id ${legacyTaskId}`);
  } else {
    notes.push("legacy Tripletex1 tx_task_id missing");
  }

  notes.push(`legacy inference_status ${inferenceStatus}`);

  if (bridgeEntry?.notes) {
    notes.push(...bridgeEntry.notes);
  }

  if (extraNote) {
    notes.push(extraNote);
  }

  return notes;
}

function bridgeLegacyTripletex1TaskAttribution(input) {
  const inferenceStatus = input?.inferenceStatus ?? "no_change_detected";
  const bridgeEntry = input?.txTaskId
    ? LEGACY_TRIPLETEX1_TASK_BRIDGE[input.txTaskId]
    : undefined;
  const canonicalTask =
    bridgeEntry?.canonicalTaskId !== undefined
      ? canonicalTaskRegistryById.get(bridgeEntry.canonicalTaskId)
      : undefined;

  if (!input?.txTaskId) {
    return {
      legacyTaskId: undefined,
      canonicalTask: undefined,
      bridgeEntry: undefined,
      attribution: {
        status: inferenceStatus === "ambiguous" ? "ambiguous" : "unmatched",
        source: "leaderboard-diff",
        confidence: "low",
        evidence: {
          notes: buildBridgeEvidenceNotes(
            undefined,
            undefined,
            inferenceStatus,
            "No legacy task id was present, so the bridge cannot map into the canonical registry.",
          ),
        },
      },
    };
  }

  if (!bridgeEntry || bridgeEntry.status === "unmapped" || !canonicalTask) {
    return {
      legacyTaskId: input.txTaskId,
      canonicalTask: undefined,
      bridgeEntry,
      attribution: {
        status: inferenceStatus === "ambiguous" ? "ambiguous" : "unmatched",
        source: "leaderboard-diff",
        confidence: "low",
        evidence: {
          notes: buildBridgeEvidenceNotes(
            bridgeEntry,
            input.txTaskId,
            inferenceStatus,
            "This legacy task id is not mapped to a canonical tripletex2 task yet.",
          ),
        },
      },
    };
  }

  if (inferenceStatus === "unique_attempt_delta") {
    return {
      legacyTaskId: input.txTaskId,
      canonicalTask,
      bridgeEntry,
      attribution: {
        status: "matched",
        attributedTaskId: canonicalTask.taskId,
        source: "leaderboard-diff",
        confidence: bridgeEntry.mappingConfidence,
        evidence: {
          notes: buildBridgeEvidenceNotes(
            bridgeEntry,
            input.txTaskId,
            inferenceStatus,
          ),
        },
      },
    };
  }

  if (inferenceStatus === "metadata_changed") {
    return {
      legacyTaskId: input.txTaskId,
      canonicalTask,
      bridgeEntry,
      attribution: {
        status: "ambiguous",
        attributedTaskId: canonicalTask.taskId,
        source: "leaderboard-diff",
        confidence: degradeConfidence(bridgeEntry.mappingConfidence),
        evidence: {
          notes: buildBridgeEvidenceNotes(
            bridgeEntry,
            input.txTaskId,
            inferenceStatus,
            "Only leaderboard metadata changed without a unique attempt delta, so the mapped task stays provisional.",
          ),
        },
      },
    };
  }

  if (inferenceStatus === "ambiguous") {
    return {
      legacyTaskId: input.txTaskId,
      canonicalTask,
      bridgeEntry,
      attribution: {
        status: "ambiguous",
        attributedTaskId: canonicalTask.taskId,
        source: "leaderboard-diff",
        confidence: "low",
        evidence: {
          notes: buildBridgeEvidenceNotes(
            bridgeEntry,
            input.txTaskId,
            inferenceStatus,
            "Multiple task candidates changed during the legacy observation window.",
          ),
        },
      },
    };
  }

  return {
    legacyTaskId: input.txTaskId,
    canonicalTask,
    bridgeEntry,
    attribution: {
      status: "unmatched",
      source: "leaderboard-diff",
      confidence: "low",
      evidence: {
        notes: buildBridgeEvidenceNotes(
          bridgeEntry,
          input.txTaskId,
          inferenceStatus,
          "No usable leaderboard delta was captured for this legacy run.",
        ),
      },
    },
  };
}

function selectDeclaredTask(bridgeResult) {
  if (bridgeResult.canonicalTask) {
    return {
      taskId: bridgeResult.canonicalTask.taskId,
      taskName: bridgeResult.canonicalTask.taskName,
      taskConfidence: bridgeResult.attribution.confidence,
      taskSource: "replay-label",
    };
  }

  return {
    taskId: UNKNOWN_TASK_ID,
    taskName: UNKNOWN_TASK_NAME,
    taskConfidence: "low",
    taskSource: "replay-label",
  };
}

async function describeLegacyStrategy(runDir) {
  const scriptsDir = path.join(runDir, "scripts");
  const scriptNames = (await readDirectoryNamesIfExists(scriptsDir))
    .filter((name) => name.endsWith(".ts"))
    .sort();
  const primaryNames = scriptNames.filter((name) => !name.startsWith("sandbox-"));

  if (primaryNames.length === 1) {
    const primaryName = primaryNames[0];
    return {
      strategyId: `legacy-tripletex1-script-${sanitizeSlug(primaryName)}`,
      strategyName: `Legacy script ${primaryName}`,
      strategyPath: toRepoRelativePath(path.join(scriptsDir, primaryName)),
      strategyStatus: "baseline",
      notes: [
        `Imported from the single non-sandbox legacy script ${primaryName}.`,
      ],
    };
  }

  if (primaryNames.length > 1) {
    return {
      strategyId: "legacy-tripletex1-multi-script-run",
      strategyName: "Legacy multi-script run",
      strategyPath: toRepoRelativePath(scriptsDir),
      strategyStatus: "baseline",
      notes: [
        `Imported from ${primaryNames.length} non-sandbox legacy scripts; precise legacy strategy identity is intentionally left coarse.`,
      ],
    };
  }

  return {
    strategyId: "legacy-tripletex1-unknown-strategy",
    strategyName: "Legacy strategy unknown",
    strategyPath: toRepoRelativePath(scriptsDir),
    strategyStatus: "baseline",
    notes: [
      "No non-sandbox legacy script was available, so strategy identity remains coarse.",
    ],
  };
}

function buildExecution(manifest, taskAttribution) {
  const startedAt = manifest?.created_at;
  const completedAt = taskAttribution?.task_complete_timestamp;
  const durationMs =
    startedAt && completedAt
      ? new Date(completedAt).getTime() - new Date(startedAt).getTime()
      : undefined;
  const runtimeStatus = mapCompletionReasonToRuntimeStatus(taskAttribution);
  const error =
    runtimeStatus === "timeout"
      ? {
          code: "legacy-timeout",
          message: "Legacy task-attribution marked the run as timeout.",
          retryable: false,
        }
      : runtimeStatus === "failed" || runtimeStatus === "aborted"
        ? {
            code: `legacy-${runtimeStatus}`,
            message:
              taskAttribution?.completion_reason
                ? `Legacy task-attribution marked the run as ${taskAttribution.completion_reason}.`
                : "Legacy run completion reason was unavailable.",
            retryable: runtimeStatus !== "aborted",
          }
        : undefined;

  return {
    startedAt,
    completedAt,
    durationMs:
      typeof durationMs === "number" && Number.isFinite(durationMs) && durationMs >= 0
        ? durationMs
        : undefined,
    deadlineMs: 300000,
    runtimeStatus,
    apiCallCount: 0,
    api4xxCount: 0,
    api5xxCount: 0,
    apiCalls: [],
    result: {
      notes: [
        "Legacy import does not reconstruct normalized Tripletex API calls; apiCallCount/apiCalls remain unavailable in v1 imports.",
      ],
    },
    error,
  };
}

function pickMatchingLeaderboardEntry(leaderboardSnapshot, legacyTaskId) {
  if (!leaderboardSnapshot || !legacyTaskId) {
    return undefined;
  }

  return leaderboardSnapshot.entries?.find(
    (entry) => entry.tx_task_id === legacyTaskId,
  );
}

function buildEvaluation({
  legacyTaskId,
  taskAttribution,
  leaderboardDiff,
  leaderboardBefore,
  leaderboardAfter,
}) {
  const observedAt =
    taskAttribution?.generated_at ??
    taskAttribution?.after_captured_at ??
    leaderboardAfter?.captured_at;
  const matchingDiffEntries = Array.isArray(leaderboardDiff)
    ? leaderboardDiff.filter((entry) => entry.tx_task_id === legacyTaskId)
    : [];
  const matchingDiff = matchingDiffEntries.length === 1 ? matchingDiffEntries[0] : undefined;
  const beforeEntry = pickMatchingLeaderboardEntry(leaderboardBefore, legacyTaskId);
  const afterEntry = pickMatchingLeaderboardEntry(leaderboardAfter, legacyTaskId);

  const notes = [];
  let status = "not-available";
  let scoreTotal;
  let taskSolved;

  if (!legacyTaskId) {
    notes.push("Legacy run had no tx_task_id, so no per-task score evidence can be assigned.");
  } else if (!matchingDiff) {
    notes.push(
      matchingDiffEntries.length > 1
        ? "Multiple leaderboard diff rows matched the legacy task id, so run-level score evidence is not reliable."
        : "No single leaderboard diff row matched the legacy task id.",
    );
  } else if (matchingDiff.attempt_delta !== 1) {
    notes.push(
      `Legacy diff showed attempt_delta ${matchingDiff.attempt_delta}; importer only estimates score when exactly one attempt is attributable.`,
    );
  } else if (
    typeof matchingDiff.best_score_before === "number" &&
    typeof matchingDiff.best_score_after === "number" &&
    matchingDiff.best_score_after > matchingDiff.best_score_before
  ) {
    status = "estimated";
    scoreTotal = matchingDiff.best_score_after;
    taskSolved = scoreTotal === 4;
    notes.push(
      "Leaderboard best_score increased on the uniquely attributed task row, so the imported score is treated as an estimate of this run's score.",
    );
  } else {
    notes.push(
      "The run produced a uniquely attributed attempt, but leaderboard best_score did not increase, so the exact run score remains unknown.",
    );
  }

  return {
    evaluation:
      observedAt || notes.length > 0
        ? {
            status,
            observedAt,
            source: "competition-ui",
            scoreTotal,
            taskSolved,
            rawNotes: notes,
            evidence: {
              leaderboardEntryFingerprint: afterEntry
                ? fingerprintObject("lb-entry", afterEntry)
                : undefined,
              notes,
            },
          }
        : undefined,
    matchingDiff,
    beforeEntry,
    afterEntry,
  };
}

function buildAttribution({
  bridgeResult,
  taskAttribution,
  leaderboardBefore,
  leaderboardAfter,
  leaderboardDiff,
  declaredTask,
}) {
  const attribution = JSON.parse(JSON.stringify(bridgeResult.attribution));
  attribution.observedAt =
    taskAttribution?.generated_at ??
    taskAttribution?.after_captured_at ??
    leaderboardAfter?.captured_at;
  attribution.taskIdMatchesDeclared =
    attribution.attributedTaskId !== undefined
      ? attribution.attributedTaskId === declaredTask.taskId
      : undefined;
  attribution.evidence = {
    ...attribution.evidence,
    leaderboardBeforeFingerprint: leaderboardBefore
      ? fingerprintObject("lb-before", leaderboardBefore)
      : undefined,
    leaderboardAfterFingerprint: leaderboardAfter
      ? fingerprintObject("lb-after", leaderboardAfter)
      : undefined,
    leaderboardDiffFingerprint: Array.isArray(leaderboardDiff)
      ? fingerprintObject("lb-diff", leaderboardDiff)
      : undefined,
    notes: [
      ...(attribution.evidence?.notes ?? []),
      taskAttribution?.diff_entry_count !== undefined
        ? `legacy leaderboard diff_entry_count ${taskAttribution.diff_entry_count}`
        : "legacy leaderboard diff_entry_count unavailable",
    ],
  };

  return attribution;
}

function buildRequestInfo(request, manifest) {
  const promptText =
    typeof request?.prompt === "string" && request.prompt.trim() !== ""
      ? request.prompt
      : undefined;
  const files = Array.isArray(request?.files)
    ? request.files.map((file, index) => ({
        fileName: file.fileName ?? file.name ?? `legacy-file-${index + 1}`,
        mediaType: file.mediaType ?? file.mimeType,
        byteSize:
          typeof file.byteSize === "number"
            ? file.byteSize
            : typeof file.size === "number"
              ? file.size
              : undefined,
        sha256: typeof file.sha256 === "string" ? file.sha256 : undefined,
      }))
    : [];

  return {
    requestFingerprint: `req:${sha256Hex(
      stableStringify({
        promptText,
        files,
      }),
    )}`,
    promptText,
    files,
    credentialSource:
      typeof manifest?.credentials_source === "string"
        ? `legacy:${manifest.credentials_source}`
        : "legacy:unknown",
  };
}

function buildInputInfo() {
  return {
    inputSchemaId: LEGACY_INPUT_SCHEMA_ID,
    status: "ambiguous",
    source: "replay",
    issues: [
      {
        code: "unsupported-request",
        message:
          "Legacy run import preserves sanitized request text but does not reconstruct canonical structured input fields.",
      },
    ],
  };
}

function createSidecarRef({ sidecarId, kind, fileName, createdAt, payload }) {
  const serialized = `${JSON.stringify(payload, null, 2)}\n`;
  return {
    ref: {
      sidecarId,
      kind,
      path: fileName,
      mediaType: "application/json",
      createdAt,
      sha256: `sha256:${sha256Hex(serialized)}`,
      summary: payload.summary,
    },
    file: {
      schemaVersion: RUN_SIDECAR_SCHEMA_VERSION,
      runId: payload.runId,
      sidecarId,
      kind,
      createdAt,
      payload,
    },
  };
}

async function writeJsonFile(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function collectRunDirs({ sourceDir, runIds, limit }) {
  if (runIds.length > 0) {
    const selected = runIds.map((runId) => path.join(sourceDir, runId));
    return limit ? selected.slice(0, limit) : selected;
  }

  const dirEntries = await fs.readdir(sourceDir, { withFileTypes: true });
  const runDirs = dirEntries
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(sourceDir, entry.name))
    .sort();

  return runDirs;
}

async function importLegacyRun(runDir, outputDir, force) {
  const runId = path.basename(runDir);
  const manifest = await readJsonIfExists(path.join(runDir, "manifest.json"));
  const request = await readJsonIfExists(path.join(runDir, "request.json"));
  const taskAttribution = await readJsonIfExists(
    path.join(runDir, "task-attribution.json"),
  );
  const leaderboardBefore = await readJsonIfExists(
    path.join(runDir, "leaderboard.before.json"),
  );
  const leaderboardAfter = await readJsonIfExists(
    path.join(runDir, "leaderboard.after.json"),
  );
  const leaderboardDiff = await readJsonIfExists(
    path.join(runDir, "leaderboard.diff.json"),
  );

  if (!manifest && !taskAttribution && !request) {
    return {
      runId,
      status: "skipped",
      reason: "missing usable legacy files",
    };
  }

  const bridgeResult = bridgeLegacyTripletex1TaskAttribution({
    txTaskId: taskAttribution?.tx_task_id,
    inferenceStatus: taskAttribution?.inference_status,
  });
  const declaredTask = selectDeclaredTask(bridgeResult);
  const strategy = await describeLegacyStrategy(runDir);
  const execution = buildExecution(manifest, taskAttribution);
  const attribution = buildAttribution({
    bridgeResult,
    taskAttribution,
    leaderboardBefore,
    leaderboardAfter,
    leaderboardDiff,
    declaredTask,
  });
  const {
    evaluation,
    matchingDiff,
    beforeEntry,
    afterEntry,
  } = buildEvaluation({
    legacyTaskId: bridgeResult.legacyTaskId,
    taskAttribution,
    leaderboardDiff,
    leaderboardBefore,
    leaderboardAfter,
  });

  const artifactRunId = `legacy-tripletex1-${runId}`;
  const runCreatedAt =
    manifest?.created_at ??
    taskAttribution?.task_complete_timestamp ??
    taskAttribution?.generated_at ??
    new Date().toISOString();
  const runDate = runCreatedAt.slice(0, 10);
  const artifactDir = path.join(outputDir, runDate);
  const artifactBaseName = `run-${artifactRunId}`;
  const artifactPath = path.join(artifactDir, `${artifactBaseName}.json`);

  try {
    if (!force) {
      await fs.access(artifactPath);
      return {
        runId,
        status: "skipped",
        reason: "artifact exists",
      };
    }
  } catch (error) {
    if (!error || error.code !== "ENOENT") {
      throw error;
    }
  }

  const sidecars = [];
  const analysisNotes = [
    "Imported from a legacy Tripletex1 per-run directory into canonical tripletex2 run-artifact.v1 format.",
    "task.taskId is treated as a replay-time import label because legacy runs did not persist canonical pre-execution task routing.",
    ...strategy.notes,
  ];
  if (declaredTask.taskId === UNKNOWN_TASK_ID) {
    analysisNotes.push(
      "No reliable canonical task mapping was available, so the run remains in a legacy unattributed bucket.",
    );
  }

  const attributionSidecarCreatedAt = attribution.observedAt ?? runCreatedAt;
  const attributionSidecarId = "attrib-1";
  const attributionSidecarName = `${artifactBaseName}.attribution.json`;
  const attributionSidecar = createSidecarRef({
    sidecarId: attributionSidecarId,
    kind: "attribution-evidence",
    fileName: attributionSidecarName,
    createdAt: attributionSidecarCreatedAt,
    payload: {
      runId: artifactRunId,
      summary:
        "Sanitized legacy attribution evidence: task-attribution metadata, bridge result, and leaderboard diff snapshots.",
      evidence: attribution.evidence,
      legacyOutcome: {
        completionReason: taskAttribution?.completion_reason,
        inferenceStatus: taskAttribution?.inference_status,
        txTaskId: taskAttribution?.tx_task_id,
        diffEntryCount: taskAttribution?.diff_entry_count,
        beforeCapturedAt: taskAttribution?.before_captured_at,
        afterCapturedAt: taskAttribution?.after_captured_at,
      },
      bridge: {
        legacyTaskId: bridgeResult.legacyTaskId,
        canonicalTaskId: bridgeResult.canonicalTask?.taskId,
        mappingConfidence: bridgeResult.bridgeEntry?.mappingConfidence,
        status: bridgeResult.bridgeEntry?.status,
        notes: bridgeResult.bridgeEntry?.notes,
      },
      leaderboard: {
        diff: Array.isArray(leaderboardDiff) ? leaderboardDiff : [],
        beforeEntry,
        afterEntry,
      },
    },
  });
  sidecars.push(attributionSidecar.ref);
  attribution.evidenceSidecarIds = [attributionSidecarId];

  let evaluationSidecar;
  if (evaluation) {
    const evaluationSidecarId = "score-1";
    const evaluationSidecarName = `${artifactBaseName}.evaluation.json`;
    evaluationSidecar = createSidecarRef({
      sidecarId: evaluationSidecarId,
      kind: "evaluation-evidence",
      fileName: evaluationSidecarName,
      createdAt: evaluation.observedAt ?? runCreatedAt,
      payload: {
        runId: artifactRunId,
        summary:
          evaluation.status === "estimated"
            ? "Sanitized legacy leaderboard evidence used to estimate a run score."
            : "Sanitized legacy leaderboard evidence showing why a run score could not be assigned reliably.",
        evidence: evaluation.evidence,
        matchingDiff,
        beforeEntry,
        afterEntry,
      },
    });
    sidecars.push(evaluationSidecar.ref);
    evaluation.evidenceSidecarIds = [evaluationSidecarId];
  }

  const artifact = {
    schemaVersion: RUN_ARTIFACT_SCHEMA_VERSION,
    runId: artifactRunId,
    createdAt: runCreatedAt,
    mode: mapLegacyMode(manifest),
    task: declaredTask,
    strategy: {
      strategyId: strategy.strategyId,
      strategyName: strategy.strategyName,
      strategyPath: strategy.strategyPath,
      strategyStatus: strategy.strategyStatus,
    },
    selection: {
      selectionConfigId: LEGACY_SELECTION_CONFIG_ID,
      selectionConfigPath: toRepoRelativePath(path.join(runDir, "manifest.json")),
    },
    request: buildRequestInfo(request, manifest),
    input: buildInputInfo(),
    execution,
    attribution,
    evaluation,
    sidecars,
    analysis: {
      notes: analysisNotes,
      failureMode:
        evaluation?.status === "not-available"
          ? "Legacy run-level score could not be recovered from leaderboard snapshots."
          : undefined,
    },
  };

  await writeJsonFile(artifactPath, artifact);
  await writeJsonFile(path.join(artifactDir, attributionSidecarName), attributionSidecar.file);

  if (evaluationSidecar) {
    await writeJsonFile(
      path.join(artifactDir, evaluationSidecar.ref.path),
      evaluationSidecar.file,
    );
  }

  return {
    runId,
    status: "imported",
    artifactPath,
    attributedTaskId: attribution.attributedTaskId ?? null,
    declaredTaskId: declaredTask.taskId,
    evaluationStatus: evaluation?.status ?? null,
    scoreTotal: evaluation?.scoreTotal ?? null,
  };
}

export async function main() {
  const options = parseArgs(process.argv.slice(2));
  const runDirs = await collectRunDirs(options);
  const filteredRunDirs = [];

  for (const runDir of runDirs) {
    const taskAttribution = await readJsonIfExists(
      path.join(runDir, "task-attribution.json"),
    );
    if (!taskAttribution && options.runIds.length === 0) {
      continue;
    }
    filteredRunDirs.push(runDir);
  }

  const selectedRunDirs = options.limit
    ? filteredRunDirs.slice(0, options.limit)
    : filteredRunDirs;

  const results = [];
  for (const runDir of selectedRunDirs) {
    results.push(await importLegacyRun(runDir, options.outputDir, options.force));
  }

  const imported = results.filter((result) => result.status === "imported");
  const skipped = results.filter((result) => result.status === "skipped");

  console.log(
    JSON.stringify(
      {
        sourceDir: options.sourceDir,
        outputDir: options.outputDir,
        attempted: results.length,
        imported: imported.length,
        skipped: skipped.length,
        results,
      },
      null,
      2,
    ),
  );
}

const invokedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : null;

if (invokedPath === import.meta.url) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack : String(error));
    process.exit(1);
  });
}
