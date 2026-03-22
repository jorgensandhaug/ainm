import { createNotImplementedStrategy } from "../../shared/not-implemented";
import type { FullProjectLifecycleStrategy } from "../task";
import { FULL_PROJECT_LIFECYCLE_TASK_ID } from "../task";

export const strategy = createNotImplementedStrategy({
  taskId: FULL_PROJECT_LIFECYCLE_TASK_ID,
  strategyPath: "src/tasks/task-29/strategies/not-implemented.ts",
}) satisfies FullProjectLifecycleStrategy;
