import path from "node:path";

import {
  loadActiveStrategyResolver,
  requireTaskModule,
  requireTaskSpec,
} from "../registry/tasks";
import { CANONICAL_TASK_REGISTRY } from "../registry/legacy-tripletex1-task-bridge";
import type { RunArtifactV1, TaskStrategy } from "../runtime/contracts";
import {
  loadCandidateStore,
  summarizeCandidateStatuses,
} from "./candidate-store";
import {
  getResearchQueueEntry,
  loadResearchTaskQueue,
} from "./queue";
import {
  listFilesRecursive,
  readJsonFile,
  readTextFileIfExists,
  resolveResearchPath,
  tripletex1Root,
  tripletex2Root,
  writeJsonFile,
} from "./store";
import { buildTaskVerificationPlan } from "./verification-plan";
import {
  RESEARCH_PACKET_SCHEMA_VERSION,
  type ResearchFrontierSummary,
  type ResearchHistoricalRunScore,
  type ResearchHistoricalRunSummary,
  type ResearchPacketRunEvidence,
  type ResearchPacketStrategySummary,
  type ResearchPromptExample,
  type ResearchTaskPacket,
  type ResearchVerificationContractSummary,
} from "./types";

const TASK_FAILURE_MODE_PATTERN =
  /\b(422|validation|failed|repair|blocked|do not|avoid|omit|retry|require|division|department|bank account)\b/i;
const TASK_06_RUNS_ROOT = path.join(
  tripletex1Root,
  "data",
  "production",
  "runs",
);
const TASK_06_FRESH_ACCOUNT_REQUEST_PATH = [
  "POST /employee",
  "GET /employee/employment?employeeId=<newId>&fields=*",
];
const TASK_06_PERSISTENT_SANDBOX_REQUEST_PATH = [
  "POST /employee",
  "GET /department?isInactive=false&count=1&fields=*",
  "POST /employee",
  "GET /division?count=1&fields=*",
  "POST /employee",
  "GET /employee/employment?employeeId=<newId>&fields=*",
];

interface TaskPacketAdditions {
  historicalRuns?: ResearchHistoricalRunSummary[];
  promptExamples?: ResearchPromptExample[];
  frontier?: ResearchFrontierSummary;
  verificationContract?: ResearchVerificationContractSummary;
  operatorNotes?: string[];
}

interface Task06HistoricalRunProfile {
  runId: string;
  apiCallCount: number;
  outcome: string;
  failureMode: string;
  whatWentWrong: string;
  nextLesson: string;
  requestPath: string[];
}

interface Task06PromptExampleProfile {
  runId: string;
  languageHint: string;
  whyItMatters: string;
  requestPath: string[];
}

const TASK_06_HISTORICAL_RUN_PROFILES: readonly Task06HistoricalRunProfile[] = [
  {
    runId: "prod-2026-03-20-161444237Z-7ff6c14f",
    apiCallCount: 3,
    outcome:
      "Correct employee state, but production overpaid by one call before the first write.",
    failureMode: "Wasted proactive department pre-read in production.",
    whatWentWrong:
      "The run followed an older sandbox-biased playbook and spent GET /department before trying the direct employee create.",
    nextLesson:
      "Treat GET /department and GET /division as validation-driven repair branches only; the exact create-only employee task should start with POST /employee.",
    requestPath: [
      "GET /department?isInactive=false&count=1&fields=*",
      ...TASK_06_FRESH_ACCOUNT_REQUEST_PATH,
    ],
  },
  {
    runId: "prod-2026-03-20-201151100Z-8fe4b18f",
    apiCallCount: 2,
    outcome:
      "Fresh-account proof that the canonical safe branch is still two calls.",
    failureMode:
      "No API-shape failure; the gap was documentation that did not state the 2-call floor sharply enough.",
    whatWentWrong:
      "The production run itself was correct, but the docs still left room to overfit to sandbox repair branches or under-verify with a risky 1-call stop.",
    nextLesson:
      "The standard exact branch is POST /employee followed by one decisive GET /employee/employment when startDate is scored and the create response is sparse.",
    requestPath: TASK_06_FRESH_ACCOUNT_REQUEST_PATH,
  },
  {
    runId: "prod-2026-03-20-224058181Z-16b4baa8",
    apiCallCount: 2,
    outcome:
      "English production re-proof of the same two-call fresh-account branch.",
    failureMode:
      "No production bug; the unresolved risk was pretending the sparse create response made a 1-call stop safe.",
    whatWentWrong:
      "Nothing failed in production, but persistent-sandbox evidence was still much noisier and could tempt future agents into paying repair reads proactively.",
    nextLesson:
      "There is still no trusted 1-call replacement for startDate-scored employee-create tasks because the successful POST /employee response often omits startDate.",
    requestPath: TASK_06_FRESH_ACCOUNT_REQUEST_PATH,
  },
  {
    runId: "prod-2026-03-20-224447345Z-a392afd8",
    apiCallCount: 2,
    outcome:
      "Portuguese production re-proof with full score and Unicode-preserving verification.",
    failureMode:
      "No API failure; the gap was not documenting mixed-language date normalization and Unicode preservation explicitly enough.",
    whatWentWrong:
      "Before this run, the docs did not call out strongly enough that Portuguese prose plus English month names still stays on the same employee-create branch and that names like João must remain exact.",
    nextLesson:
      "Normalize mixed-language dates to ISO and preserve Unicode names exactly, but do not let prompt language push the flow away from POST /employee plus employment readback.",
    requestPath: TASK_06_FRESH_ACCOUNT_REQUEST_PATH,
  },
];

