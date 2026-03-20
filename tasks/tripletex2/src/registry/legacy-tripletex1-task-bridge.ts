import type {
  ClassifierConfidence,
  RunAttributionInfo,
} from "../runtime/contracts";
import {
  CREATE_AND_SEND_INVOICE_TASK_ID,
  task as createAndSendInvoiceTask,
} from "../tasks/task-create-and-send-invoice/task";

export type LegacyTripletex1InferenceStatus =
  | "unique_attempt_delta"
  | "ambiguous"
  | "metadata_changed"
  | "no_change_detected";

export interface LegacyTaskBridgeEvidenceSource {
  path: string;
  purpose: string;
}

export const LEGACY_TRIPLETEX1_TASK_BRIDGE_EVIDENCE_SOURCES = [
  {
    path: "../tripletex/src/main.ts",
    purpose:
      "Defines how legacy leaderboard attribution is inferred and which inference_status values exist.",
  },
  {
    path: "../tripletex/data/production/runs/*/task-attribution.json",
    purpose:
      "Per-run post-hoc leaderboard attribution output with tx_task_id and inference_status.",
  },
  {
    path: "../tripletex/data/prompt-task-labels.jsonl",
    purpose:
      "Append-only cross-run ledger of legacy tx_task_id labels written when task-attribution found a tx_task_id.",
  },
  {
    path: "../tripletex/data/production/runs/*/scripts/*.ts",
    purpose:
      "Concrete solve-script names used to sanity-check whether a legacy tx_task_id is semantically consistent.",
  },
  {
    path: "../tripletex/data/production/runs/*/manifest.json",
    purpose:
      "Confirms run layout and which per-run script directory belongs to the attributed run.",
  },
] as const satisfies readonly LegacyTaskBridgeEvidenceSource[];

export interface CanonicalTaskRegistryEntry {
  taskId: string;
  taskName: string;
  summary: string;
  legacyTripletex1TaskIds: readonly string[];
}

