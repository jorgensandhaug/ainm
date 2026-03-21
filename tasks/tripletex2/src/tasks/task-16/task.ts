import type {
  TaskModule,
  TaskRegistration,
  TaskSpec,
  TaskStrategy,
  TaskUnderstandingResult,
} from "../../runtime/contracts";
export const REGISTER_SUPPLIER_INVOICE_TASK_ID = "16";
export const REGISTER_SUPPLIER_INVOICE_TX_TASK_ID = "16";
export const REGISTER_SUPPLIER_INVOICE_INPUT_SCHEMA_ID = "16.v1";
export interface RegisterSupplierInvoiceInput {
  supplierName: string;
  organizationNumber: string;
  invoiceNumber: string;
  lineDescription: string;
  grossAmountNok: number;
  expenseAccountNumber: number;
  vatRatePercent: number;
  invoiceDate?: string;
  dueDate?: string;
  supplierAlreadyExists?: boolean;
}
export const task = {
  taskId: REGISTER_SUPPLIER_INVOICE_TASK_ID,
  txTaskId: REGISTER_SUPPLIER_INVOICE_TX_TASK_ID,
  taskName: "Register supplier invoice",
  implementationStatus: "implemented",
  signature:
    "registerSupplierInvoice(supplierName, organizationNumber, invoiceNumber, lineDescription, grossAmountNok, expenseAccountNumber, vatRatePercent, invoiceDate?, dueDate?, supplierAlreadyExists?)",
  summary:
    "Register an incoming supplier invoice with the requested account and input VAT.",
  inputSchemaId: REGISTER_SUPPLIER_INVOICE_INPUT_SCHEMA_ID,
  requiredFields: [
    "supplierName",
    "organizationNumber",
    "invoiceNumber",
    "lineDescription",
    "grossAmountNok",
    "expenseAccountNumber",
    "vatRatePercent",
  ] as const,
  optionalFields: [
    "invoiceDate",
    "dueDate",
    "supplierAlreadyExists",
  ] as const,
  fieldDescriptions: {
    supplierName:
      "Supplier name to create or resolve.",
    organizationNumber:
      "Supplier organization number.",
    invoiceNumber:
      "Supplier invoice number to register.",
    lineDescription:
      "Exact invoice line description used in the imported supplier invoice.",
    grossAmountNok:
      "Gross supplier invoice amount in NOK.",
    expenseAccountNumber:
      "Expense ledger account number for the manual debit posting.",
    vatRatePercent:
      "Requested incoming VAT percentage.",
    invoiceDate:
      "Optional supplier invoice date in ISO YYYY-MM-DD format.",
    dueDate:
      "Optional supplier invoice due date in ISO YYYY-MM-DD format.",
    supplierAlreadyExists:
      "Whether the prompt explicitly says the supplier already exists and runtime should prefer a lookup-first branch.",
  },
  extractionNotes: [
    "Normalize VAT expressions into a numeric vatRatePercent and keep grossAmountNok as the gross total from the prompt.",
    "If invoiceDate or dueDate is omitted, leave it unset so runtime can apply the trusted-standard default run date behavior.",
    "Only set supplierAlreadyExists when the prompt explicitly says the supplier already exists or clearly implies retry/persistent-account context.",
  ] as const,
} satisfies TaskSpec<RegisterSupplierInvoiceInput, typeof REGISTER_SUPPLIER_INVOICE_TASK_ID>;
export type RegisterSupplierInvoiceStrategy = TaskStrategy<
  RegisterSupplierInvoiceInput,
  typeof REGISTER_SUPPLIER_INVOICE_TASK_ID
>;
export type RegisterSupplierInvoiceTaskModule = TaskModule<
  RegisterSupplierInvoiceInput,
  typeof REGISTER_SUPPLIER_INVOICE_TASK_ID
>;
export type RegisterSupplierInvoiceTaskUnderstandingResult = TaskUnderstandingResult<
  RegisterSupplierInvoiceInput,
  typeof REGISTER_SUPPLIER_INVOICE_TASK_ID
>;
export async function loadTaskModule(): Promise<RegisterSupplierInvoiceTaskModule> {
  const { strategy } = await import("./strategies/not-implemented");
  return {
    task,
    strategies: [strategy],
  };
}
export const taskRegistration = {
  task,
  loadTaskModule,
} satisfies TaskRegistration<RegisterSupplierInvoiceInput, typeof REGISTER_SUPPLIER_INVOICE_TASK_ID>;