const TASK_06_PROMPT_EXAMPLE_PROFILES: readonly Task06PromptExampleProfile[] = [
  {
    runId: "prod-2026-03-20-224058181Z-16b4baa8",
    languageHint: "English",
    whyItMatters:
      "Canonical plain-English create-employee prompt proving the exact 2-call fresh-account branch.",
    requestPath: TASK_06_FRESH_ACCOUNT_REQUEST_PATH,
  },
  {
    runId: "prod-2026-03-20-224201582Z-3d4e5838",
    languageHint: "French with mixed-language month names",
    whyItMatters:
      "Canonical multilingual prompt showing that mixed-language dates still normalize to ISO without changing the endpoint path.",
    requestPath: TASK_06_FRESH_ACCOUNT_REQUEST_PATH,
  },
  {
    runId: "prod-2026-03-20-224447345Z-a392afd8",
    languageHint: "Portuguese with Unicode name",
    whyItMatters:
      "Canonical Unicode-sensitive prompt proving that names like João must be preserved exactly while staying on the same 2-call path.",
    requestPath: TASK_06_FRESH_ACCOUNT_REQUEST_PATH,
  },
  {
    runId: "prod-2026-03-20-201151100Z-8fe4b18f",
    languageHint: "Spanish",
    whyItMatters:
      "Canonical post-run proof that the exact fresh-account branch is still POST /employee plus one employment readback, with no department pre-read.",
    requestPath: TASK_06_FRESH_ACCOUNT_REQUEST_PATH,
  },
];

export interface BuildTaskPacketOptions {
  taskId: string;
  queuePath?: string;
  candidateStorePath?: string;
  packetRoot?: string;
  now?: () => Date;
}

export interface BuildTaskPacketResult {
  packet: ResearchTaskPacket;
  packetPath: string;
}

