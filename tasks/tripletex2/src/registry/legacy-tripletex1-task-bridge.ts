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
  txTaskId: string;
  taskName: string;
  summary: string;
  legacyTripletex1TaskIds: readonly string[];
}

export const CANONICAL_TASK_REGISTRY = [
  {
    taskId: "create-customer",
    txTaskId: "01",
    taskName: "Create customer",
    summary:
      "Create a customer with organization number, address, and contact email.",
    legacyTripletex1TaskIds: ["01"],
  },
  {
    taskId: "create-supplier",
    txTaskId: "02",
    taskName: "Create supplier",
    summary:
      "Create a supplier with organization number and invoice email details.",
    legacyTripletex1TaskIds: ["02"],
  },
  {
    taskId: "create-department",
    txTaskId: "03",
    taskName: "Create department",
    summary:
      "Create one or more new departments with the requested names.",
    legacyTripletex1TaskIds: ["03"],
  },
  {
    taskId: "create-product",
    txTaskId: "04",
    taskName: "Create product",
    summary:
      "Create a product with product number, price, and the required VAT treatment.",
    legacyTripletex1TaskIds: ["04"],
  },
  {
    taskId: "create-project",
    txTaskId: "05",
    taskName: "Create project",
    summary:
      "Create a project for an existing customer and assign a project manager.",
    legacyTripletex1TaskIds: ["05"],
  },
  {
    taskId: "create-employee",
    txTaskId: "06",
    taskName: "Create employee",
    summary:
      "Create a new employee with identifying details, contact email, and start date.",
    legacyTripletex1TaskIds: ["06"],
  },
  {
    taskId: "create-accounting-dimension-and-post-voucher",
    txTaskId: "07",
    taskName: "Create accounting dimension and post voucher",
    summary:
      "Create a custom accounting dimension with values, then post a voucher linked to one value.",
    legacyTripletex1TaskIds: ["07"],
  },
  {
    taskId: CREATE_AND_SEND_INVOICE_TASK_ID,
    txTaskId: "08",
    taskName: createAndSendInvoiceTask.taskName,
    summary: createAndSendInvoiceTask.summary,
    legacyTripletex1TaskIds: ["08"],
  },
  {
    taskId: "create-customer-invoice",
    txTaskId: "09",
    taskName: "Create customer invoice",
    summary:
      "Create a customer invoice with explicit product lines and mixed VAT handling.",
    legacyTripletex1TaskIds: ["09"],
  },
  {
    taskId: "issue-full-credit-note",
    txTaskId: "10",
    taskName: "Issue full credit note",
    summary:
      "Find an invoice and issue a full credit note that reverses the entire amount.",
    legacyTripletex1TaskIds: ["10"],
  },
  {
    taskId: "create-order-invoice-and-register-payment",
    txTaskId: "11",
    taskName: "Create order, invoice, and register payment",
    summary:
      "Create a sales order, convert it to an invoice, and register full payment.",
    legacyTripletex1TaskIds: ["11"],
  },
  {
    taskId: "run-payroll-with-bonus",
    txTaskId: "12",
    taskName: "Run payroll with bonus",
    summary:
      "Process payroll for an employee and include a one-time bonus amount.",
    legacyTripletex1TaskIds: ["12"],
  },
  {
    taskId: "register-travel-expense",
    txTaskId: "13",
    taskName: "Register travel expense",
    summary:
      "Register a travel expense claim with per diem and named out-of-pocket expenses.",
    legacyTripletex1TaskIds: ["13"],
  },
  {
    taskId: "set-project-fixed-price-and-invoice-milestone",
    txTaskId: "14",
    taskName: "Set project fixed price and invoice milestone",
    summary:
      "Set a fixed project price and invoice a requested milestone percentage.",
    legacyTripletex1TaskIds: ["14"],
  },
  {
    taskId: "register-project-hours-and-create-project-invoice",
    txTaskId: "15",
    taskName: "Register project hours and create project invoice",
    summary:
      "Register billable hours to a project activity and generate the resulting project invoice.",
    legacyTripletex1TaskIds: ["15"],
  },
  {
    taskId: "register-supplier-invoice",
    txTaskId: "16",
    taskName: "Register supplier invoice",
    summary:
      "Register an incoming supplier invoice with the requested account and input VAT.",
    legacyTripletex1TaskIds: ["16"],
  },
  {
    taskId: "register-customer-invoice-payment",
    txTaskId: "17",
    taskName: "Register customer invoice payment",
    summary:
      "Locate an unpaid customer invoice and register full payment against it.",
    legacyTripletex1TaskIds: ["17"],
  },
  {
    taskId: "reverse-customer-invoice-payment",
    txTaskId: "18",
    taskName: "Reverse customer invoice payment",
    summary:
      "Reverse a customer invoice payment so the invoice becomes unpaid again.",
    legacyTripletex1TaskIds: ["18"],
  },
] as const satisfies readonly CanonicalTaskRegistryEntry[];

const canonicalTaskRegistryById = new Map<string, CanonicalTaskRegistryEntry>(
  CANONICAL_TASK_REGISTRY.map((task) => [task.taskId, task]),
);

function buildLookupRecord(
  entries: readonly CanonicalTaskRegistryEntry[],
  getKey: (entry: CanonicalTaskRegistryEntry) => string,
  getValue: (entry: CanonicalTaskRegistryEntry) => string,
): Readonly<Record<string, string>> {
  const lookup: Record<string, string> = {};

  for (const entry of entries) {
    const key = getKey(entry);
    const value = getValue(entry);
    const existing = lookup[key];
    if (existing !== undefined && existing !== value) {
      throw new Error(`Duplicate canonical task mapping for "${key}".`);
    }

    lookup[key] = value;
  }

  return Object.freeze(lookup);
}

export const txTaskIdToSlug = buildLookupRecord(
  CANONICAL_TASK_REGISTRY,
  (entry) => entry.txTaskId,
  (entry) => entry.taskId,
);

export const slugToTxTaskId = buildLookupRecord(
  CANONICAL_TASK_REGISTRY,
  (entry) => entry.taskId,
  (entry) => entry.txTaskId,
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

function createCanonicalBridgeEntry(
  task: CanonicalTaskRegistryEntry,
): LegacyTripletex1TaskBridgeEntry {
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

export const LEGACY_TRIPLETEX1_TASK_BRIDGE: Readonly<
  Record<string, LegacyTripletex1TaskBridgeEntry>
> = Object.freeze(
  Object.fromEntries(
    CANONICAL_TASK_REGISTRY.map((task) => [
      task.txTaskId,
      createCanonicalBridgeEntry(task),
    ]),
  ),
);

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