export const CANONICAL_TASK_REGISTRY = [
  {
    taskId: "create-employee",
    taskName: "Create employee",
    summary:
      "Create a new employee with identifying details, contact email, and start date.",
    legacyTripletex1TaskIds: ["01"],
  },
  {
    taskId: "create-customer",
    taskName: "Create customer",
    summary:
      "Create a customer with organization number, address, and contact email.",
    legacyTripletex1TaskIds: ["02"],
  },
  {
    taskId: "create-product",
    taskName: "Create product",
    summary:
      "Create a product with product number, price, and the required VAT treatment.",
    legacyTripletex1TaskIds: ["03"],
  },
  {
    taskId: "create-supplier",
    taskName: "Create supplier",
    summary:
      "Create a supplier with organization number and invoice email details.",
    legacyTripletex1TaskIds: ["04"],
  },
  {
    taskId: CREATE_AND_SEND_INVOICE_TASK_ID,
    taskName: createAndSendInvoiceTask.taskName,
    summary: createAndSendInvoiceTask.summary,
    legacyTripletex1TaskIds: ["06"],
  },
  {
    taskId: "register-customer-invoice-payment",
    taskName: "Register customer invoice payment",
    summary:
      "Locate an unpaid customer invoice and register full payment against it.",
    legacyTripletex1TaskIds: ["07"],
  },
  {
    taskId: "create-project",
    taskName: "Create project",
    summary:
      "Create a project for an existing customer and assign a project manager.",
    legacyTripletex1TaskIds: ["08"],
  },
  {
    taskId: "create-customer-invoice",
    taskName: "Create customer invoice",
    summary:
      "Create a customer invoice with explicit product lines and mixed VAT handling.",
    legacyTripletex1TaskIds: ["09"],
  },
  {
    taskId: "create-order-invoice-and-register-payment",
    taskName: "Create order, invoice, and register payment",
    summary:
      "Create a sales order, convert it to an invoice, and register full payment.",
    legacyTripletex1TaskIds: ["10"],
  },
  {
    taskId: "register-supplier-invoice",
    taskName: "Register supplier invoice",
    summary:
      "Register an incoming supplier invoice with the requested account and input VAT.",
    legacyTripletex1TaskIds: ["11"],
  },
  {
    taskId: "run-payroll-with-bonus",
    taskName: "Run payroll with bonus",
    summary:
      "Process payroll for an employee and include a one-time bonus amount.",
    legacyTripletex1TaskIds: ["12"],
  },
  {
    taskId: "register-travel-expense",
    taskName: "Register travel expense",
    summary:
      "Register a travel expense claim with per diem and named out-of-pocket expenses.",
    legacyTripletex1TaskIds: ["13"],
  },
  {
    taskId: "issue-full-credit-note",
    taskName: "Issue full credit note",
    summary:
      "Find an invoice and issue a full credit note that reverses the entire amount.",
    legacyTripletex1TaskIds: ["14"],
  },
  {
    taskId: "set-project-fixed-price-and-invoice-milestone",
    taskName: "Set project fixed price and invoice milestone",
    summary:
      "Set a fixed project price and invoice a requested milestone percentage.",
    legacyTripletex1TaskIds: ["15"],
  },
  {
    taskId: "register-project-hours-and-create-project-invoice",
    taskName: "Register project hours and create project invoice",
    summary:
      "Register billable hours to a project activity and generate the resulting project invoice.",
    legacyTripletex1TaskIds: ["16"],
  },
  {
    taskId: "create-accounting-dimension-and-post-voucher",
    taskName: "Create accounting dimension and post voucher",
    summary:
      "Create a custom accounting dimension with values, then post a voucher linked to one value.",
    legacyTripletex1TaskIds: ["17"],
  },
  {
    taskId: "reverse-customer-invoice-payment",
    taskName: "Reverse customer invoice payment",
    summary:
      "Reverse a customer invoice payment so the invoice becomes unpaid again.",
    legacyTripletex1TaskIds: ["18"],
  },
] as const satisfies readonly CanonicalTaskRegistryEntry[];

const canonicalTaskRegistryById = new Map<string, CanonicalTaskRegistryEntry>(
  CANONICAL_TASK_REGISTRY.map((task) => [task.taskId, task]),
);

function getCanonicalTaskById(taskId: string): CanonicalTaskRegistryEntry {
  const task = canonicalTaskRegistryById.get(taskId);
  if (!task) {
    throw new Error(`Unknown canonical task registry entry: ${taskId}`);
  }

  return task;
}

export interface LegacyTripletex1TaskBridgeEntry {
  legacyTaskId: string;
  status: "mapped" | "unmapped";
  canonicalTaskId?: string;
  mappingConfidence: ClassifierConfidence;
  observedUniqueAttemptDeltaRuns: number;
  representativeRunIds: readonly string[];
  conflictingRunIds?: readonly string[];
  notes: readonly string[];
}