export async function buildTaskPacket(
  options: BuildTaskPacketOptions,
): Promise<BuildTaskPacketResult> {
  const queue = await loadResearchTaskQueue(options.queuePath);
  const queueEntry = getResearchQueueEntry(queue, options.taskId);
  if (!queueEntry) {
    throw new Error(
      `Task "${options.taskId}" is not present in the durable research queue.`,
    );
  }

  const taskSpec = requireTaskSpec(options.taskId);
  const taskModule = await requireTaskModule(options.taskId);
  const activeStrategyResolver = await loadActiveStrategyResolver();
  const activeSelection = activeStrategyResolver.getResolvedSelection(options.taskId);
  const candidateStore = await loadCandidateStore(options.candidateStorePath);
  const canonicalTask =
    CANONICAL_TASK_REGISTRY.find((entry) => entry.taskId === options.taskId) ??
    {
      taskId: options.taskId,
      txTaskId: queueEntry.txTaskId,
      taskSlug: queueEntry.taskSlug,
      taskName: queueEntry.taskName,
      summary: taskSpec.summary,
    };

  const taskReadmePath = path.join(
    tripletex2Root,
    "src",
    "tasks",
    `task-${options.taskId}`,
    "README.md",
  );
  const trustedStandardPath = path.join(
    tripletex2Root,
    "research",
    "legacy",
    "trusted-standards",
    `${canonicalTask.taskSlug}.md`,
  );
  const taskPlaybookPath = path.join(
    tripletex2Root,
    "research",
    "legacy",
    "task-playbooks",
    `${canonicalTask.taskSlug}.md`,
  );

  const [
    readmeText,
    trustedStandardText,
    playbookText,
    tripletex2Evidence,
    legacyEvidence,
    taskSpecificAdditions,
  ] = await Promise.all([
    readTextFileIfExists(taskReadmePath),
    readTextFileIfExists(trustedStandardPath),
    readTextFileIfExists(taskPlaybookPath),
    gatherTripletex2Evidence(options.taskId),
    gatherLegacyEvidence(queueEntry.txTaskId),
    gatherTaskSpecificPacketAdditions(options.taskId),
  ]);

  const availableStrategies = taskModule.strategies.map(summarizeStrategy);
  const activeStrategy = activeSelection
    ? summarizeStrategy(activeSelection.strategy)
    : undefined;
  const baselineCallBudget =
    queueEntry.baselineCallBudget ??
    activeSelection?.strategy.expectedCallProfile?.targetCalls;
  const packetCreatedAt = resolveNow(options.now).toISOString();
  const packetId = `task-${options.taskId}-packet-${packetCreatedAt.replace(/[:.]/g, "-")}`;
  const packetPath = path.join(
    options.packetRoot ?? resolveResearchPath("packets"),
    `task-${options.taskId}`,
    `${packetId}.json`,
  );

  const packet: ResearchTaskPacket = {
    schemaVersion: RESEARCH_PACKET_SCHEMA_VERSION,
    packetId,
    createdAt: packetCreatedAt,
    taskId: canonicalTask.taskId,
    txTaskId: canonicalTask.txTaskId,
    taskSlug: canonicalTask.taskSlug,
    taskName: canonicalTask.taskName,
    queueEntry,
    ...(activeStrategy ? { activeStrategy } : {}),
    availableStrategies,
    ...(baselineCallBudget !== undefined ? { baselineCallBudget } : {}),
    candidateSummary: {
      totalCandidates: candidateStore.entries.filter(
        (entry) => entry.taskId === options.taskId,
      ).length,
      statuses: summarizeCandidateStatuses(candidateStore, options.taskId),
    },
    tripletex2Evidence,
    ...(taskSpecificAdditions.historicalRuns
      ? { historicalRuns: taskSpecificAdditions.historicalRuns }
      : {}),
    ...(taskSpecificAdditions.promptExamples
      ? { promptExamples: taskSpecificAdditions.promptExamples }
      : {}),
    legacyEvidence,
    taskContext: {
      ...(readmeText ? { readmeText } : {}),
      ...(trustedStandardText ? { trustedStandardText } : {}),
      ...(playbookText ? { playbookText } : {}),
      knownFailureModes: collectKnownFailureModes([
        readmeText,
        trustedStandardText,
        playbookText,
      ]),
    },
    ...(taskSpecificAdditions.frontier
      ? { frontier: taskSpecificAdditions.frontier }
      : {}),
    ...(taskSpecificAdditions.verificationContract
      ? { verificationContract: taskSpecificAdditions.verificationContract }
      : {}),
    proof: {
      ...(queueEntry.proofInputPath ? { inputPath: queueEntry.proofInputPath } : {}),
      ...(queueEntry.verificationPlanId || options.taskId === "06"
        ? { verificationPlan: buildTaskVerificationPlan(options.taskId) }
        : {}),
    },
    operatorNotes: [
      ...queueEntry.notes,
      ...(queueEntry.operatorNotes ?? []),
      ...(taskSpecificAdditions.operatorNotes ?? []),
      `Task packet built from checked-in repo evidence for task ${options.taskId}.`,
      "Legacy Tripletex1 leaderboard and attribution history are offline evidence only, not live runtime truth.",
      activeStrategy
        ? `Current active deterministic strategy: ${activeStrategy.strategyId}.`
        : "No active deterministic strategy is pinned for this task.",
    ],
  };

  await writeJsonFile(packetPath, packet);

  return {
    packet,
    packetPath,
  };
}

