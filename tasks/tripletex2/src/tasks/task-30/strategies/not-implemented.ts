import { createNotImplementedStrategy } from "../../shared/not-implemented";
import type { UnknownTask30Strategy } from "../task";
import { UNKNOWN_TASK_30_TASK_ID } from "../task";

export const strategy = createNotImplementedStrategy({
  taskId: UNKNOWN_TASK_30_TASK_ID,
  strategyPath: "src/tasks/task-30/strategies/not-implemented.ts",
}) satisfies UnknownTask30Strategy;
