import { createNotImplementedStrategy } from "../../shared/not-implemented";
import type { CorrectLedgerErrorsStrategy } from "../task";
import { CORRECT_LEDGER_ERRORS_TASK_ID } from "../task";

export const strategy = createNotImplementedStrategy({
  taskId: CORRECT_LEDGER_ERRORS_TASK_ID,
  strategyPath: "src/tasks/task-21/strategies/not-implemented.ts",
}) satisfies CorrectLedgerErrorsStrategy;