function summarizeStrategy(
  strategy: TaskStrategy<any, string>,
): ResearchPacketStrategySummary {
  return {
    strategyId: strategy.strategyId,
    strategyPath: strategy.strategyPath,
    strategyStatus: strategy.status,
    ...(strategy.name ? { strategyName: strategy.name } : {}),
    ...(strategy.summary ? { summary: strategy.summary } : {}),
    ...(strategy.hypothesis ? { hypothesis: strategy.hypothesis } : {}),
    ...(strategy.expectedCallProfile
      ? {
          expectedCallProfile: {
            ...(strategy.expectedCallProfile.targetCalls !== undefined
              ? { targetCalls: strategy.expectedCallProfile.targetCalls }
              : {}),
            ...(strategy.expectedCallProfile.maxCalls !== undefined
              ? { maxCalls: strategy.expectedCallProfile.maxCalls }
              : {}),
          },
        }
      : {}),
    ...(strategy.stepOutline ? { stepOutline: strategy.stepOutline } : {}),
  };
}

async function gatherTripletex2Evidence(
  taskId: string,
): Promise<ResearchTaskPacket["tripletex2Evidence"]> {
  const runFiles = await listFilesRecursive(path.join(tripletex2Root, "runs"));
  const artifactFiles = runFiles.filter(
    (filePath) => filePath.endsWith(".json") && !filePath.endsWith(".trace.json"),
  );
  const matchingArtifacts: ResearchPacketRunEvidence[] = [];

  for (const artifactPath of artifactFiles) {
    const artifact = await readJsonFile<RunArtifactV1>(artifactPath);
    if (artifact.task.taskId !== taskId) {
      continue;
    }

    matchingArtifacts.push({
      runId: artifact.runId,
      artifactPath,
      createdAt: artifact.createdAt,
      runtimeStatus: artifact.execution.runtimeStatus,
      strategyId: artifact.strategy.strategyId,
      apiCallCount: artifact.execution.apiCallCount,
      ...(artifact.analysis?.failureMode
        ? { failureMode: artifact.analysis.failureMode }
        : {}),
    });
  }

  matchingArtifacts.sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  );

  return {
    runCount: matchingArtifacts.length,
    recentArtifacts: matchingArtifacts.slice(0, 5),
  };
}

