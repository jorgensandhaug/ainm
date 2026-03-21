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

export const UNKNOWN_TASK_30_TASK_ID = "30";
export const UNKNOWN_TASK_30_TX_TASK_ID = "30";
export const UNKNOWN_TASK_30_INPUT_SCHEMA_ID = "30.v1";

export const task = createNotImplementedTaskSpec({
  taskId: UNKNOWN_TASK_30_TASK_ID,
  txTaskId: UNKNOWN_TASK_30_TX_TASK_ID,
  taskName: "Unknown task 30",
  summary:
    "Tier 3 placeholder for tx_task_id 30 with no checked-in prompt examples yet.",
  signature: "unknownTask30()",
});

export type UnknownTask30Strategy = TaskStrategy<
  NotImplementedTaskInput,
  typeof UNKNOWN_TASK_30_TASK_ID
>;

export type UnknownTask30TaskModule = TaskModule<
  NotImplementedTaskInput,
  typeof UNKNOWN_TASK_30_TASK_ID
>;

export type UnknownTask30TaskUnderstandingResult = TaskUnderstandingResult<
  NotImplementedTaskInput,
  typeof UNKNOWN_TASK_30_TASK_ID
>;

export async function loadTaskModule(): Promise<UnknownTask30TaskModule> {
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
  typeof UNKNOWN_TASK_30_TASK_ID
>;
