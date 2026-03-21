import type {
  TaskModule,
  TaskRegistration,
  TaskSpec,
  TaskStrategy,
  TaskUnderstandingResult,
} from "../../runtime/contracts";
export const REVERSE_CUSTOMER_INVOICE_PAYMENT_TASK_ID = "18";
export const REVERSE_CUSTOMER_INVOICE_PAYMENT_TX_TASK_ID = "18";
export const REVERSE_CUSTOMER_INVOICE_PAYMENT_INPUT_SCHEMA_ID = "18.v1";
export interface ReverseCustomerInvoicePaymentInput {
  customerOrganizationNumber: string;
  lineDescription: string;
  amountExcludingVatNok: number;
  customerName?: string;
  invoiceId?: number;
  invoiceNumber?: number;
  reversalDate?: string;
}
export const task = {
  taskId: REVERSE_CUSTOMER_INVOICE_PAYMENT_TASK_ID,
  txTaskId: REVERSE_CUSTOMER_INVOICE_PAYMENT_TX_TASK_ID,
  taskName: "Reverse customer invoice payment",
  implementationStatus: "implemented",
  signature:
    "reverseCustomerInvoicePayment(customerOrganizationNumber, lineDescription, amountExcludingVatNok, customerName?, invoiceId?, invoiceNumber?, reversalDate?)",
  summary:
    "Reverse a customer invoice payment so the invoice becomes unpaid again.",
  inputSchemaId: REVERSE_CUSTOMER_INVOICE_PAYMENT_INPUT_SCHEMA_ID,
  requiredFields: [
    "customerOrganizationNumber",
    "lineDescription",
    "amountExcludingVatNok",
  ] as const,
  optionalFields: [
    "customerName",
    "invoiceId",
    "invoiceNumber",
    "reversalDate",
  ] as const,
  fieldDescriptions: {
    customerOrganizationNumber:
      "Organization number for the customer on the paid invoice.",
    lineDescription:
      "Exact invoice line or service description used to locate the paid invoice.",
    amountExcludingVatNok:
      "Exact invoice amount excluding VAT used as a locate key.",
    customerName:
      "Optional customer name used only for local disambiguation.",
    invoiceId:
      "Optional exact Tripletex invoice id when the prompt provides it.",
    invoiceNumber:
      "Optional invoice number when the prompt provides it.",
    reversalDate:
      "Optional reversal date in ISO YYYY-MM-DD format. If omitted, runtime can use the task or run date.",
  },
  extractionNotes: [
    "Treat amountExcludingVatNok as a locate key for the paid invoice, not as the expected reopened balance after reversal.",
    "If the prompt already gives invoiceId or invoiceNumber, preserve it directly for the reversal strategy.",
    "Do not confuse the payment-reversal task with issuing a credit note or registering a new payment.",
  ] as const,
} satisfies TaskSpec<ReverseCustomerInvoicePaymentInput, typeof REVERSE_CUSTOMER_INVOICE_PAYMENT_TASK_ID>;
export type ReverseCustomerInvoicePaymentStrategy = TaskStrategy<
  ReverseCustomerInvoicePaymentInput,
  typeof REVERSE_CUSTOMER_INVOICE_PAYMENT_TASK_ID
>;
export type ReverseCustomerInvoicePaymentTaskModule = TaskModule<
  ReverseCustomerInvoicePaymentInput,
  typeof REVERSE_CUSTOMER_INVOICE_PAYMENT_TASK_ID
>;
export type ReverseCustomerInvoicePaymentTaskUnderstandingResult = TaskUnderstandingResult<
  ReverseCustomerInvoicePaymentInput,
  typeof REVERSE_CUSTOMER_INVOICE_PAYMENT_TASK_ID
>;
export async function loadTaskModule(): Promise<ReverseCustomerInvoicePaymentTaskModule> {
  const { strategy } = await import("./strategies/reverse-payment");
  return {
    task,
    strategies: [strategy],
  };
}
export const taskRegistration = {
  task,
  loadTaskModule,
} satisfies TaskRegistration<ReverseCustomerInvoicePaymentInput, typeof REVERSE_CUSTOMER_INVOICE_PAYMENT_TASK_ID>;
