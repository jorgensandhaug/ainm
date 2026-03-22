import { createNotImplementedStrategy } from "../../shared/not-implemented";
import type { AnalyzeExpenseIncreaseCreateInternalProjectsStrategy } from "../task";
import { ANALYZE_EXPENSE_INCREASE_CREATE_INTERNAL_PROJECTS_TASK_ID } from "../task";

export const strategy = createNotImplementedStrategy({
  taskId: ANALYZE_EXPENSE_INCREASE_CREATE_INTERNAL_PROJECTS_TASK_ID,
  strategyPath: "src/tasks/task-28/strategies/not-implemented.ts",
}) satisfies AnalyzeExpenseIncreaseCreateInternalProjectsStrategy;