async function gatherLegacyEvidence(
  txTaskId: string,
): Promise<ResearchTaskPacket["legacyEvidence"]> {
  const leaderboardSnapshots = await readJsonlFile(
    path.join(tripletex1Root, "data", "leaderboard-history.jsonl"),
  );
  const promptLabels = await readJsonlFile(
    path.join(tripletex1Root, "data", "prompt-task-labels.jsonl"),
  );
  const matchingSnapshots = leaderboardSnapshots
    .map((snapshot) => {
      const entry = Array.isArray(snapshot.entries)
        ? snapshot.entries.find(
            (candidate) =>
              candidate &&
              typeof candidate === "object" &&
              "tx_task_id" in candidate &&
              candidate.tx_task_id === txTaskId,
          )
        : undefined;
      if (!entry || typeof entry !== "object") {
        return undefined;
      }

      return {
        capturedAt:
          typeof snapshot.captured_at === "string"
            ? snapshot.captured_at
            : "unknown",
        bestScore:
          typeof entry.best_score === "number" ? entry.best_score : undefined,
        totalAttempts:
          typeof entry.total_attempts === "number" ? entry.total_attempts : undefined,
        runId: typeof snapshot.run_id === "string" ? snapshot.run_id : undefined,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== undefined)
    .sort((left, right) => right.capturedAt.localeCompare(left.capturedAt))
    .slice(0, 5);

  const matchingPromptLabels = promptLabels
    .filter(
      (entry) =>
        entry &&
        typeof entry === "object" &&
        "tx_task_id" in entry &&
        entry.tx_task_id === txTaskId,
    )
    .map((entry) =>
      typeof entry.run_id === "string" ? entry.run_id : undefined,
    )
    .filter((runId): runId is string => typeof runId === "string")
    .slice(-5)
    .reverse();

  return {
    leaderboardSnapshots: matchingSnapshots,
    promptLabelSampleCount: matchingPromptLabels.length,
    recentAttributedRunIds: matchingPromptLabels,
    evidenceWarnings: [
      "Legacy Tripletex1 prompt labels and run history are offline evidence only.",
      "Legacy tx_task_id attribution can be semantically noisy; interpret it alongside trusted standards and playbooks rather than as live task truth.",
    ],
  };
}

export function collectKnownFailureModes(
  texts: Array<string | undefined>,
): string[] {
  const matches = new Set<string>();

  for (const text of texts) {
    if (!text) {
      continue;
    }

    for (const line of text.split("\n")) {
      const normalized = line.trim().replace(/^[-*]\s*/, "");
      if (normalized.length === 0) {
        continue;
      }
      if (TASK_FAILURE_MODE_PATTERN.test(normalized)) {
        matches.add(normalized);
      }
    }
  }

  return Array.from(matches).slice(0, 20);
}

async function gatherTaskSpecificPacketAdditions(
  taskId: string,
): Promise<TaskPacketAdditions> {
  switch (taskId) {
    case "06":
      return gatherTask06PacketAdditions();
    default:
      return {};
  }
}

async function gatherTask06PacketAdditions(): Promise<TaskPacketAdditions> {
  const [historicalRuns, promptExamples] = await Promise.all([
    Promise.all(
      TASK_06_HISTORICAL_RUN_PROFILES.map((profile) =>
        loadTask06HistoricalRunSummary(profile),
      ),
    ),
    Promise.all(
      TASK_06_PROMPT_EXAMPLE_PROFILES.map((profile) =>
        loadTask06PromptExample(profile),
      ),
    ),
  ]);

  return {
    historicalRuns,
    promptExamples,
    frontier: buildTask06FrontierSummary(),
    verificationContract: buildTask06VerificationContractSummary(),
    operatorNotes: [
      "For task 06, treat historicalRuns, promptExamples, frontier, and verificationContract below as the canonical working synthesis.",
      "Do not rely on legacy tx_task_id prompt labels alone for task 06; semantic create-employee evidence was curated separately because tx_task_id attribution is noisy in that dataset.",
    ],
  };
}

async function loadTask06HistoricalRunSummary(
  profile: Task06HistoricalRunProfile,
): Promise<ResearchHistoricalRunSummary> {
  const runPath = path.join(TASK_06_RUNS_ROOT, profile.runId);
  const requestArtifactPath = path.join(runPath, "request.json");
  const submissionScorePath = path.join(runPath, "submission-score.json");
  const reflectionPath = path.join(runPath, "codex-reflection.summary.md");
  const request = await readJsonFile<{ prompt?: string }>(requestArtifactPath);
  const submissionScore = await readOptionalJsonFile<Record<string, unknown>>(
    submissionScorePath,
  );
  const hasReflection = (await readTextFileIfExists(reflectionPath)) !== undefined;
  const promptText =
    typeof request.prompt === "string" ? request.prompt.trim() : profile.runId;

  return {
    runId: profile.runId,
    createdAt: parseRunIdTimestamp(profile.runId),
    runPath,
    promptExcerpt: truncateText(promptText, 220),
    requestPath: [...profile.requestPath],
    apiCallCount: profile.apiCallCount,
    outcome: profile.outcome,
    failureMode: profile.failureMode,
    whatWentWrong: profile.whatWentWrong,
    nextLesson: profile.nextLesson,
    ...(submissionScore ? { score: buildSubmissionScoreSummary(submissionScore) } : {}),
    sourceArtifacts: [
      requestArtifactPath,
      ...(submissionScore ? [submissionScorePath] : []),
      ...(hasReflection ? [reflectionPath] : []),
    ],
  };
}

async function loadTask06PromptExample(
  profile: Task06PromptExampleProfile,
): Promise<ResearchPromptExample> {
  const runPath = path.join(TASK_06_RUNS_ROOT, profile.runId);
  const requestArtifactPath = path.join(runPath, "request.json");
  const request = await readJsonFile<{ prompt?: string }>(requestArtifactPath);
  const promptText =
    typeof request.prompt === "string" ? request.prompt.trim() : "";

  return {
    runId: profile.runId,
    createdAt: parseRunIdTimestamp(profile.runId),
    sourcePath: requestArtifactPath,
    languageHint: profile.languageHint,
    promptText,
    requestPath: [...profile.requestPath],
    whyItMatters: profile.whyItMatters,
  };
}

function buildTask06FrontierSummary(): ResearchFrontierSummary {
  return {
    summary:
      "Task 06 is no longer blocked on endpoint choice. The current frontier is whether any fresh-account proof can safely collapse the exact startDate-scored create-employee task below two calls. Right now the answer is still no: the strongest known branch remains direct POST /employee followed by one decisive GET /employee/employment because the create response often omits startDate even when the write succeeds.",
    strongestKnownBranch: {
      label:
        "Fresh-account exact create-employee branch with explicit userType and one employment readback",
      apiCallCount: 2,
      requestPath: [...TASK_06_FRESH_ACCOUNT_REQUEST_PATH],
      proofRunIds: [
        "prod-2026-03-20-201151100Z-8fe4b18f",
        "prod-2026-03-20-224058181Z-16b4baa8",
        "prod-2026-03-20-224447345Z-a392afd8",
      ],
    },
    nextHypotheses: [
      "Only chase a 1-call replacement if a fresh-account production run or verifier artifact proves that POST /employee itself returns authoritative employments[].startDate for the exact scored shape.",
      "Treat multilingual date normalization and Unicode-name preservation as solved input-handling rules, not as reasons to add reads or change endpoints.",
      "Keep sandbox-only department/division repair work confined to the persistent-sandbox branch; it is verifier hygiene, not evidence that the production hot path should pre-read anything.",
    ],
    antiPatterns: [
      "Do not spend proactive GET /department or GET /division in the fresh-account branch.",
      "Do not stop after one POST /employee unless the create response explicitly proves the scored startDate.",
      "Do not let generic tx_task_id labels outrank the curated semantic run set for create-employee.",
      "Do not transliterate names like João or drift away from ISO-normalized dates.",
    ],
  };
}

function buildTask06VerificationContractSummary(): ResearchVerificationContractSummary {
  return {
    summary:
      "Verification for task 06 has two distinct branches. The fresh-account winning branch is a 2-call proof of correctness; the persistent sandbox is only a repair branch that can cost 6 calls when department and division must be repaired before the final employment readback.",
    freshAccountBranch: {
      label: "Winning production-style branch",
      apiCallCount: 2,
      requestPath: [...TASK_06_FRESH_ACCOUNT_REQUEST_PATH],
      proofRequirements: [
        "POST /employee must send firstName, lastName, dateOfBirth, email, userType=NO_ACCESS, and employments[].startDate.",
        "GET /employee/employment must confirm the same employee identity plus the requested startDate.",
        "No proactive department, division, or employee lookup reads are allowed in this branch.",
      ],
    },
    persistentSandboxBranch: {
      label: "Verifier repair branch for the current persistent sandbox",
      apiCallCount: 6,
      requestPath: [...TASK_06_PERSISTENT_SANDBOX_REQUEST_PATH],
      repairSignals: [
        'validationMessages[].field == "department.id"',
        'validationMessages[].field == "employments.division.id"',
      ],
      proofRequirements: [
        "Repair reads are justified only after the exact live 422 field proves they are needed.",
        "The final GET /employee/employment is still mandatory when startDate is scored and the create response is sparse.",
        "This branch is sandbox-only proof machinery and must not be promoted into the fresh-account hot path.",
      ],
    },
  };
}

async function readJsonlFile(filePath: string): Promise<any[]> {
  const raw = await readTextFileIfExists(filePath);
  if (!raw) {
    return [];
  }

  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as unknown);
}

async function readOptionalJsonFile<TValue>(
  filePath: string,
): Promise<TValue | undefined> {
  const raw = await readTextFileIfExists(filePath);
  if (!raw) {
    return undefined;
  }

  return JSON.parse(raw) as TValue;
}

function buildSubmissionScoreSummary(
  raw: Record<string, unknown>,
): ResearchHistoricalRunScore {
  return {
    status: typeof raw.status === "string" ? raw.status : "unknown",
    ...(typeof raw.normalized_score === "number"
      ? { normalizedScore: raw.normalized_score }
      : {}),
    ...(typeof raw.score_raw === "number" ? { scoreRaw: raw.score_raw } : {}),
    ...(typeof raw.score_max === "number" ? { scoreMax: raw.score_max } : {}),
    ...(typeof raw.candidate_count === "number"
      ? { candidateCount: raw.candidate_count }
      : {}),
    ...(typeof raw.reason === "string" ? { reason: raw.reason } : {}),
    ...(typeof raw.feedback_comment === "string"
      ? { feedbackComment: raw.feedback_comment }
      : {}),
    ...(typeof raw.all_checks_passed === "boolean"
      ? { allChecksPassed: raw.all_checks_passed }
      : {}),
  };
}

function parseRunIdTimestamp(runId: string): string {
  const match = runId.match(
    /^(?:prod|test)-(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})(\d{2})(\d{3})Z-/,
  );
  if (!match) {
    return "unknown";
  }

  const [, year, month, day, hour, minute, second, millis] = match;
  return `${year}-${month}-${day}T${hour}:${minute}:${second}.${millis}Z`;
}

function truncateText(text: string, maxLength: number): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function resolveNow(now?: () => Date): Date {
  return now ? now() : new Date();
}
