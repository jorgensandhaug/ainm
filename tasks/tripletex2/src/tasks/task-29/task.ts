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

export const UNKNOWN_TASK_29_TASK_ID = "29";
export const UNKNOWN_TASK_29_TX_TASK_ID = "29";
export const UNKNOWN_TASK_29_INPUT_SCHEMA_ID = "29.v1";

export const task = createNotImplementedTaskSpec({
  taskId: UNKNOWN_TASK_29_TASK_ID,
  txTaskId: UNKNOWN_TASK_29_TX_TASK_ID,
  taskName: "Unknown task 29",
  summary:
    "Tier 3 placeholder for tx_task_id 29 with no checked-in prompt examples yet.",
  signature: "unknownTask29()",
});

export type UnknownTask29Strategy = TaskStrategy<
  NotImplementedTaskInput,
  typeof UNKNOWN_TASK_29_TASK_ID
>;

export type UnknownTask29TaskModule = TaskModule<
  NotImplementedTaskInput,
  typeof UNKNOWN_TASK_29_TASK_ID
>;

export type UnknownTask29TaskUnderstandingResult = TaskUnderstandingResult<
  NotImplementedTaskInput,
  typeof UNKNOWN_TASK_29_TASK_ID
>;

export async function loadTaskModule(): Promise<UnknownTask29TaskModule> {
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
  typeof UNKNOWN_TASK_29_TASK_ID
>;
