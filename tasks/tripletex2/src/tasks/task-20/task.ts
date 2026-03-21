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

export const UNKNOWN_TASK_20_TASK_ID = "20";
export const UNKNOWN_TASK_20_TX_TASK_ID = "20";
export const UNKNOWN_TASK_20_INPUT_SCHEMA_ID = "20.v1";

export const task = createNotImplementedTaskSpec({
  taskId: UNKNOWN_TASK_20_TASK_ID,
  txTaskId: UNKNOWN_TASK_20_TX_TASK_ID,
  taskName: "Unknown task 20",
  summary:
    "Tier 3 placeholder for tx_task_id 20 with no checked-in prompt examples yet.",
  signature: "unknownTask20()",
});

export type UnknownTask20Strategy = TaskStrategy<
  NotImplementedTaskInput,
  typeof UNKNOWN_TASK_20_TASK_ID
>;

export type UnknownTask20TaskModule = TaskModule<
  NotImplementedTaskInput,
  typeof UNKNOWN_TASK_20_TASK_ID
>;

export type UnknownTask20TaskUnderstandingResult = TaskUnderstandingResult<
  NotImplementedTaskInput,
  typeof UNKNOWN_TASK_20_TASK_ID
>;

export async function loadTaskModule(): Promise<UnknownTask20TaskModule> {
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
  typeof UNKNOWN_TASK_20_TASK_ID
>;
