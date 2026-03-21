import type {
  TaskModule,
  TaskRegistration,
  TaskSpec,
  TaskStrategy,
  TaskUnderstandingResult,
} from "../../runtime/contracts";
export const REGISTER_PROJECT_HOURS_AND_CREATE_PROJECT_INVOICE_TASK_ID = "15";
export const REGISTER_PROJECT_HOURS_AND_CREATE_PROJECT_INVOICE_TX_TASK_ID = "15";
export const REGISTER_PROJECT_HOURS_AND_CREATE_PROJECT_INVOICE_INPUT_SCHEMA_ID = "15.v1";
export interface RegisterProjectHoursAndCreateProjectInvoiceInput {
  employeeEmail: string;
  projectName: string;
  customerOrganizationNumber: string;
  activityName: string;
  hours: number;
  hourlyRateExcludingVatNok: number;
  customerName?: string;
  entryDate?: string;
  invoiceDate?: string;
  invoiceLineDescription?: string;
}
export const task = {
  taskId: REGISTER_PROJECT_HOURS_AND_CREATE_PROJECT_INVOICE_TASK_ID,
  txTaskId: REGISTER_PROJECT_HOURS_AND_CREATE_PROJECT_INVOICE_TX_TASK_ID,
  taskName: "Register project hours and create project invoice",
  implementationStatus: "implemented",
  signature:
    "registerProjectHoursAndCreateProjectInvoice(employeeEmail, projectName, customerOrganizationNumber, activityName, hours, hourlyRateExcludingVatNok, customerName?, entryDate?, invoiceDate?, invoiceLineDescription?)",
  summary:
    "Register billable hours to a project activity and generate the resulting project invoice.",
  inputSchemaId: REGISTER_PROJECT_HOURS_AND_CREATE_PROJECT_INVOICE_INPUT_SCHEMA_ID,
  requiredFields: [
    "employeeEmail",
    "projectName",
    "customerOrganizationNumber",
    "activityName",
    "hours",
    "hourlyRateExcludingVatNok",
  ] as const,
  optionalFields: [
    "customerName",
    "entryDate",
    "invoiceDate",
    "invoiceLineDescription",
  ] as const,
  fieldDescriptions: {
    employeeEmail:
      "Email for the existing employee who should register the project hours.",
    projectName:
      "Exact project name.",
    customerOrganizationNumber:
      "Organization number for the customer linked to the project.",
    activityName:
      "Exact project activity name to use for the timesheet entry.",
    hours:
      "Total project hours to register.",
    hourlyRateExcludingVatNok:
      "Billing rate excluding VAT for the invoice line, normalized to NOK.",
    customerName:
      "Optional customer name used only as supporting evidence if project lookup is ambiguous.",
    entryDate:
      "Optional initial timesheet entry date in ISO YYYY-MM-DD format. Runtime may split oversized totals across dates if needed.",
    invoiceDate:
      "Optional invoice date in ISO YYYY-MM-DD format.",
    invoiceLineDescription:
      "Optional explicit customer-facing invoice line description when it differs from the activity name.",
  },
  extractionNotes: [
    "Treat hourlyRateExcludingVatNok as the customer-facing invoice rate even when the internal activity later resolves as non-chargeable.",
    "If the prompt omits an explicit invoiceLineDescription, runtime can reuse the activity name or billing text.",
    "Leave oversized hour totals intact in extraction; runtime can split them across dates to respect the 24-hour per-entry limit.",
  ] as const,
} satisfies TaskSpec<RegisterProjectHoursAndCreateProjectInvoiceInput, typeof REGISTER_PROJECT_HOURS_AND_CREATE_PROJECT_INVOICE_TASK_ID>;
export type RegisterProjectHoursAndCreateProjectInvoiceStrategy = TaskStrategy<
  RegisterProjectHoursAndCreateProjectInvoiceInput,
  typeof REGISTER_PROJECT_HOURS_AND_CREATE_PROJECT_INVOICE_TASK_ID
>;
export type RegisterProjectHoursAndCreateProjectInvoiceTaskModule = TaskModule<
  RegisterProjectHoursAndCreateProjectInvoiceInput,
  typeof REGISTER_PROJECT_HOURS_AND_CREATE_PROJECT_INVOICE_TASK_ID
>;
export type RegisterProjectHoursAndCreateProjectInvoiceTaskUnderstandingResult = TaskUnderstandingResult<
  RegisterProjectHoursAndCreateProjectInvoiceInput,
  typeof REGISTER_PROJECT_HOURS_AND_CREATE_PROJECT_INVOICE_TASK_ID
>;
export async function loadTaskModule(): Promise<RegisterProjectHoursAndCreateProjectInvoiceTaskModule> {
  const { strategy } = await import(
    "./strategies/register-hours-then-project-order-invoice"
  );
  return {
    task,
    strategies: [strategy],
  };
}
export const taskRegistration = {
  task,
  loadTaskModule,
} satisfies TaskRegistration<RegisterProjectHoursAndCreateProjectInvoiceInput, typeof REGISTER_PROJECT_HOURS_AND_CREATE_PROJECT_INVOICE_TASK_ID>;
