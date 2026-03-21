import type {
  TaskModule,
  TaskRegistration,
  TaskSpec,
  TaskStrategy,
  TaskUnderstandingResult,
} from "../../runtime/contracts";

export const RECONCILE_BANK_STATEMENT_TASK_ID = "23";
export const RECONCILE_BANK_STATEMENT_TX_TASK_ID = "23";
export const RECONCILE_BANK_STATEMENT_INPUT_SCHEMA_ID = "23.v1";

export interface ReconcileBankStatementInput {
  attachmentFileName: string;
}

export const task = {
  taskId: RECONCILE_BANK_STATEMENT_TASK_ID,
  txTaskId: RECONCILE_BANK_STATEMENT_TX_TASK_ID,
  taskName: "Reconcile bank statement",
  implementationStatus: "implemented",
  signature: "reconcileBankStatement(attachmentFileName)",
  summary:
    "Reconcile an attached bank-statement CSV against open customer and supplier invoices, including partial payments and non-invoice bank lines.",
  inputSchemaId: RECONCILE_BANK_STATEMENT_INPUT_SCHEMA_ID,
  requiredFields: ["attachmentFileName"] as const,
  optionalFields: [] as const,
  fieldDescriptions: {
    attachmentFileName:
      "Exact request attachment filename for the bank-statement CSV that should be parsed and reconciled.",
  },
  extractionNotes: [
    "Always copy the exact uploaded CSV filename into attachmentFileName; do not rename or normalize it.",
    "Use the attached CSV as first-class evidence. The bank statement rows, not the natural-language prompt, drive the payment and voucher actions.",
    "CSV headers are expected to be the Norwegian bank-export shape such as Dato, Forklaring, Inn, Ut, and Saldo.",
    "The runtime must reconcile all bank lines, including non-invoice lines such as bank fees, tax withholding, or interest income.",
  ] as const,
} satisfies TaskSpec<
  ReconcileBankStatementInput,
  typeof RECONCILE_BANK_STATEMENT_TASK_ID
>;

export type ReconcileBankStatementStrategy = TaskStrategy<
  ReconcileBankStatementInput,
  typeof RECONCILE_BANK_STATEMENT_TASK_ID
>;

export type ReconcileBankStatementTaskModule = TaskModule<
  ReconcileBankStatementInput,
  typeof RECONCILE_BANK_STATEMENT_TASK_ID
>;

export type ReconcileBankStatementTaskUnderstandingResult =
  TaskUnderstandingResult<
    ReconcileBankStatementInput,
    typeof RECONCILE_BANK_STATEMENT_TASK_ID
  >;

export async function loadTaskModule(): Promise<ReconcileBankStatementTaskModule> {
  const { strategy } = await import(
    "./strategies/reconcile-bank-statement"
  );

  return {
    task,
    strategies: [strategy],
  };
}

export const taskRegistration = {
  task,
  loadTaskModule,
} satisfies TaskRegistration<
  ReconcileBankStatementInput,
  typeof RECONCILE_BANK_STATEMENT_TASK_ID
>;
