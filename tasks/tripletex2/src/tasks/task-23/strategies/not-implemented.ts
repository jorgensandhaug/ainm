import { createNotImplementedStrategy } from "../../shared/not-implemented";
import type { UnknownTask23Strategy } from "../task";
import { UNKNOWN_TASK_23_TASK_ID } from "../task";

export const strategy = createNotImplementedStrategy({
  taskId: UNKNOWN_TASK_23_TASK_ID,
  strategyPath: "src/tasks/task-23/strategies/not-implemented.ts",
}) satisfies UnknownTask23Strategy;
