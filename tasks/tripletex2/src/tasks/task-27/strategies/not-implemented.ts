import { createNotImplementedStrategy } from "../../shared/not-implemented";
import type { UnknownTask27Strategy } from "../task";
import { UNKNOWN_TASK_27_TASK_ID } from "../task";

export const strategy = createNotImplementedStrategy({
  taskId: UNKNOWN_TASK_27_TASK_ID,
  strategyPath: "src/tasks/task-27/strategies/not-implemented.ts",
}) satisfies UnknownTask27Strategy;
