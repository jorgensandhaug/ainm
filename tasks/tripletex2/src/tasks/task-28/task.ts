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

export const UNKNOWN_TASK_28_TASK_ID = "28";
export const UNKNOWN_TASK_28_TX_TASK_ID = "28";
export const UNKNOWN_TASK_28_INPUT_SCHEMA_ID = "28.v1";

export const task = createNotImplementedTaskSpec({
  taskId: UNKNOWN_TASK_28_TASK_ID,
  txTaskId: UNKNOWN_TASK_28_TX_TASK_ID,
  taskName: "Unknown task 28",
  summary:
    "Tier 3 placeholder for tx_task_id 28 with no checked-in prompt examples yet.",
  signature: "unknownTask28()",
});

export type UnknownTask28Strategy = TaskStrategy<
  NotImplementedTaskInput,
  typeof UNKNOWN_TASK_28_TASK_ID
>;

export type UnknownTask28TaskModule = TaskModule<
  NotImplementedTaskInput,
  typeof UNKNOWN_TASK_28_TASK_ID
>;

export type UnknownTask28TaskUnderstandingResult = TaskUnderstandingResult<
  NotImplementedTaskInput,
  typeof UNKNOWN_TASK_28_TASK_ID
>;

export async function loadTaskModule(): Promise<UnknownTask28TaskModule> {
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
  typeof UNKNOWN_TASK_28_TASK_ID
>;
