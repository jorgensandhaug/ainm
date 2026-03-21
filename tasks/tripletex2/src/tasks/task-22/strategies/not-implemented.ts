import { createNotImplementedStrategy } from "../../shared/not-implemented";
import type { UnknownTask22Strategy } from "../task";
import { UNKNOWN_TASK_22_TASK_ID } from "../task";

export const strategy = createNotImplementedStrategy({
  taskId: UNKNOWN_TASK_22_TASK_ID,
  strategyPath: "src/tasks/task-22/strategies/not-implemented.ts",
}) satisfies UnknownTask22Strategy;
