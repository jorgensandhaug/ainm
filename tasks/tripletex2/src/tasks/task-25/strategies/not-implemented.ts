import { createNotImplementedStrategy } from "../../shared/not-implemented";
import type { OverdueReminderFeeStrategy } from "../task";
import { OVERDUE_REMINDER_FEE_TASK_ID } from "../task";

export const strategy = createNotImplementedStrategy({
  taskId: OVERDUE_REMINDER_FEE_TASK_ID,
  strategyPath: "src/tasks/task-25/strategies/not-implemented.ts",
}) satisfies OverdueReminderFeeStrategy;
