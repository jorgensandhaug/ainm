import { createNotImplementedStrategy } from "../../shared/not-implemented";
import type { UnknownTask20Strategy } from "../task";
import { UNKNOWN_TASK_20_TASK_ID } from "../task";

export const strategy = createNotImplementedStrategy({
  taskId: UNKNOWN_TASK_20_TASK_ID,
  strategyPath: "src/tasks/task-20/strategies/not-implemented.ts",
}) satisfies UnknownTask20Strategy;
