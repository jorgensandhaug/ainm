import type {
  TaskModule,
  TaskRegistration,
  TaskStrategy,
  TaskUnderstandingResult,
} from "../../runtime/contracts";
import {
  createNotImplementedTaskSpec,
  type NotImplementedTaskInput,
} from "../shared/not-implemented";

export const MONTHLY_CLOSING_TASK_ID = "26";
export const MONTHLY_CLOSING_TX_TASK_ID = "26";
export const MONTHLY_CLOSING_INPUT_SCHEMA_ID = "26.v1";

export const task = createNotImplementedTaskSpec({
  taskId: MONTHLY_CLOSING_TASK_ID,
  txTaskId: MONTHLY_CLOSING_TX_TASK_ID,
  taskName: "Monthly closing (March 2026)",
  summary:
    "Perform the monthly closing for March 2026: post accrued prepaid expense from account 1700, book monthly depreciation, and close relevant balance sheet items.",
  signature: "monthlyClosing()",
});

export type MonthlyClosingStrategy = TaskStrategy<
  NotImplementedTaskInput,
  typeof MONTHLY_CLOSING_TASK_ID
>;

export type MonthlyClosingTaskModule = TaskModule<
  NotImplementedTaskInput,
  typeof MONTHLY_CLOSING_TASK_ID
>;

export type MonthlyClosingTaskUnderstandingResult = TaskUnderstandingResult<
  NotImplementedTaskInput,
  typeof MONTHLY_CLOSING_TASK_ID
>;

export async function loadTaskModule(): Promise<MonthlyClosingTaskModule> {
  const { strategy } = await import("./strategies/not-implemented");

  return {
    task,
    strategies: [strategy],
  };
}

export const taskRegistration = {
  task,
  loadTaskModule,
} satisfies TaskRegistration<
  NotImplementedTaskInput,
  typeof MONTHLY_CLOSING_TASK_ID
>;
