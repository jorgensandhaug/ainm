import type {
  TaskModule,
  TaskRegistration,
  TaskSpec,
  TaskStrategy,
  TaskUnderstandingResult,
} from "../../runtime/contracts";

export const REGISTER_SUPPLIER_INVOICE_PDF_TASK_ID = "20";
export const REGISTER_SUPPLIER_INVOICE_PDF_TX_TASK_ID = "20";
export const REGISTER_SUPPLIER_INVOICE_PDF_INPUT_SCHEMA_ID = "20.v1";

export interface RegisterSupplierInvoicePdfInput {
  supplierName: string;
  organizationNumber: string;
  invoiceNumber: string;
  lineDescription: string;
  grossAmountNok: number;
  expenseAccountNumber: number;
  vatRatePercent: number;
  attachmentFileName: string;
  invoiceDate?: string;
  dueDate?: string;
  supplierAlreadyExists?: boolean;
}

export const task = {
  taskId: REGISTER_SUPPLIER_INVOICE_PDF_TASK_ID,
  txTaskId: REGISTER_SUPPLIER_INVOICE_PDF_TX_TASK_ID,
  taskName: "Register supplier invoice with PDF attachment",
  implementationStatus: "implemented",
  signature:
    "registerSupplierInvoicePdf(supplierName, organizationNumber, invoiceNumber, lineDescription, grossAmountNok, expenseAccountNumber, vatRatePercent, attachmentFileName, invoiceDate?, dueDate?, supplierAlreadyExists?)",
  summary:
    "Register an incoming supplier invoice from prompt-plus-PDF data and attach the source PDF to the created voucher.",
  inputSchemaId: REGISTER_SUPPLIER_INVOICE_PDF_INPUT_SCHEMA_ID,
  requiredFields: [
    "supplierName",
    "organizationNumber",
    "invoiceNumber",
    "lineDescription",
    "grossAmountNok",
    "expenseAccountNumber",
    "vatRatePercent",
    "attachmentFileName",
  ] as const,
  optionalFields: [
    "invoiceDate",
    "dueDate",
    "supplierAlreadyExists",
  ] as const,
  fieldDescriptions: {
    supplierName:
      "Supplier name extracted from the prompt or attached invoice PDF.",
    organizationNumber:
      "Supplier organization number extracted from the prompt or attached invoice PDF.",
    invoiceNumber:
      "Supplier invoice number to register.",
    lineDescription:
      "Invoice line description from the prompt or attached invoice PDF.",
    grossAmountNok:
      "Gross supplier invoice amount in NOK.",
    expenseAccountNumber:
      "Expense ledger account number for the debit posting.",
    vatRatePercent:
      "Requested incoming VAT percentage from the invoice.",
    attachmentFileName:
      "Exact request attachment filename for the source supplier-invoice PDF that must be uploaded to the voucher.",
    invoiceDate:
      "Optional supplier invoice date in ISO YYYY-MM-DD format.",
    dueDate:
      "Optional supplier invoice due date in ISO YYYY-MM-DD format.",
    supplierAlreadyExists:
      "Whether the prompt explicitly says the supplier already exists and runtime should prefer lookup-first resolution.",
  },
  extractionNotes: [
    "Use the attached supplier-invoice PDF as first-class evidence and extract supplier identity, invoice dates, invoice number, description, gross amount, expense account, and VAT from the attachment text when the prompt itself is generic.",
    "Always set attachmentFileName to the exact request fileName of the PDF that should be uploaded later; do not invent or normalize it.",
    "Normalize invoiceDate and dueDate to ISO YYYY-MM-DD when present in the prompt or attachment. Leave them unset only when the invoice truly omits them.",
    "Normalize VAT expressions into numeric vatRatePercent and keep grossAmountNok as the gross total from the invoice.",
    "Only set supplierAlreadyExists when the prompt explicitly says the supplier already exists or clearly implies retry or persistent-account context.",
  ] as const,
} satisfies TaskSpec<
  RegisterSupplierInvoicePdfInput,
  typeof REGISTER_SUPPLIER_INVOICE_PDF_TASK_ID
>;

export type RegisterSupplierInvoicePdfStrategy = TaskStrategy<
  RegisterSupplierInvoicePdfInput,
  typeof REGISTER_SUPPLIER_INVOICE_PDF_TASK_ID
>;

export type RegisterSupplierInvoicePdfTaskModule = TaskModule<
  RegisterSupplierInvoicePdfInput,
  typeof REGISTER_SUPPLIER_INVOICE_PDF_TASK_ID
>;

export type RegisterSupplierInvoicePdfTaskUnderstandingResult =
  TaskUnderstandingResult<
    RegisterSupplierInvoicePdfInput,
    typeof REGISTER_SUPPLIER_INVOICE_PDF_TASK_ID
  >;

export async function loadTaskModule(): Promise<RegisterSupplierInvoicePdfTaskModule> {
  const { strategy: v1 } = await import(
    "./strategies/register-supplier-invoice-pdf"
  );
  const { strategy: v2 } = await import(
    "./strategies/register-supplier-invoice-pdf-v2"
  );

  return {
    task,
    strategies: [v2, v1],
  };
}

export const taskRegistration = {
  task,
  loadTaskModule,
} satisfies TaskRegistration<
  RegisterSupplierInvoicePdfInput,
  typeof REGISTER_SUPPLIER_INVOICE_PDF_TASK_ID
>;
