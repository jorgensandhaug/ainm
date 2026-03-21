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

export const UNKNOWN_TASK_25_TASK_ID = "25";
export const UNKNOWN_TASK_25_TX_TASK_ID = "25";
export const UNKNOWN_TASK_25_INPUT_SCHEMA_ID = "25.v1";

export const task = createNotImplementedTaskSpec({
  taskId: UNKNOWN_TASK_25_TASK_ID,
  txTaskId: UNKNOWN_TASK_25_TX_TASK_ID,
  taskName: "Unknown task 25",
  summary:
    "Tier 3 placeholder for tx_task_id 25 with no checked-in prompt examples yet.",
  signature: "unknownTask25()",
});

export type UnknownTask25Strategy = TaskStrategy<
  NotImplementedTaskInput,
  typeof UNKNOWN_TASK_25_TASK_ID
>;

export type UnknownTask25TaskModule = TaskModule<
  NotImplementedTaskInput,
  typeof UNKNOWN_TASK_25_TASK_ID
>;

export type UnknownTask25TaskUnderstandingResult = TaskUnderstandingResult<
  NotImplementedTaskInput,
  typeof UNKNOWN_TASK_25_TASK_ID
>;

export async function loadTaskModule(): Promise<UnknownTask25TaskModule> {
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
  typeof UNKNOWN_TASK_25_TASK_ID
>;
