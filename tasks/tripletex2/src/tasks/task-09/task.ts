import type {
  TaskModule,
  TaskRegistration,
  TaskSpec,
  TaskStrategy,
  TaskUnderstandingResult,
} from "../../runtime/contracts";
export const CREATE_CUSTOMER_INVOICE_TASK_ID = "09";
export const CREATE_CUSTOMER_INVOICE_TX_TASK_ID = "09";
export const CREATE_CUSTOMER_INVOICE_INPUT_SCHEMA_ID = "09.v1";
export interface CreateCustomerInvoiceLineInput {
  description: string;
  quantity: number;
  unitPriceExcludingVatNok: number;
  vatRatePercent?: number;
  productNumber?: string;
  productName?: string;
}

export interface CreateCustomerInvoiceInput {
  customerOrganizationNumber: string;
  lines: CreateCustomerInvoiceLineInput[];
  invoiceDate?: string;
  invoiceDueDate?: string;
  customerName?: string;
}
export const task = {
  taskId: CREATE_CUSTOMER_INVOICE_TASK_ID,
  txTaskId: CREATE_CUSTOMER_INVOICE_TX_TASK_ID,
  taskName: "Create customer invoice",
  implementationStatus: "implemented",
  signature:
    "createCustomerInvoice(customerOrganizationNumber, lines, invoiceDate?, invoiceDueDate?, customerName?)",
  summary:
    "Create a customer invoice with explicit product lines and mixed VAT handling.",
  inputSchemaId: CREATE_CUSTOMER_INVOICE_INPUT_SCHEMA_ID,
  requiredFields: [
    "customerOrganizationNumber",
    "lines",
  ] as const,
  optionalFields: [
    "invoiceDate",
    "invoiceDueDate",
    "customerName",
  ] as const,
  fieldDescriptions: {
    customerOrganizationNumber:
      "Organization number for the existing invoice customer.",
    lines:
      "Invoice lines in prompt order, including exact product identifiers when given plus normalized quantity, ex-VAT unit price, and VAT rate.",
    invoiceDate:
      "Optional invoice date in ISO YYYY-MM-DD format.",
    invoiceDueDate:
      "Optional invoice due date in ISO YYYY-MM-DD format.",
    customerName:
      "Optional customer name used only as local lookup evidence when needed.",
  },
  extractionNotes: [
    "Preserve each line description exactly and keep lines in prompt order.",
    "Normalize implicit single quantities to 1 when a line clearly represents one item.",
    "Include productNumber and productName when the prompt supplies them so runtime can choose the lowest-risk resolver branch.",
  ] as const,
} satisfies TaskSpec<CreateCustomerInvoiceInput, typeof CREATE_CUSTOMER_INVOICE_TASK_ID>;
export type CreateCustomerInvoiceStrategy = TaskStrategy<
  CreateCustomerInvoiceInput,
  typeof CREATE_CUSTOMER_INVOICE_TASK_ID
>;
export type CreateCustomerInvoiceTaskModule = TaskModule<
  CreateCustomerInvoiceInput,
  typeof CREATE_CUSTOMER_INVOICE_TASK_ID
>;
export type CreateCustomerInvoiceTaskUnderstandingResult = TaskUnderstandingResult<
  CreateCustomerInvoiceInput,
  typeof CREATE_CUSTOMER_INVOICE_TASK_ID
>;
export async function loadTaskModule(): Promise<CreateCustomerInvoiceTaskModule> {
  const { strategy } = await import("./strategies/create-customer-invoice");
  return {
    task,
    strategies: [strategy],
  };
}
export const taskRegistration = {
  task,
  loadTaskModule,
} satisfies TaskRegistration<CreateCustomerInvoiceInput, typeof CREATE_CUSTOMER_INVOICE_TASK_ID>;
