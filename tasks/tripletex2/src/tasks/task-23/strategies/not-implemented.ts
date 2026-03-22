import { createNotImplementedStrategy } from "../../shared/not-implemented";
import type { ReconcileBankStatementStrategy } from "../task";
import { RECONCILE_BANK_STATEMENT_TASK_ID } from "../task";

export const strategy = createNotImplementedStrategy({
  taskId: RECONCILE_BANK_STATEMENT_TASK_ID,
  strategyPath: "src/tasks/task-23/strategies/not-implemented.ts",
}) satisfies ReconcileBankStatementStrategy;
