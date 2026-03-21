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

export const UNKNOWN_TASK_19_TASK_ID = "19";
export const UNKNOWN_TASK_19_TX_TASK_ID = "19";
export const UNKNOWN_TASK_19_INPUT_SCHEMA_ID = "19.v1";

export const task = createNotImplementedTaskSpec({
  taskId: UNKNOWN_TASK_19_TASK_ID,
  txTaskId: UNKNOWN_TASK_19_TX_TASK_ID,
  taskName: "Unknown task 19",
  summary:
    "Tier 3 placeholder for tx_task_id 19 with no checked-in prompt examples yet.",
  signature: "unknownTask19()",
});

export type UnknownTask19Strategy = TaskStrategy<
  NotImplementedTaskInput,
  typeof UNKNOWN_TASK_19_TASK_ID
>;

export type UnknownTask19TaskModule = TaskModule<
  NotImplementedTaskInput,
  typeof UNKNOWN_TASK_19_TASK_ID
>;

export type UnknownTask19TaskUnderstandingResult = TaskUnderstandingResult<
  NotImplementedTaskInput,
  typeof UNKNOWN_TASK_19_TASK_ID
>;

export async function loadTaskModule(): Promise<UnknownTask19TaskModule> {
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
  typeof UNKNOWN_TASK_19_TASK_ID
>;
