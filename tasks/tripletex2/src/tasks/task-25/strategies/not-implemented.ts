import { createNotImplementedStrategy } from "../../shared/not-implemented";
import type { UnknownTask25Strategy } from "../task";
import { UNKNOWN_TASK_25_TASK_ID } from "../task";

export const strategy = createNotImplementedStrategy({
  taskId: UNKNOWN_TASK_25_TASK_ID,
  strategyPath: "src/tasks/task-25/strategies/not-implemented.ts",
}) satisfies UnknownTask25Strategy;
