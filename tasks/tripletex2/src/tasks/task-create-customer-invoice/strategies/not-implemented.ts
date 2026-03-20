import type {
  StrategyContext,
  StrategyResult,
} from "../../../runtime/contracts";
import type { CreateCustomerInvoiceInput, CreateCustomerInvoiceStrategy } from "../task";
import { CREATE_CUSTOMER_INVOICE_TASK_ID } from "../task";

export const strategy = {
  strategyId: "create-customer-invoice.not-implemented.v1",
  strategyPath: "src/tasks/task-create-customer-invoice/strategies/not-implemented.ts",
  taskId: CREATE_CUSTOMER_INVOICE_TASK_ID,
  name: "Not implemented",
  summary:
    "Draft stub strategy for task create-customer-invoice.",
  hypothesis:
    "Keeping a real typed task surface with a loud runtime stub is safer than hiding the task behind a placeholder registration.",
  stepOutline: [
    "Throw an explicit not-yet-implemented error for task create-customer-invoice.",
  ],
  status: "draft",
  async run(
    _ctx: StrategyContext,
    _input: CreateCustomerInvoiceInput,
  ): Promise<StrategyResult> {
    throw new Error("Strategy not yet implemented for task create-customer-invoice");
  },
} satisfies CreateCustomerInvoiceStrategy;
