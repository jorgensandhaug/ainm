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

export const ANNUAL_CLOSING_TASK_ID = "30";
export const ANNUAL_CLOSING_TX_TASK_ID = "30";
export const ANNUAL_CLOSING_INPUT_SCHEMA_ID = "30.v1";

export const task = createNotImplementedTaskSpec({
  taskId: ANNUAL_CLOSING_TASK_ID,
  txTaskId: ANNUAL_CLOSING_TX_TASK_ID,
  taskName: "Simplified annual closing (2025)",
  summary:
    "Perform the simplified annual closing for 2025: calculate and book annual depreciation for three assets, post year-end cost allocation, and create annual closing vouchers.",
  signature: "simplifiedAnnualClosing()",
});

export type AnnualClosingStrategy = TaskStrategy<
  NotImplementedTaskInput,
  typeof ANNUAL_CLOSING_TASK_ID
>;

export type AnnualClosingTaskModule = TaskModule<
  NotImplementedTaskInput,
  typeof ANNUAL_CLOSING_TASK_ID
>;

export type AnnualClosingTaskUnderstandingResult = TaskUnderstandingResult<
  NotImplementedTaskInput,
  typeof ANNUAL_CLOSING_TASK_ID
>;

export async function loadTaskModule(): Promise<AnnualClosingTaskModule> {
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
  typeof ANNUAL_CLOSING_TASK_ID
>;