export const LEGACY_TRIPLETEX1_TASK_BRIDGE = {
  "01": {
    legacyTaskId: "01",
    status: "mapped",
    canonicalTaskId: "create-employee",
    mappingConfidence: "high",
    observedUniqueAttemptDeltaRuns: 1,
    representativeRunIds: ["prod-2026-03-20-161444237Z-7ff6c14f"],
    notes: [
      "Observed run wrote create-employee scripts and matched the employee-creation prompt surface.",
    ],
  },
  "02": {
    legacyTaskId: "02",
    status: "mapped",
    canonicalTaskId: "create-customer",
    mappingConfidence: "high",
    observedUniqueAttemptDeltaRuns: 1,
    representativeRunIds: ["prod-2026-03-20-161358871Z-64b4936f"],
    notes: [
      "Observed run wrote create-customer scripts and matched the customer-creation prompt surface.",
    ],
  },
  "03": {
    legacyTaskId: "03",
    status: "mapped",
    canonicalTaskId: "create-product",
    mappingConfidence: "high",
    observedUniqueAttemptDeltaRuns: 2,
    representativeRunIds: [
      "prod-2026-03-20-153520312Z-5a2e316c",
      "prod-2026-03-20-155616083Z-a5c9d6f7",
    ],
    notes: [
      "Both observed runs wrote product-creation scripts with VAT-rate variants and no semantic conflicts.",
    ],
  },
  "04": {
    legacyTaskId: "04",
    status: "mapped",
    canonicalTaskId: "create-supplier",
    mappingConfidence: "medium",
    observedUniqueAttemptDeltaRuns: 6,
    representativeRunIds: [
      "prod-2026-03-20-145225168Z-dc5e0842",
      "prod-2026-03-20-171654386Z-1fdb138d",
    ],
    conflictingRunIds: ["prod-2026-03-20-151341523Z-1e345deb"],
    notes: [
      "Five observed runs clearly wrote supplier-creation scripts.",
      "One outlier run with invoice-creation scripts was labeled tx_task_id 04, so live leaderboard-only attribution should stay medium confidence.",
    ],
  },
  "05": {
    legacyTaskId: "05",
    status: "unmapped",
    mappingConfidence: "low",
    observedUniqueAttemptDeltaRuns: 0,
    representativeRunIds: [],
    notes: [
      "tx_task_id 05 appears in leaderboard snapshots but has no checked-in unique-attempt task-attribution run.",
      "Keep this unmapped until a real attributed run or another trustworthy legacy surface identifies the task.",
    ],
  },
  "06": {
    legacyTaskId: "06",
    status: "mapped",
    canonicalTaskId: CREATE_AND_SEND_INVOICE_TASK_ID,
    mappingConfidence: "high",
    observedUniqueAttemptDeltaRuns: 1,
    representativeRunIds: ["prod-2026-03-20-154043711Z-89cff08b"],
    notes: [
      "Observed run aligns with the existing create-and-send-invoice task surface already present in tripletex2.",
    ],
  },
  "07": {
    legacyTaskId: "07",
    status: "mapped",
    canonicalTaskId: "register-customer-invoice-payment",
    mappingConfidence: "high",
    observedUniqueAttemptDeltaRuns: 1,
    representativeRunIds: ["prod-2026-03-20-170929424Z-66e3c043"],
    notes: [
      "Observed run wrote invoice-payment registration scripts and matched the unpaid-invoice payment prompt surface.",
    ],
  },
  "08": {
    legacyTaskId: "08",
    status: "mapped",
    canonicalTaskId: "create-project",
    mappingConfidence: "high",
    observedUniqueAttemptDeltaRuns: 2,
    representativeRunIds: [
      "prod-2026-03-20-153900671Z-45ae2eea",
      "prod-2026-03-20-155808043Z-ab210b0d",
    ],
    notes: [
      "Both observed runs wrote project-creation scripts and no conflicting semantics were found.",
    ],
  },
  "09": {
    legacyTaskId: "09",
    status: "mapped",
    canonicalTaskId: "create-customer-invoice",
    mappingConfidence: "medium",
    observedUniqueAttemptDeltaRuns: 5,
    representativeRunIds: [
      "prod-2026-03-20-160449149Z-30295d99",
      "prod-2026-03-20-164819645Z-9f5748e9",
    ],
    conflictingRunIds: ["prod-2026-03-20-164819684Z-afc5fde0"],
    notes: [
      "Four observed runs wrote customer-invoice scripts with multi-line VAT handling.",
      "One outlier run with project-hours invoicing scripts was labeled tx_task_id 09, so leaderboard-only attribution should stay medium confidence.",
    ],
  },
  "10": {
    legacyTaskId: "10",
    status: "mapped",
    canonicalTaskId: "create-order-invoice-and-register-payment",
    mappingConfidence: "high",
    observedUniqueAttemptDeltaRuns: 2,
    representativeRunIds: [
      "prod-2026-03-20-162059824Z-e71cd397",
      "prod-2026-03-20-163628397Z-e88605ae",
    ],
    notes: [
      "Both observed runs wrote order-then-invoice-then-payment scripts and no conflicting semantics were found.",
    ],
  },
  "11": {
    legacyTaskId: "11",
    status: "mapped",
    canonicalTaskId: "register-supplier-invoice",
    mappingConfidence: "high",
    observedUniqueAttemptDeltaRuns: 3,
    representativeRunIds: [
      "prod-2026-03-20-154655744Z-a290e68c",
      "prod-2026-03-20-171831120Z-b3c40a84",
    ],
    notes: [
      "Observed runs consistently wrote supplier-invoice registration scripts and matched incoming-invoice prompts.",
    ],
  },
  "12": {
    legacyTaskId: "12",
    status: "mapped",
    canonicalTaskId: "run-payroll-with-bonus",
    mappingConfidence: "high",
    observedUniqueAttemptDeltaRuns: 2,
    representativeRunIds: [
      "prod-2026-03-20-150924105Z-0739668d",
      "prod-2026-03-20-163122837Z-479d120a",
    ],
    notes: [
      "Observed runs consistently wrote payroll-processing scripts with an added one-time bonus.",
    ],
  },
  "13": {
    legacyTaskId: "13",
    status: "mapped",
    canonicalTaskId: "register-travel-expense",
    mappingConfidence: "high",
    observedUniqueAttemptDeltaRuns: 5,
    representativeRunIds: [
      "prod-2026-03-20-154935427Z-95749a07",
      "prod-2026-03-20-171053373Z-9afcb1d0",
    ],
    notes: [
      "Observed runs consistently wrote travel-expense scripts with per diem plus named expenses.",
    ],
  },
  "14": {
    legacyTaskId: "14",
    status: "mapped",
    canonicalTaskId: "issue-full-credit-note",
    mappingConfidence: "high",
    observedUniqueAttemptDeltaRuns: 3,
    representativeRunIds: [
      "prod-2026-03-20-150538277Z-1f4cda78",
      "prod-2026-03-20-164234744Z-dedde543",
    ],
    notes: [
      "Observed runs consistently wrote credit-note scripts that fully reverse an invoice.",
    ],
  },
  "15": {
    legacyTaskId: "15",
    status: "mapped",
    canonicalTaskId: "set-project-fixed-price-and-invoice-milestone",
    mappingConfidence: "medium",
    observedUniqueAttemptDeltaRuns: 1,
    representativeRunIds: ["prod-2026-03-20-161046877Z-7a5a61d5"],
    notes: [
      "Only one uniquely attributed run exists, but its prompt and script names clearly point to fixed-price milestone invoicing.",
    ],
  },
  "16": {
    legacyTaskId: "16",
    status: "mapped",
    canonicalTaskId: "register-project-hours-and-create-project-invoice",
    mappingConfidence: "high",
    observedUniqueAttemptDeltaRuns: 2,
    representativeRunIds: [
      "prod-2026-03-20-152251584Z-b8bed751",
      "prod-2026-03-20-161635045Z-902cdde6",
    ],
    notes: [
      "Observed runs consistently wrote project-hours plus project-invoice scripts and no conflicting semantics were found.",
    ],
  },
  "17": {
    legacyTaskId: "17",
    status: "mapped",
    canonicalTaskId: "create-accounting-dimension-and-post-voucher",
    mappingConfidence: "medium",
    observedUniqueAttemptDeltaRuns: 5,
    representativeRunIds: [
      "prod-2026-03-20-150729812Z-1a23bc86",
      "prod-2026-03-20-163321702Z-4c9f352a",
    ],
    conflictingRunIds: ["prod-2026-03-20-154433919Z-c844c6eb"],
    notes: [
      "Four observed runs clearly wrote accounting-dimension plus voucher-posting scripts.",
      "One outlier run with invoice-creation scripts was labeled tx_task_id 17, so leaderboard-only attribution should stay medium confidence.",
    ],
  },
  "18": {
    legacyTaskId: "18",
    status: "mapped",
    canonicalTaskId: "reverse-customer-invoice-payment",
    mappingConfidence: "high",
    observedUniqueAttemptDeltaRuns: 2,
    representativeRunIds: [
      "prod-2026-03-20-151734977Z-7b560c69",
      "prod-2026-03-20-160114982Z-9f31c41d",
    ],
    notes: [
      "Observed runs consistently wrote reverse-payment scripts that restored the invoice to unpaid status.",
    ],
  },
} as const satisfies Record<string, LegacyTripletex1TaskBridgeEntry>;

