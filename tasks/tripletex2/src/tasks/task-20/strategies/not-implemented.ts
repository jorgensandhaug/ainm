import { createNotImplementedStrategy } from "../../shared/not-implemented";
import type { RegisterSupplierInvoicePdfStrategy } from "../task";
import { REGISTER_SUPPLIER_INVOICE_PDF_TASK_ID } from "../task";

export const strategy = createNotImplementedStrategy({
  taskId: REGISTER_SUPPLIER_INVOICE_PDF_TASK_ID,
  strategyPath: "src/tasks/task-20/strategies/not-implemented.ts",
}) satisfies RegisterSupplierInvoicePdfStrategy;
