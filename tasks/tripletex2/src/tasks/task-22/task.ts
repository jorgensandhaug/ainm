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

export const UNKNOWN_TASK_22_TASK_ID = "22";
export const UNKNOWN_TASK_22_TX_TASK_ID = "22";
export const UNKNOWN_TASK_22_INPUT_SCHEMA_ID = "22.v1";

export const task = createNotImplementedTaskSpec({
  taskId: UNKNOWN_TASK_22_TASK_ID,
  txTaskId: UNKNOWN_TASK_22_TX_TASK_ID,
  taskName: "Unknown task 22",
  summary:
    "Tier 3 placeholder for tx_task_id 22 with no checked-in prompt examples yet.",
  signature: "unknownTask22()",
});

export type UnknownTask22Strategy = TaskStrategy<
  NotImplementedTaskInput,
  typeof UNKNOWN_TASK_22_TASK_ID
>;

export type UnknownTask22TaskModule = TaskModule<
  NotImplementedTaskInput,
  typeof UNKNOWN_TASK_22_TASK_ID
>;

export type UnknownTask22TaskUnderstandingResult = TaskUnderstandingResult<
  NotImplementedTaskInput,
  typeof UNKNOWN_TASK_22_TASK_ID
>;

export async function loadTaskModule(): Promise<UnknownTask22TaskModule> {
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
  typeof UNKNOWN_TASK_22_TASK_ID
>;