export interface LegacyTripletex1AttributionInput {
  txTaskId?: string;
  inferenceStatus?: LegacyTripletex1InferenceStatus;
}

export interface LegacyTripletex1BridgeResult {
  legacyTaskId?: string;
  canonicalTask?: CanonicalTaskRegistryEntry;
  bridgeEntry?: LegacyTripletex1TaskBridgeEntry;
  attribution: RunAttributionInfo;
}

export function getLegacyTripletex1TaskBridgeEntry(
  legacyTaskId: string,
): LegacyTripletex1TaskBridgeEntry | undefined {
  return LEGACY_TRIPLETEX1_TASK_BRIDGE[legacyTaskId];
}

function degradeConfidence(
  confidence: ClassifierConfidence,
): ClassifierConfidence {
  switch (confidence) {
    case "high":
      return "medium";
    case "medium":
      return "low";
    case "low":
      return "low";
  }
}

function buildEvidenceNotes(
  bridgeEntry: LegacyTripletex1TaskBridgeEntry | undefined,
  legacyTaskId: string | undefined,
  inferenceStatus: LegacyTripletex1InferenceStatus,
  extraNote?: string,
): string[] {
  const notes: string[] = [];

  if (legacyTaskId) {
    notes.push(`legacy Tripletex1 tx_task_id ${legacyTaskId}`);
  } else {
    notes.push("legacy Tripletex1 tx_task_id missing");
  }

  notes.push(`legacy inference_status ${inferenceStatus}`);

  if (bridgeEntry) {
    notes.push(...bridgeEntry.notes);
  }

  if (extraNote) {
    notes.push(extraNote);
  }

  return notes;
}

