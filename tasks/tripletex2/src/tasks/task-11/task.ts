import type {
  TaskModule,
  TaskRegistration,
  TaskSpec,
  TaskStrategy,
  TaskUnderstandingResult,
} from "../../runtime/contracts";
export const CREATE_ORDER_INVOICE_AND_REGISTER_PAYMENT_TASK_ID = "11";
export const CREATE_ORDER_INVOICE_AND_REGISTER_PAYMENT_TX_TASK_ID = "10";
export const CREATE_ORDER_INVOICE_AND_REGISTER_PAYMENT_INPUT_SCHEMA_ID = "11.v1";
export interface CreateOrderInvoiceAndRegisterPaymentLineInput {
  description: string;
  quantity: number;
  unitPriceExcludingVatNok: number;
  productNumber?: string;
  productName?: string;
}

export interface CreateOrderInvoiceAndRegisterPaymentInput {
  customerOrganizationNumber: string;
  lines: CreateOrderInvoiceAndRegisterPaymentLineInput[];
  invoiceDate?: string;
  customerName?: string;
}
export const task = {
  taskId: CREATE_ORDER_INVOICE_AND_REGISTER_PAYMENT_TASK_ID,
  txTaskId: CREATE_ORDER_INVOICE_AND_REGISTER_PAYMENT_TX_TASK_ID,
  taskName: "Create order, invoice, and register payment",
  implementationStatus: "implemented",
  signature:
    "createOrderInvoiceAndRegisterPayment(customerOrganizationNumber, lines, invoiceDate?, customerName?)",
  summary:
    "Create a sales order, convert it to an invoice, and register full payment.",
  inputSchemaId: CREATE_ORDER_INVOICE_AND_REGISTER_PAYMENT_INPUT_SCHEMA_ID,
  requiredFields: [
    "customerOrganizationNumber",
    "lines",
  ] as const,
  optionalFields: [
    "invoiceDate",
    "customerName",
  ] as const,
  fieldDescriptions: {
    customerOrganizationNumber:
      "Organization number for the existing customer.",
    lines:
      "Order lines in prompt order, including exact existing-product identifiers when the prompt provides them.",
    invoiceDate:
      "Optional invoice date in ISO YYYY-MM-DD format.",
    customerName:
      "Optional customer name used as supporting lookup evidence only.",
  },
  extractionNotes: [
    "Preserve prompt line descriptions exactly when they are part of the scored order or invoice state.",
    "Normalize implicit single quantities to 1 before strategy execution.",
    "Extract productNumber and productName when given so runtime can choose the direct product resolver before any broader fallback.",
  ] as const,
} satisfies TaskSpec<CreateOrderInvoiceAndRegisterPaymentInput, typeof CREATE_ORDER_INVOICE_AND_REGISTER_PAYMENT_TASK_ID>;
export type CreateOrderInvoiceAndRegisterPaymentStrategy = TaskStrategy<
  CreateOrderInvoiceAndRegisterPaymentInput,
  typeof CREATE_ORDER_INVOICE_AND_REGISTER_PAYMENT_TASK_ID
>;
export type CreateOrderInvoiceAndRegisterPaymentTaskModule = TaskModule<
  CreateOrderInvoiceAndRegisterPaymentInput,
  typeof CREATE_ORDER_INVOICE_AND_REGISTER_PAYMENT_TASK_ID
>;
export type CreateOrderInvoiceAndRegisterPaymentTaskUnderstandingResult = TaskUnderstandingResult<
  CreateOrderInvoiceAndRegisterPaymentInput,
  typeof CREATE_ORDER_INVOICE_AND_REGISTER_PAYMENT_TASK_ID
>;
export async function loadTaskModule(): Promise<CreateOrderInvoiceAndRegisterPaymentTaskModule> {
  const [{ strategy: splitTailStrategy }, { strategy: prepaidStrategy }] =
    await Promise.all([
      import("./strategies/order-invoice-combined-payment"),
      import("./strategies/order-invoice-prepaid"),
    ]);
  return {
    task,
    strategies: [splitTailStrategy, prepaidStrategy],
  };
}
export const taskRegistration = {
  task,
  loadTaskModule,
} satisfies TaskRegistration<CreateOrderInvoiceAndRegisterPaymentInput, typeof CREATE_ORDER_INVOICE_AND_REGISTER_PAYMENT_TASK_ID>;
