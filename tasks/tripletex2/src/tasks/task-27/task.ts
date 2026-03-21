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

export const UNKNOWN_TASK_27_TASK_ID = "27";
export const UNKNOWN_TASK_27_TX_TASK_ID = "27";
export const UNKNOWN_TASK_27_INPUT_SCHEMA_ID = "27.v1";

export const task = createNotImplementedTaskSpec({
  taskId: UNKNOWN_TASK_27_TASK_ID,
  txTaskId: UNKNOWN_TASK_27_TX_TASK_ID,
  taskName: "Unknown task 27",
  summary:
    "Tier 3 placeholder for tx_task_id 27 with no checked-in prompt examples yet.",
  signature: "unknownTask27()",
});

export type UnknownTask27Strategy = TaskStrategy<
  NotImplementedTaskInput,
  typeof UNKNOWN_TASK_27_TASK_ID
>;

export type UnknownTask27TaskModule = TaskModule<
  NotImplementedTaskInput,
  typeof UNKNOWN_TASK_27_TASK_ID
>;

export type UnknownTask27TaskUnderstandingResult = TaskUnderstandingResult<
  NotImplementedTaskInput,
  typeof UNKNOWN_TASK_27_TASK_ID
>;

export async function loadTaskModule(): Promise<UnknownTask27TaskModule> {
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
  typeof UNKNOWN_TASK_27_TASK_ID
>;
