import { createNotImplementedStrategy } from "../../shared/not-implemented";
import type { UnknownTask28Strategy } from "../task";
import { UNKNOWN_TASK_28_TASK_ID } from "../task";

export const strategy = createNotImplementedStrategy({
  taskId: UNKNOWN_TASK_28_TASK_ID,
  strategyPath: "src/tasks/task-28/strategies/not-implemented.ts",
}) satisfies UnknownTask28Strategy;
