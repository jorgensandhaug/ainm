import { createNotImplementedStrategy } from "../../shared/not-implemented";
import type { UnknownTask21Strategy } from "../task";
import { UNKNOWN_TASK_21_TASK_ID } from "../task";

export const strategy = createNotImplementedStrategy({
  taskId: UNKNOWN_TASK_21_TASK_ID,
  strategyPath: "src/tasks/task-21/strategies/not-implemented.ts",
}) satisfies UnknownTask21Strategy;
