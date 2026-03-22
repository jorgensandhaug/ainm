import { createNotImplementedStrategy } from "../../shared/not-implemented";
import type { MonthlyClosingStrategy } from "../task";
import { MONTHLY_CLOSING_TASK_ID } from "../task";

export const strategy = createNotImplementedStrategy({
  taskId: MONTHLY_CLOSING_TASK_ID,
  strategyPath: "src/tasks/task-26/strategies/not-implemented.ts",
}) satisfies MonthlyClosingStrategy;
