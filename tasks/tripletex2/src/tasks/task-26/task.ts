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

export const UNKNOWN_TASK_26_TASK_ID = "26";
export const UNKNOWN_TASK_26_TX_TASK_ID = "26";
export const UNKNOWN_TASK_26_INPUT_SCHEMA_ID = "26.v1";

export const task = createNotImplementedTaskSpec({
  taskId: UNKNOWN_TASK_26_TASK_ID,
  txTaskId: UNKNOWN_TASK_26_TX_TASK_ID,
  taskName: "Unknown task 26",
  summary:
    "Tier 3 placeholder for tx_task_id 26 with no checked-in prompt examples yet.",
  signature: "unknownTask26()",
});

export type UnknownTask26Strategy = TaskStrategy<
  NotImplementedTaskInput,
  typeof UNKNOWN_TASK_26_TASK_ID
>;

export type UnknownTask26TaskModule = TaskModule<
  NotImplementedTaskInput,
  typeof UNKNOWN_TASK_26_TASK_ID
>;

export type UnknownTask26TaskUnderstandingResult = TaskUnderstandingResult<
  NotImplementedTaskInput,
  typeof UNKNOWN_TASK_26_TASK_ID
>;

export async function loadTaskModule(): Promise<UnknownTask26TaskModule> {
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
  typeof UNKNOWN_TASK_26_TASK_ID
>;
