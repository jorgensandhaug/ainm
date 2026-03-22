import type {
  ClassifierConfidence,
  RunAttributionInfo,
} from "../runtime/contracts";
import {
  CREATE_AND_SEND_INVOICE_TASK_ID,
  task as createAndSendInvoiceTask,
} from "../tasks/task-08/task";

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
  taskSlug: string;
  taskName: string;
  summary: string;
  legacyTripletex1TaskIds: readonly string[];
}

export const CANONICAL_TASK_REGISTRY = [
  {
    taskId: "01",
    txTaskId: "02",
    taskSlug: "create-customer",
    taskName: "Create customer",
    summary:
      "Create a customer with organization number, address, and contact email.",
    legacyTripletex1TaskIds: ["02"],
  },
  {
    taskId: "02",
    txTaskId: "04",
    taskSlug: "create-supplier",
    taskName: "Create supplier",
    summary:
      "Create a supplier with organization number and invoice email details.",
    legacyTripletex1TaskIds: ["04"],
  },
  {
    taskId: "03",
    txTaskId: "05",
    taskSlug: "create-department",
    taskName: "Create department",
    summary:
      "Create one or more new departments with the requested names.",
    legacyTripletex1TaskIds: ["05"],
  },
  {
    taskId: "04",
    txTaskId: "03",
    taskSlug: "create-product",
    taskName: "Create product",
    summary:
      "Create a product with product number, price, and the required VAT treatment.",
    legacyTripletex1TaskIds: ["03"],
  },
  {
    taskId: "05",
    txTaskId: "08",
    taskSlug: "create-project",
    taskName: "Create project",
    summary:
      "Create a project for an existing customer and assign a project manager.",
    legacyTripletex1TaskIds: ["08"],
  },
  {
    taskId: "06",
    txTaskId: "01",
    taskSlug: "create-employee",
    taskName: "Create employee",
    summary:
      "Create a new employee with identifying details, contact email, and start date.",
    legacyTripletex1TaskIds: ["01"],
  },
  {
    taskId: "07",
    txTaskId: "17",
    taskSlug: "create-accounting-dimension-and-post-voucher",
    taskName: "Create accounting dimension and post voucher",
    summary:
      "Create a custom accounting dimension with values, then post a voucher linked to one value.",
    legacyTripletex1TaskIds: ["17"],
  },
  {
    taskId: CREATE_AND_SEND_INVOICE_TASK_ID,
    txTaskId: "06",
    taskSlug: "create-and-send-invoice",
    taskName: createAndSendInvoiceTask.taskName,
    summary: createAndSendInvoiceTask.summary,
    legacyTripletex1TaskIds: ["06"],
  },
  {
    taskId: "09",
    txTaskId: "09",
    taskSlug: "create-customer-invoice",
    taskName: "Create customer invoice",
    summary:
      "Create a customer invoice with explicit product lines and mixed VAT handling.",
    legacyTripletex1TaskIds: ["09"],
  },
  {
    taskId: "10",
    txTaskId: "14",
    taskSlug: "issue-full-credit-note",
    taskName: "Issue full credit note",
    summary:
      "Find an invoice and issue a full credit note that reverses the entire amount.",
    legacyTripletex1TaskIds: ["14"],
  },
  {
    taskId: "11",
    txTaskId: "10",
    taskSlug: "create-order-invoice-and-register-payment",
    taskName: "Create order, invoice, and register payment",
    summary:
      "Create a sales order, convert it to an invoice, and register full payment.",
    legacyTripletex1TaskIds: ["10"],
  },
  {
    taskId: "12",
    txTaskId: "12",
    taskSlug: "run-payroll-with-bonus",
    taskName: "Run payroll with bonus",
    summary:
      "Process payroll for an employee and include a one-time bonus amount.",
    legacyTripletex1TaskIds: ["12"],
  },
  {
    taskId: "13",
    txTaskId: "13",
    taskSlug: "register-travel-expense",
    taskName: "Register travel expense",
    summary:
      "Register a travel expense claim with per diem and named out-of-pocket expenses.",
    legacyTripletex1TaskIds: ["13"],
  },
  {
    taskId: "14",
    txTaskId: "15",
    taskSlug: "set-project-fixed-price-and-invoice-milestone",
    taskName: "Set project fixed price and invoice milestone",
    summary:
      "Set a fixed project price and invoice a requested milestone percentage.",
    legacyTripletex1TaskIds: ["15"],
  },
  {
    taskId: "15",
    txTaskId: "16",
    taskSlug: "register-project-hours-and-create-project-invoice",
    taskName: "Register project hours and create project invoice",
    summary:
      "Register billable hours to a project activity and generate the resulting project invoice.",
    legacyTripletex1TaskIds: ["16"],
  },
  {
    taskId: "16",
    txTaskId: "11",
    taskSlug: "register-supplier-invoice",
    taskName: "Register supplier invoice",
    summary:
      "Register an incoming supplier invoice with the requested account and input VAT.",
    legacyTripletex1TaskIds: ["11"],
  },
  {
    taskId: "17",
    txTaskId: "07",
    taskSlug: "register-customer-invoice-payment",
    taskName: "Register customer invoice payment",
    summary:
      "Locate an unpaid customer invoice and register full payment against it.",
    legacyTripletex1TaskIds: ["07"],
  },
  {
    taskId: "18",
    txTaskId: "18",
    taskSlug: "reverse-customer-invoice-payment",
    taskName: "Reverse customer invoice payment",
    summary:
      "Reverse a customer invoice payment so the invoice becomes unpaid again.",
    legacyTripletex1TaskIds: ["18"],
  },
  {
    taskId: "19",
    txTaskId: "19",
    taskSlug: "onboard-employee-from-contract",
    taskName: "Onboard employee from contract",
    summary:
      "Create a new employee from a contract, creating the department if needed and writing nested employment details with the resolved occupation code.",
    legacyTripletex1TaskIds: ["19"],
  },
  {
    taskId: "20",
    txTaskId: "20",
    taskSlug: "register-supplier-invoice-pdf",
    taskName: "Register supplier invoice with PDF attachment",
    summary:
      "Register an incoming supplier invoice from prompt-plus-PDF data and attach the source PDF to the created voucher.",
    legacyTripletex1TaskIds: ["20"],
  },
  {
    taskId: "21",
    txTaskId: "21",
    taskSlug: "onboard-employee-offer-letter",
    taskName: "Onboard employee from offer letter",
    summary:
      "Create a new employee from a tilbudsbrev (offer letter) PDF, creating the department if needed. Uses remunerationType NOT_CHOSEN because offer letters do not specify Lonnstype.",
    legacyTripletex1TaskIds: ["21"],
  },
  {
    taskId: "22",
    txTaskId: "22",
    taskSlug: "register-receipt-expense-voucher",
    taskName: "Register receipt expense voucher",
    summary:
      "Book one receipt-backed expense voucher to the requested department, balance it against bank account 1920, and upload the source receipt.",
    legacyTripletex1TaskIds: ["22"],
  },
  {
    taskId: "23",
    txTaskId: "23",
    taskSlug: "reconcile-bank-statement",
    taskName: "Reconcile bank statement",
    summary:
      "Reconcile an attached bank-statement CSV against open customer and supplier invoices, including partial payments and non-invoice bank lines.",
    legacyTripletex1TaskIds: ["23"],
  },
  {
    taskId: "24",
    txTaskId: "24",
    taskSlug: "correct-ledger-errors",
    taskName: "Correct ledger errors",
    summary:
      "Review the Jan-Feb 2026 ledger for the four known anomalies and post one corrective voucher that repairs them.",
    legacyTripletex1TaskIds: ["24"],
  },
  {
    taskId: "25",
    txTaskId: "25",
    taskSlug: "overdue-reminder-fee-and-partial-payment",
    taskName: "Overdue reminder fee and partial payment",
    summary:
      "Find the one overdue customer invoice, post a 50 NOK reminder fee, create and send the fee invoice, and register a 5000 NOK partial payment.",
    legacyTripletex1TaskIds: ["25"],
  },
  {
    taskId: "26",
    txTaskId: "26",
    taskSlug: "monthly-closing",
    taskName: "Monthly closing (March 2026)",
    summary:
      "Perform the monthly closing for March 2026: post accrued prepaid expense from account 1700, book monthly depreciation, and close relevant balance sheet items.",
    legacyTripletex1TaskIds: ["26"],
  },
  {
    taskId: "27",
    txTaskId: "27",
    taskSlug: "register-foreign-currency-payment-with-exchange-gain",
    taskName: "Register foreign-currency payment with exchange gain",
    summary:
      "Register a customer invoice payment in a foreign currency and book the exchange rate difference (agio) to the correct account.",
    legacyTripletex1TaskIds: ["27"],
  },
  {
    taskId: "28",
    txTaskId: "28",
    taskSlug: "analyze-expense-increase-create-internal-projects",
    taskName: "Analyze expense increase and create internal projects",
    summary:
      "Analyze January-versus-February 2026 ledger expenses, select the three expense accounts with the largest increase, and create one internal project plus one activity for each selected account.",
    legacyTripletex1TaskIds: ["28"],
  },
  {
    taskId: "29",
    txTaskId: "29",
    taskSlug: "full-project-lifecycle",
    taskName: "Full project lifecycle",
    summary:
      "Create or reuse the customer, supplier, and employees needed for a project, register project hours and supplier costs, then create the project invoice through the order-to-invoice path.",
    legacyTripletex1TaskIds: ["29"],
  },
  {
    taskId: "30",
    txTaskId: "30",
    taskSlug: "simplified-annual-closing",
    taskName: "Simplified annual closing (2025)",
    summary:
      "Perform the simplified annual closing for a fiscal year: calculate and book annual depreciation for fixed assets (separate voucher each), reverse prepaid expenses, calculate and book tax expense (22% of taxable result), and post result disposition.",
    legacyTripletex1TaskIds: ["30"],
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
  (entry) => entry.taskSlug,
);

export const slugToTxTaskId = buildLookupRecord(
  CANONICAL_TASK_REGISTRY,
  (entry) => entry.taskSlug,
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
