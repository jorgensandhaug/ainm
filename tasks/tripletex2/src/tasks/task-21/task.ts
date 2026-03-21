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

export const UNKNOWN_TASK_21_TASK_ID = "21";
export const UNKNOWN_TASK_21_TX_TASK_ID = "21";
export const UNKNOWN_TASK_21_INPUT_SCHEMA_ID = "21.v1";

export const task = createNotImplementedTaskSpec({
  taskId: UNKNOWN_TASK_21_TASK_ID,
  txTaskId: UNKNOWN_TASK_21_TX_TASK_ID,
  taskName: "Unknown task 21",
  summary:
    "Tier 3 placeholder for tx_task_id 21 with no checked-in prompt examples yet.",
  signature: "unknownTask21()",
});

export type UnknownTask21Strategy = TaskStrategy<
  NotImplementedTaskInput,
  typeof UNKNOWN_TASK_21_TASK_ID
>;

export type UnknownTask21TaskModule = TaskModule<
  NotImplementedTaskInput,
  typeof UNKNOWN_TASK_21_TASK_ID
>;

export type UnknownTask21TaskUnderstandingResult = TaskUnderstandingResult<
  NotImplementedTaskInput,
  typeof UNKNOWN_TASK_21_TASK_ID
>;

export async function loadTaskModule(): Promise<UnknownTask21TaskModule> {
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
  typeof UNKNOWN_TASK_21_TASK_ID
>;
