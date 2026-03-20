import type {
  StrategyContext,
  StrategyResult,
} from "../../../runtime/contracts";
import type { RegisterSupplierInvoiceInput, RegisterSupplierInvoiceStrategy } from "../task";
import { REGISTER_SUPPLIER_INVOICE_TASK_ID } from "../task";

export const strategy = {
  strategyId: "register-supplier-invoice.not-implemented.v1",
  strategyPath: "src/tasks/task-register-supplier-invoice/strategies/not-implemented.ts",
  taskId: REGISTER_SUPPLIER_INVOICE_TASK_ID,
  name: "Not implemented",
  summary:
    "Draft stub strategy for task register-supplier-invoice.",
  hypothesis:
    "Keeping a real typed task surface with a loud runtime stub is safer than hiding the task behind a placeholder registration.",
  stepOutline: [
    "Throw an explicit not-yet-implemented error for task register-supplier-invoice.",
  ],
  status: "draft",
  async run(
    _ctx: StrategyContext,
    _input: RegisterSupplierInvoiceInput,
  ): Promise<StrategyResult> {
    throw new Error("Strategy not yet implemented for task register-supplier-invoice");
  },
} satisfies RegisterSupplierInvoiceStrategy;
