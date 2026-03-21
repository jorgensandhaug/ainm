import type { StrategyStatus } from "../runtime/contracts";

export const RESEARCH_QUEUE_SCHEMA_VERSION = "tripletex2.research-queue.v1";
export const CANDIDATE_STORE_SCHEMA_VERSION =
  "tripletex2.research-candidate-store.v1";
export const RESEARCH_PACKET_SCHEMA_VERSION = "tripletex2.research-packet.v1";
export const RESEARCH_VERIFICATION_PLAN_SCHEMA_VERSION =
  "tripletex2.research-verification-plan.v1";
export const RESEARCH_VERIFICATION_REPORT_SCHEMA_VERSION =
  "tripletex2.research-verification-report.v1";

export type ResearchBand = "focus" | "watch" | "kill";
export type QueueEligibility = "ready" | "hold" | "do-not-work";
export type CandidateStatus =
  | "draft"
  | "sandbox-pass"
  | "sandbox-fail"
  | "needs-review"
  | "promote-later";

export interface ResearchQueueEntry {
  taskId: string;
  txTaskId: string;
  taskSlug: string;
  taskName: string;
  priority: number;
  band: ResearchBand;
  queueEligibility: QueueEligibility;
  researchLane?: string;
  bestKnownScore?: number;
  maxScore?: number;
  baselineCallBudget?: number;
  proofInputPath?: string;
  verificationPlanId?: string;
  notes: string[];
  operatorNotes?: string[];
}

export interface ResearchTaskQueue {
  schemaVersion: typeof RESEARCH_QUEUE_SCHEMA_VERSION;
  updatedAt: string;
  entries: ResearchQueueEntry[];
}

export interface CandidateSandboxVerdict {
  correctnessPassed: boolean;
  withinBudget: boolean;
  apiCallCount: number;
  baselineCallBudget?: number;
  verificationReportPath?: string;
}

