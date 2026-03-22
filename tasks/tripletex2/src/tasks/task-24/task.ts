import type {
  TaskModule,
  TaskRegistration,
  TaskSpec,
  TaskStrategy,
  TaskUnderstandingResult,
} from "../../runtime/contracts";

export interface CorrectLedgerErrorsInput {}

export const CORRECT_LEDGER_ERRORS_TASK_ID = "24";
export const CORRECT_LEDGER_ERRORS_TX_TASK_ID = "24";
export const CORRECT_LEDGER_ERRORS_INPUT_SCHEMA_ID = "24.v1";

export const task = {
  taskId: CORRECT_LEDGER_ERRORS_TASK_ID,
  txTaskId: CORRECT_LEDGER_ERRORS_TX_TASK_ID,
  taskName: "Correct ledger errors",
  implementationStatus: "implemented",
  signature: "correctLedgerErrors()",
  summary:
    "Review the Jan-Feb 2026 ledger for the four known anomalies and post one corrective voucher that repairs them.",
  inputSchemaId: CORRECT_LEDGER_ERRORS_INPUT_SCHEMA_ID,
  requiredFields: [] as const,
  extractionNotes: [
    "This task family is pinned by a fixed prompt pattern, so no additional structured arguments are required beyond classifying it as task 24.",
    "Prompt evidence identifies four exact anomalies: wrong account 7300 instead of 7000 for 7800 NOK, duplicate 6860 voucher for 3500 NOK, missing 25% VAT on 6500 net 18350 NOK with account 2710 omitted, and wrong 7300 amount 15000 NOK instead of 10050 NOK.",
    "The deterministic runtime should scan vouchers from 2026-01-01 through the Jan-Feb 2026 period and post one corrective voucher dated 2026-02-28.",
  ] as const,
} satisfies TaskSpec<
  CorrectLedgerErrorsInput,
  typeof CORRECT_LEDGER_ERRORS_TASK_ID
>;

export type CorrectLedgerErrorsStrategy = TaskStrategy<
  CorrectLedgerErrorsInput,
  typeof CORRECT_LEDGER_ERRORS_TASK_ID
>;

export type CorrectLedgerErrorsTaskModule = TaskModule<
  CorrectLedgerErrorsInput,
  typeof CORRECT_LEDGER_ERRORS_TASK_ID
>;

export type CorrectLedgerErrorsTaskUnderstandingResult = TaskUnderstandingResult<
  CorrectLedgerErrorsInput,
  typeof CORRECT_LEDGER_ERRORS_TASK_ID
>;

export async function loadTaskModule(): Promise<CorrectLedgerErrorsTaskModule> {
  const { strategy: strategyLegacy } = await import("./strategies/correct-ledger-errors");
  const { strategy: strategyV3 } = await import(
    "./strategies/correct-ledger-errors-v3"
  );

  return {
    task,
    strategies: [strategyV3, strategyLegacy],
  };
}

export const taskRegistration = {
  task,
  loadTaskModule,
} satisfies TaskRegistration<
  CorrectLedgerErrorsInput,
  typeof CORRECT_LEDGER_ERRORS_TASK_ID
>;
