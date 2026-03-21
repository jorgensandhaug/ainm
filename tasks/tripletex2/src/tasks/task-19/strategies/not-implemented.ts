import { createNotImplementedStrategy } from "../../shared/not-implemented";
import type { UnknownTask19Strategy } from "../task";
import { UNKNOWN_TASK_19_TASK_ID } from "../task";

export const strategy = createNotImplementedStrategy({
  taskId: UNKNOWN_TASK_19_TASK_ID,
  strategyPath: "src/tasks/task-19/strategies/not-implemented.ts",
}) satisfies UnknownTask19Strategy;
