import { createNotImplementedStrategy } from "../../shared/not-implemented";
import type { RegisterForeignCurrencyPaymentWithExchangeGainStrategy } from "../task";
import { REGISTER_FOREIGN_CURRENCY_PAYMENT_WITH_EXCHANGE_GAIN_TASK_ID } from "../task";

export const strategy = createNotImplementedStrategy({
  taskId: REGISTER_FOREIGN_CURRENCY_PAYMENT_WITH_EXCHANGE_GAIN_TASK_ID,
  strategyPath: "src/tasks/task-27/strategies/not-implemented.ts",
}) satisfies RegisterForeignCurrencyPaymentWithExchangeGainStrategy;
