import type {
  StrategyContext,
  StrategyResult,
} from "../../../runtime/contracts";
import type { CreateOrderInvoiceAndRegisterPaymentInput, CreateOrderInvoiceAndRegisterPaymentStrategy } from "../task";
import { CREATE_ORDER_INVOICE_AND_REGISTER_PAYMENT_TASK_ID } from "../task";

export const strategy = {
  strategyId: "11.not-implemented.v1",
  strategyPath: "src/tasks/task-11/strategies/not-implemented.ts",
  taskId: CREATE_ORDER_INVOICE_AND_REGISTER_PAYMENT_TASK_ID,
  name: "Not implemented",
  summary:
    "Draft stub strategy for task 11.",
  hypothesis:
    "Keeping a real typed task surface with a loud runtime stub is safer than hiding the task behind a placeholder registration.",
  stepOutline: [
    "Throw an explicit not-yet-implemented error for task 11.",
  ],
  status: "draft",
  async run(
    _ctx: StrategyContext,
    _input: CreateOrderInvoiceAndRegisterPaymentInput,
  ): Promise<StrategyResult> {
    throw new Error("Strategy not yet implemented for task create-order-invoice-and-register-payment");
  },
} satisfies CreateOrderInvoiceAndRegisterPaymentStrategy;
