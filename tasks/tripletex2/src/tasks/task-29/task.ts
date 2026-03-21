import type {
  TaskModule,
  TaskRegistration,
  TaskSpec,
  TaskStrategy,
  TaskUnderstandingResult,
} from "../../runtime/contracts";

export const FULL_PROJECT_LIFECYCLE_TASK_ID = "29";
export const FULL_PROJECT_LIFECYCLE_TX_TASK_ID = "29";
export const FULL_PROJECT_LIFECYCLE_INPUT_SCHEMA_ID = "29.v1";

export interface FullProjectLifecycleEmployeeInput {
  employeeName: string;
  email: string;
  hours: number;
  birthDate?: string;
}

export interface FullProjectLifecycleInput {
  projectName: string;
  customerName: string;
  customerOrganizationNumber: string;
  projectBudgetNok: number;
  employees: FullProjectLifecycleEmployeeInput[];
  supplierName: string;
  supplierOrganizationNumber: string;
  supplierCostNok: number;
  activityName?: string;
  invoiceLineDescription?: string;
  supplierCostDescription?: string;
  projectManagerEmail?: string;
  startDate?: string;
  invoiceDate?: string;
  deliveryDate?: string;
}

export const task = {
  taskId: FULL_PROJECT_LIFECYCLE_TASK_ID,
  txTaskId: FULL_PROJECT_LIFECYCLE_TX_TASK_ID,
  taskName: "Full project lifecycle",
  implementationStatus: "implemented",
  signature:
    "runFullProjectLifecycle(projectName, customerName, customerOrganizationNumber, projectBudgetNok, employees, supplierName, supplierOrganizationNumber, supplierCostNok, activityName?, invoiceLineDescription?, supplierCostDescription?, projectManagerEmail?, startDate?, invoiceDate?, deliveryDate?)",
  summary:
    "Create or reuse the customer, supplier, and employees needed for a project, register project hours and supplier costs, then create the project invoice through the order-to-invoice path.",
  inputSchemaId: FULL_PROJECT_LIFECYCLE_INPUT_SCHEMA_ID,
  requiredFields: [
    "projectName",
    "customerName",
    "customerOrganizationNumber",
    "projectBudgetNok",
    "employees",
    "supplierName",
    "supplierOrganizationNumber",
    "supplierCostNok",
  ] as const,
  optionalFields: [
    "activityName",
    "invoiceLineDescription",
    "supplierCostDescription",
    "projectManagerEmail",
    "startDate",
    "invoiceDate",
    "deliveryDate",
  ] as const,
  fieldDescriptions: {
    projectName:
      "Exact project name to create and later reuse on the invoice line.",
    customerName:
      "Exact customer name to create or use as supporting evidence when reusing an existing customer.",
    customerOrganizationNumber:
      "Organization number for the customer that should own the project.",
    projectBudgetNok:
      "Project budget in NOK. Runtime also uses this as the invoice amount for the final project order line.",
    employees:
      "Employees who must have project hours registered, in prompt order, with exact names, emails, and requested hour totals.",
    supplierName:
      "Exact supplier name to create or use as supporting evidence when reusing an existing supplier.",
    supplierOrganizationNumber:
      "Organization number for the supplier whose project cost should be registered.",
    supplierCostNok:
      "Supplier project cost to register in NOK.",
    activityName:
      "Optional explicit project activity name. When omitted, runtime uses a stable default project-work activity name.",
    invoiceLineDescription:
      "Optional customer-facing order or invoice line description. When omitted, runtime reuses the project name.",
    supplierCostDescription:
      "Optional project-cost description for the supplier cost line.",
    projectManagerEmail:
      "Optional preferred project-manager email when the prompt names a lead or manager explicitly. Runtime falls back to another assignable manager only if that email is not assignable.",
    startDate:
      "Optional project start date in ISO YYYY-MM-DD format. When omitted, runtime defaults to the run date.",
    invoiceDate:
      "Optional invoice date in ISO YYYY-MM-DD format. When omitted, runtime defaults to the start date or run date.",
    deliveryDate:
      "Optional delivery date in ISO YYYY-MM-DD format for the project order. When omitted, runtime uses a deterministic offset from invoiceDate.",
  },
  extractionNotes: [
    "Always extract employees as an array in prompt order, even when the prompt names exactly two employees.",
    "If the prompt explicitly marks one employee as project lead or project manager, surface that email as projectManagerEmail; otherwise leave projectManagerEmail unset.",
    "Keep projectBudgetNok as the full project budget amount. The deterministic runtime uses the proven budget-backed order-to-invoice path rather than trying to infer an invoice amount from hours or supplier cost totals.",
    "Leave birthDate unset unless the prompt truly provides it; runtime can use deterministic placeholder dates only when an employee must be created.",
  ] as const,
} satisfies TaskSpec<
  FullProjectLifecycleInput,
  typeof FULL_PROJECT_LIFECYCLE_TASK_ID
>;

export type FullProjectLifecycleStrategy = TaskStrategy<
  FullProjectLifecycleInput,
  typeof FULL_PROJECT_LIFECYCLE_TASK_ID
>;

export type FullProjectLifecycleTaskModule = TaskModule<
  FullProjectLifecycleInput,
  typeof FULL_PROJECT_LIFECYCLE_TASK_ID
>;

export type FullProjectLifecycleTaskUnderstandingResult =
  TaskUnderstandingResult<
    FullProjectLifecycleInput,
    typeof FULL_PROJECT_LIFECYCLE_TASK_ID
  >;

export async function loadTaskModule(): Promise<FullProjectLifecycleTaskModule> {
  const { strategy } = await import("./strategies/full-project-lifecycle");

  return {
    task,
    strategies: [strategy],
  };
}

export const taskRegistration = {
  task,
  loadTaskModule,
} satisfies TaskRegistration<
  FullProjectLifecycleInput,
  typeof FULL_PROJECT_LIFECYCLE_TASK_ID
>;
