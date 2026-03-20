import type {
  TaskModule,
  TaskRegistration,
  TaskSpec,
  TaskStrategy,
  TaskUnderstandingResult,
} from "../../runtime/contracts";
export const CREATE_SUPPLIER_TASK_ID = "create-supplier";
export const CREATE_SUPPLIER_TX_TASK_ID = "02";
export const CREATE_SUPPLIER_INPUT_SCHEMA_ID = "create-supplier.v1";
export interface CreateSupplierInput {
  supplierName: string;
  organizationNumber: string;
  email: string;
  invoiceEmail?: string;
}
export const task = {
  taskId: CREATE_SUPPLIER_TASK_ID,
  txTaskId: CREATE_SUPPLIER_TX_TASK_ID,
  taskName: "Create supplier",
  implementationStatus: "implemented",
  signature:
    "createSupplier(supplierName, organizationNumber, email, invoiceEmail?)",
  summary:
    "Create a supplier with organization number and invoice email details.",
  inputSchemaId: CREATE_SUPPLIER_INPUT_SCHEMA_ID,
  requiredFields: [
    "supplierName",
    "organizationNumber",
    "email",
  ] as const,
  optionalFields: [
    "invoiceEmail",
  ] as const,
  fieldDescriptions: {
    supplierName:
      "Exact supplier name to create in Tripletex.",
    organizationNumber:
      "Organization number for the supplier.",
    email:
      "Generic supplier contact email.",
    invoiceEmail:
      "Optional invoice-specific email when the prompt distinguishes it from the generic contact email.",
  },
  extractionNotes: [
    "If the prompt gives only one invoice-looking email, keep it in email and also populate invoiceEmail when the invoice-specific intent is explicit.",
    "Preserve supplier names exactly, including accented or non-ASCII characters.",
    "Do not invent postal, physical, or delivery address fields for the standard create-only shape.",
  ] as const,
} satisfies TaskSpec<CreateSupplierInput, typeof CREATE_SUPPLIER_TASK_ID>;
export type CreateSupplierStrategy = TaskStrategy<
  CreateSupplierInput,
  typeof CREATE_SUPPLIER_TASK_ID
>;
export type CreateSupplierTaskModule = TaskModule<
  CreateSupplierInput,
  typeof CREATE_SUPPLIER_TASK_ID
>;
export type CreateSupplierTaskUnderstandingResult = TaskUnderstandingResult<
  CreateSupplierInput,
  typeof CREATE_SUPPLIER_TASK_ID
>;
export async function loadTaskModule(): Promise<CreateSupplierTaskModule> {
  const { strategy } = await import("./strategies/not-implemented");
  return {
    task,
    strategies: [strategy],
  };
}
export const taskRegistration = {
  task,
  loadTaskModule,
} satisfies TaskRegistration<CreateSupplierInput, typeof CREATE_SUPPLIER_TASK_ID>;