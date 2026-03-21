import { createNotImplementedStrategy } from "../../shared/not-implemented";
import type { UnknownTask26Strategy } from "../task";
import { UNKNOWN_TASK_26_TASK_ID } from "../task";

export const strategy = createNotImplementedStrategy({
  taskId: UNKNOWN_TASK_26_TASK_ID,
  strategyPath: "src/tasks/task-26/strategies/not-implemented.ts",
}) satisfies UnknownTask26Strategy;
