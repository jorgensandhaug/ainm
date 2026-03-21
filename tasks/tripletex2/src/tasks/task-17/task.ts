import type {
  TaskModule,
  TaskRegistration,
  TaskSpec,
  TaskStrategy,
  TaskUnderstandingResult,
} from "../../runtime/contracts";
export const REGISTER_CUSTOMER_INVOICE_PAYMENT_TASK_ID = "17";
export const REGISTER_CUSTOMER_INVOICE_PAYMENT_TX_TASK_ID = "17";
export const REGISTER_CUSTOMER_INVOICE_PAYMENT_INPUT_SCHEMA_ID = "17.v1";
export interface RegisterCustomerInvoicePaymentInput {
  customerOrganizationNumber: string;
  lineDescription: string;
  amountExcludingVatNok: number;
  customerName?: string;
  invoiceId?: number;
  invoiceNumber?: number;
  paymentDate?: string;
}
export const task = {
  taskId: REGISTER_CUSTOMER_INVOICE_PAYMENT_TASK_ID,
  txTaskId: REGISTER_CUSTOMER_INVOICE_PAYMENT_TX_TASK_ID,
  taskName: "Register customer invoice payment",
  implementationStatus: "implemented",
  signature:
    "registerCustomerInvoicePayment(customerOrganizationNumber, lineDescription, amountExcludingVatNok, customerName?, invoiceId?, invoiceNumber?, paymentDate?)",
  summary:
    "Locate an unpaid customer invoice and register full payment against it.",
  inputSchemaId: REGISTER_CUSTOMER_INVOICE_PAYMENT_INPUT_SCHEMA_ID,
  requiredFields: [
    "customerOrganizationNumber",
    "lineDescription",
    "amountExcludingVatNok",
  ] as const,
  optionalFields: [
    "customerName",
    "invoiceId",
    "invoiceNumber",
    "paymentDate",
  ] as const,
  fieldDescriptions: {
    customerOrganizationNumber:
      "Organization number for the customer on the unpaid invoice.",
    lineDescription:
      "Exact invoice line or service description used to locate the invoice.",
    amountExcludingVatNok:
      "Exact invoice amount excluding VAT used as a locate key.",
    customerName:
      "Optional customer name used only for local disambiguation.",
    invoiceId:
      "Optional exact Tripletex invoice id when the prompt provides it.",
    invoiceNumber:
      "Optional invoice number when the prompt provides it.",
    paymentDate:
      "Optional payment date in ISO YYYY-MM-DD format.",
  },
  extractionNotes: [
    "Treat amountExcludingVatNok as a locate key only; runtime must pay the live outstanding amount from the invoice object.",
    "If the prompt directly provides invoiceId or invoiceNumber, capture it so runtime can skip broader lookup logic.",
    "Do not confuse this customer-invoice payment task with supplier-invoice payment or payment reversal.",
  ] as const,
} satisfies TaskSpec<RegisterCustomerInvoicePaymentInput, typeof REGISTER_CUSTOMER_INVOICE_PAYMENT_TASK_ID>;
export type RegisterCustomerInvoicePaymentStrategy = TaskStrategy<
  RegisterCustomerInvoicePaymentInput,
  typeof REGISTER_CUSTOMER_INVOICE_PAYMENT_TASK_ID
>;
export type RegisterCustomerInvoicePaymentTaskModule = TaskModule<
  RegisterCustomerInvoicePaymentInput,
  typeof REGISTER_CUSTOMER_INVOICE_PAYMENT_TASK_ID
>;
export type RegisterCustomerInvoicePaymentTaskUnderstandingResult = TaskUnderstandingResult<
  RegisterCustomerInvoicePaymentInput,
  typeof REGISTER_CUSTOMER_INVOICE_PAYMENT_TASK_ID
>;
export async function loadTaskModule(): Promise<RegisterCustomerInvoicePaymentTaskModule> {
  const { strategy } = await import("./strategies/register-payment");
  return {
    task,
    strategies: [strategy],
  };
}
export const taskRegistration = {
  task,
  loadTaskModule,
} satisfies TaskRegistration<RegisterCustomerInvoicePaymentInput, typeof REGISTER_CUSTOMER_INVOICE_PAYMENT_TASK_ID>;
