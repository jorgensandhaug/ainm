import { createNotImplementedStrategy } from "../../shared/not-implemented";
import { ANNUAL_CLOSING_TASK_ID } from "../task";

export const strategy = createNotImplementedStrategy({
  taskId: ANNUAL_CLOSING_TASK_ID,
  strategyPath: "src/tasks/task-30/strategies/not-implemented.ts",
});
