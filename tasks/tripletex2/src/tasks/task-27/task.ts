import type {
  TaskModule,
  TaskRegistration,
  TaskStrategy,
  TaskUnderstandingResult,
} from "../../runtime/contracts";
import {
  createNotImplementedTaskSpec,
  type NotImplementedTaskInput,
} from "../shared/not-implemented";

export const REGISTER_FOREIGN_CURRENCY_PAYMENT_WITH_EXCHANGE_GAIN_TASK_ID = "27";
export const REGISTER_FOREIGN_CURRENCY_PAYMENT_WITH_EXCHANGE_GAIN_TX_TASK_ID =
  "27";
export const REGISTER_FOREIGN_CURRENCY_PAYMENT_WITH_EXCHANGE_GAIN_INPUT_SCHEMA_ID =
  "27.v1";

export const task = createNotImplementedTaskSpec({
  taskId: REGISTER_FOREIGN_CURRENCY_PAYMENT_WITH_EXCHANGE_GAIN_TASK_ID,
  txTaskId: REGISTER_FOREIGN_CURRENCY_PAYMENT_WITH_EXCHANGE_GAIN_TX_TASK_ID,
  taskName: "Register foreign-currency payment with exchange gain",
  summary:
    "Register a customer invoice payment in a foreign currency and book the exchange rate difference (agio) to the correct account.",
  signature: "registerForeignCurrencyPaymentWithExchangeGain()",
});

export type RegisterForeignCurrencyPaymentWithExchangeGainStrategy =
  TaskStrategy<
  NotImplementedTaskInput,
    typeof REGISTER_FOREIGN_CURRENCY_PAYMENT_WITH_EXCHANGE_GAIN_TASK_ID
  >;

export type RegisterForeignCurrencyPaymentWithExchangeGainTaskModule =
  TaskModule<
  NotImplementedTaskInput,
    typeof REGISTER_FOREIGN_CURRENCY_PAYMENT_WITH_EXCHANGE_GAIN_TASK_ID
  >;

export type RegisterForeignCurrencyPaymentWithExchangeGainTaskUnderstandingResult =
  TaskUnderstandingResult<
    NotImplementedTaskInput,
    typeof REGISTER_FOREIGN_CURRENCY_PAYMENT_WITH_EXCHANGE_GAIN_TASK_ID
  >;

export async function loadTaskModule(): Promise<RegisterForeignCurrencyPaymentWithExchangeGainTaskModule> {
  const { strategy } = await import("./strategies/not-implemented");

  return {
    task,
    strategies: [strategy],
  };
}

export const taskRegistration = {
  task,
  loadTaskModule,
} satisfies TaskRegistration<
  NotImplementedTaskInput,
  typeof REGISTER_FOREIGN_CURRENCY_PAYMENT_WITH_EXCHANGE_GAIN_TASK_ID
>;
