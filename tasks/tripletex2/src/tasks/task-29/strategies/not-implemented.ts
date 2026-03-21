import { createNotImplementedStrategy } from "../../shared/not-implemented";
import type { UnknownTask29Strategy } from "../task";
import { UNKNOWN_TASK_29_TASK_ID } from "../task";

export const strategy = createNotImplementedStrategy({
  taskId: UNKNOWN_TASK_29_TASK_ID,
  strategyPath: "src/tasks/task-29/strategies/not-implemented.ts",
}) satisfies UnknownTask29Strategy;
