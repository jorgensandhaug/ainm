import { createNotImplementedStrategy } from "../../shared/not-implemented";
import type { RegisterReceiptExpenseVoucherStrategy } from "../task";
import { REGISTER_RECEIPT_EXPENSE_VOUCHER_TASK_ID } from "../task";

export const strategy = createNotImplementedStrategy({
  taskId: REGISTER_RECEIPT_EXPENSE_VOUCHER_TASK_ID,
  strategyPath: "src/tasks/task-22/strategies/not-implemented.ts",
}) satisfies RegisterReceiptExpenseVoucherStrategy;
