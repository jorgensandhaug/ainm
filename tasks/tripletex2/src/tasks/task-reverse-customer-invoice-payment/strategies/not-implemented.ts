import type {
  StrategyContext,
  StrategyResult,
} from "../../../runtime/contracts";
import type { ReverseCustomerInvoicePaymentInput, ReverseCustomerInvoicePaymentStrategy } from "../task";
import { REVERSE_CUSTOMER_INVOICE_PAYMENT_TASK_ID } from "../task";

export const strategy = {
  strategyId: "reverse-customer-invoice-payment.not-implemented.v1",
  strategyPath: "src/tasks/task-reverse-customer-invoice-payment/strategies/not-implemented.ts",
  taskId: REVERSE_CUSTOMER_INVOICE_PAYMENT_TASK_ID,
  name: "Not implemented",
  summary:
    "Draft stub strategy for task reverse-customer-invoice-payment.",
  hypothesis:
    "Keeping a real typed task surface with a loud runtime stub is safer than hiding the task behind a placeholder registration.",
  stepOutline: [
    "Throw an explicit not-yet-implemented error for task reverse-customer-invoice-payment.",
  ],
  status: "draft",
  async run(
    _ctx: StrategyContext,
    _input: ReverseCustomerInvoicePaymentInput,
  ): Promise<StrategyResult> {
    throw new Error("Strategy not yet implemented for task reverse-customer-invoice-payment");
  },
} satisfies ReverseCustomerInvoicePaymentStrategy;