export function bridgeLegacyTripletex1TaskAttribution(
  input: LegacyTripletex1AttributionInput,
): LegacyTripletex1BridgeResult {
  const inferenceStatus = input.inferenceStatus ?? "no_change_detected";
  const bridgeEntry = input.txTaskId
    ? getLegacyTripletex1TaskBridgeEntry(input.txTaskId)
    : undefined;
  const canonicalTask =
    bridgeEntry?.canonicalTaskId !== undefined
      ? getCanonicalTaskById(bridgeEntry.canonicalTaskId)
      : undefined;

  if (!input.txTaskId) {
    return {
      attribution: {
        status: inferenceStatus === "ambiguous" ? "ambiguous" : "unmatched",
        source: "leaderboard-diff",
        confidence: "low",
        evidence: {
          notes: buildEvidenceNotes(
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
      bridgeEntry,
      attribution: {
        status: inferenceStatus === "ambiguous" ? "ambiguous" : "unmatched",
        source: "leaderboard-diff",
        confidence: "low",
        evidence: {
          notes: buildEvidenceNotes(
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
          notes: buildEvidenceNotes(bridgeEntry, input.txTaskId, inferenceStatus),
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
          notes: buildEvidenceNotes(
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
          notes: buildEvidenceNotes(
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
        notes: buildEvidenceNotes(
          bridgeEntry,
          input.txTaskId,
          inferenceStatus,
          "No usable leaderboard delta was captured for this legacy run.",
        ),
      },
    },
  };
}
