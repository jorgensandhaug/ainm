import type {
  TaskModule,
  TaskRegistration,
  TaskSpec,
  TaskStrategy,
  TaskUnderstandingResult,
} from "../../runtime/contracts";

export const OVERDUE_REMINDER_FEE_TASK_ID = "25";
export const OVERDUE_REMINDER_FEE_TX_TASK_ID = "25";
export const OVERDUE_REMINDER_FEE_INPUT_SCHEMA_ID = "25.v1";

export interface OverdueReminderFeeInput {}

export const task = {
  taskId: OVERDUE_REMINDER_FEE_TASK_ID,
  txTaskId: OVERDUE_REMINDER_FEE_TX_TASK_ID,
  taskName: "Overdue reminder fee and partial payment",
  implementationStatus: "implemented",
  signature: "processOverdueReminderFeeAndPartialPayment()",
  summary:
    "Find the one overdue customer invoice, post a 50 NOK reminder fee, create and send the fee invoice, and register a 5000 NOK partial payment.",
  inputSchemaId: OVERDUE_REMINDER_FEE_INPUT_SCHEMA_ID,
  requiredFields: [] as const,
  optionalFields: [] as const,
  fieldDescriptions: {},
  extractionNotes: [
    "This task shape is fully determined by the prompt and live Tripletex state; the extractor should return an empty object.",
    "Runtime must locate the one overdue unpaid invoice and use the fixed reminder-fee amount, accounts, and partial-payment amount from the task standard.",
  ] as const,
} satisfies TaskSpec<
  OverdueReminderFeeInput,
  typeof OVERDUE_REMINDER_FEE_TASK_ID
>;

export type OverdueReminderFeeStrategy = TaskStrategy<
  OverdueReminderFeeInput,
  typeof OVERDUE_REMINDER_FEE_TASK_ID
>;

export type OverdueReminderFeeTaskModule = TaskModule<
  OverdueReminderFeeInput,
  typeof OVERDUE_REMINDER_FEE_TASK_ID
>;

export type OverdueReminderFeeTaskUnderstandingResult = TaskUnderstandingResult<
  OverdueReminderFeeInput,
  typeof OVERDUE_REMINDER_FEE_TASK_ID
>;

export async function loadTaskModule(): Promise<OverdueReminderFeeTaskModule> {
  const { strategy } = await import("./strategies/overdue-reminder-fee");

  return {
    task,
    strategies: [strategy],
  };
}

export const taskRegistration = {
  task,
  loadTaskModule,
} satisfies TaskRegistration<
  OverdueReminderFeeInput,
  typeof OVERDUE_REMINDER_FEE_TASK_ID
>;
