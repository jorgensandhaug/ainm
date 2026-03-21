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

export const UNKNOWN_TASK_23_TASK_ID = "23";
export const UNKNOWN_TASK_23_TX_TASK_ID = "23";
export const UNKNOWN_TASK_23_INPUT_SCHEMA_ID = "23.v1";

export const task = createNotImplementedTaskSpec({
  taskId: UNKNOWN_TASK_23_TASK_ID,
  txTaskId: UNKNOWN_TASK_23_TX_TASK_ID,
  taskName: "Unknown task 23",
  summary:
    "Tier 3 placeholder for tx_task_id 23 with no checked-in prompt examples yet.",
  signature: "unknownTask23()",
});

export type UnknownTask23Strategy = TaskStrategy<
  NotImplementedTaskInput,
  typeof UNKNOWN_TASK_23_TASK_ID
>;

export type UnknownTask23TaskModule = TaskModule<
  NotImplementedTaskInput,
  typeof UNKNOWN_TASK_23_TASK_ID
>;

export type UnknownTask23TaskUnderstandingResult = TaskUnderstandingResult<
  NotImplementedTaskInput,
  typeof UNKNOWN_TASK_23_TASK_ID
>;

export async function loadTaskModule(): Promise<UnknownTask23TaskModule> {
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
  typeof UNKNOWN_TASK_23_TASK_ID
>;
