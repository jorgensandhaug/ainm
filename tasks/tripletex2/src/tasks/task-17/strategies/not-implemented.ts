import type {
  StrategyContext,
  StrategyResult,
} from "../../../runtime/contracts";
import type { RegisterCustomerInvoicePaymentInput, RegisterCustomerInvoicePaymentStrategy } from "../task";
import { REGISTER_CUSTOMER_INVOICE_PAYMENT_TASK_ID } from "../task";

export const strategy = {
  strategyId: "17.not-implemented.v1",
  strategyPath: "src/tasks/task-17/strategies/not-implemented.ts",
  taskId: REGISTER_CUSTOMER_INVOICE_PAYMENT_TASK_ID,
  name: "Not implemented",
  summary:
    "Draft stub strategy for task 17.",
  hypothesis:
    "Keeping a real typed task surface with a loud runtime stub is safer than hiding the task behind a placeholder registration.",
  stepOutline: [
    "Throw an explicit not-yet-implemented error for task 17.",
  ],
  status: "draft",
  async run(
    _ctx: StrategyContext,
    _input: RegisterCustomerInvoicePaymentInput,
  ): Promise<StrategyResult> {
    throw new Error("Strategy not yet implemented for task register-customer-invoice-payment");
  },
} satisfies RegisterCustomerInvoicePaymentStrategy;