export interface CandidateRecord {
  candidateId: string;
  taskId: string;
  strategyId: string;
  strategyPath?: string;
  strategyName?: string;
  status: CandidateStatus;
  packetPath?: string;
  latestVerificationReportPath?: string;
  latestSandboxVerdict?: CandidateSandboxVerdict;
  notes: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CandidateStore {
  schemaVersion: typeof CANDIDATE_STORE_SCHEMA_VERSION;
  updatedAt: string;
  entries: CandidateRecord[];
}

export interface ResearchPacketRunEvidence {
  runId: string;
  artifactPath: string;
  createdAt: string;
  runtimeStatus: string;
  strategyId: string;
  apiCallCount: number;
  failureMode?: string;
}

export interface ResearchPacketStrategySummary {
  strategyId: string;
  strategyPath: string;
  strategyStatus: StrategyStatus;
  strategyName?: string;
  summary?: string;
  hypothesis?: string;
  expectedCallProfile?: {
    targetCalls?: number;
    maxCalls?: number;
  };
  stepOutline?: readonly string[];
}

export interface ResearchLatestCandidateStatusSummary {
  candidateId: string;
  strategyId: string;
  status: CandidateStatus;
  updatedAt: string;
  strategyPath?: string;
  strategyName?: string;
  latestVerificationReportPath?: string;
  latestSandboxVerdict?: CandidateSandboxVerdict;
}

export interface ResearchOptimizationObjective {
  frontierSummary: string;
  currentBestKnownScore?: number;
  maxScore?: number;
  scoreGap?: number;
  bestKnownCallBudget?: number;
  baselineCallBudget?: number;
  activeStrategyToBeat?: ResearchPacketStrategySummary;
  latestCandidateStatus?: ResearchLatestCandidateStatusSummary;
  improvementRequirement: string;
  successRubric: string[];
}

export interface ResearchHistoricalRunScore {
  status: string;
  normalizedScore?: number;
  scoreRaw?: number;
  scoreMax?: number;
  candidateCount?: number;
  reason?: string;
  feedbackComment?: string;
  allChecksPassed?: boolean;
}

export interface ResearchHistoricalRunSummary {
  runId: string;
  createdAt: string;
  runPath: string;
  promptExcerpt: string;
  requestPath: string[];
  apiCallCount: number;
  outcome: string;
  failureMode: string;
  whatWentWrong: string;
  nextLesson: string;
  score?: ResearchHistoricalRunScore;
  sourceArtifacts: string[];
}

export interface ResearchPromptExample {
  runId: string;
  createdAt: string;
  sourcePath: string;
  languageHint: string;
  promptText: string;
  requestPath: string[];
  whyItMatters: string;
}

export interface ResearchFrontierSummary {
  summary: string;
  strongestKnownBranch: {
    label: string;
    apiCallCount: number;
    requestPath: string[];
    proofRunIds: string[];
  };
  nextHypotheses: string[];
  antiPatterns: string[];
}

export interface ResearchVerificationContractSummary {
  summary: string;
  freshAccountBranch: {
    label: string;
    apiCallCount: number;
    requestPath: string[];
    proofRequirements: string[];
  };
  persistentSandboxBranch: {
    label: string;
    apiCallCount: number;
    requestPath: string[];
    repairSignals: string[];
    proofRequirements: string[];
  };
}

export interface ResearchVerificationAssertion {
  actualPath: string;
  equalsFromPath: string;
}

export interface ResearchVerificationObjectCheck {
  type: "object";
  checkId: string;
  description: string;
  pathTemplate: string;
  query?: Record<string, string>;
  responsePath?: string;
  assertions: ResearchVerificationAssertion[];
}

export interface ResearchVerificationCollectionCheck {
  type: "collection";
  checkId: string;
  description: string;
  pathTemplate: string;
  query?: Record<string, string>;
  collectionPath: string;
  matchPath?: string;
  matchFromPath?: string;
  assertions: ResearchVerificationAssertion[];
}

export type ResearchVerificationCheck =
  | ResearchVerificationObjectCheck
  | ResearchVerificationCollectionCheck;

export interface ResearchVerificationPlan {
  schemaVersion: typeof RESEARCH_VERIFICATION_PLAN_SCHEMA_VERSION;
  planId: string;
  taskId: string;
  checks: ResearchVerificationCheck[];
}

export interface ResearchContextLocator {
  researchInstructionsPath: string;
  taskSurface: {
    taskDirectoryPath: string;
    taskReadmePath?: string;
    taskImplementationPath: string;
  };
  strategies: {
    strategiesDirectoryPath: string;
    activeStrategyPath?: string;
    availableStrategyPaths: string[];
  };
  proof: {
    inputPath?: string;
    verificationPlanId?: string;
    verificationPlanSourcePath?: string;
    verificationCommand: string;
  };
  runtimeEvidence: {
    openapiPath: string;
    candidateStorePath: string;
    researchQueuePath: string;
    recentArtifactPaths: string[];
  };
  offlineEvidence: {
    trustedStandardPath?: string;
    taskPlaybookPath?: string;
    leaderboardHistoryPath: string;
    promptLabelHistoryPath: string;
    additionalEvidencePaths: string[];
  };
}

export interface ResearchTaskPacket {
  schemaVersion: typeof RESEARCH_PACKET_SCHEMA_VERSION;
  packetId: string;
  createdAt: string;
  taskId: string;
  txTaskId: string;
  taskSlug: string;
  taskName: string;
  queueEntry: ResearchQueueEntry;
  activeStrategy?: ResearchPacketStrategySummary;
  availableStrategies: ResearchPacketStrategySummary[];
  baselineCallBudget?: number;
  optimizationObjective: ResearchOptimizationObjective;
  contextLocator: ResearchContextLocator;
  candidateSummary: {
    totalCandidates: number;
    statuses: Record<CandidateStatus, number>;
  };
  tripletex2Evidence: {
    runCount: number;
    recentArtifacts: ResearchPacketRunEvidence[];
  };
  historicalRuns?: ResearchHistoricalRunSummary[];
  promptExamples?: ResearchPromptExample[];
  legacyEvidence: {
    leaderboardSnapshots: Array<{
      capturedAt: string;
      bestScore?: number;
      totalAttempts?: number;
      runId?: string;
    }>;
    promptLabelSampleCount: number;
    recentAttributedRunIds: string[];
    evidenceWarnings: string[];
  };
  taskContext: {
    readmeText?: string;
    trustedStandardText?: string;
    playbookText?: string;
    knownFailureModes: string[];
  };
  frontier?: ResearchFrontierSummary;
  verificationContract?: ResearchVerificationContractSummary;
  proof?: {
    inputPath?: string;
    verificationPlan?: ResearchVerificationPlan;
  };
  operatorNotes: string[];
}

export interface ResearchVerificationCheckResult {
  checkId: string;
  description: string;
  status: "passed" | "failed";
  requestPath: string;
  requestQuery?: Record<string, string>;
  assertions: Array<{
    actualPath: string;
    expectedPath: string;
    actualValue: unknown;
    expectedValue: unknown;
    passed: boolean;
  }>;
  selectedValue?: unknown;
  errorMessage?: string;
}

export interface ResearchVerificationReport {
  schemaVersion: typeof RESEARCH_VERIFICATION_REPORT_SCHEMA_VERSION;
  reportId: string;
  createdAt: string;
  taskId: string;
  strategyId: string;
  candidateId: string;
  packetPath?: string;
  stageDirectory: string;
  artifactPath: string;
  sandboxReset: {
    command: string;
    exitCode: number;
    stdout: string;
    stderr: string;
    durationMs?: number;
    timedOut?: boolean;
    highlights?: string[];
  };
  failureStage?: "reset" | "challenge" | "inspection";
  challengeRun: {
    runtimeStatus: string;
    apiCallCount: number;
    baselineCallBudget?: number;
    withinBudget: boolean;
  };
  inspection: {
    status: "passed" | "failed";
    apiCallCount: number;
    checks: ResearchVerificationCheckResult[];
  };
  verdict: {
    status: CandidateStatus;
    correctnessPassed: boolean;
    withinBudget: boolean;
    message: string;
  };
}
