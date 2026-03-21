import type {
  TaskModule,
  TaskRegistration,
  TaskSpec,
  TaskStrategy,
  TaskUnderstandingResult,
} from "../../runtime/contracts";
export const SET_PROJECT_FIXED_PRICE_AND_INVOICE_MILESTONE_TASK_ID = "14";
export const SET_PROJECT_FIXED_PRICE_AND_INVOICE_MILESTONE_TX_TASK_ID = "14";
export const SET_PROJECT_FIXED_PRICE_AND_INVOICE_MILESTONE_INPUT_SCHEMA_ID = "14.v1";
export interface SetProjectFixedPriceAndInvoiceMilestoneInput {
  projectName: string;
  customerOrganizationNumber: string;
  projectManagerEmail: string;
  fixedPriceExcludingVatNok: number;
  milestoneAmountExcludingVatNok: number;
  customerName?: string;
  projectManagerName?: string;
  startDate?: string;
  milestonePercentage?: number;
  invoiceDate?: string;
  milestoneDescription?: string;
}
export const task = {
  taskId: SET_PROJECT_FIXED_PRICE_AND_INVOICE_MILESTONE_TASK_ID,
  txTaskId: SET_PROJECT_FIXED_PRICE_AND_INVOICE_MILESTONE_TX_TASK_ID,
  taskName: "Set project fixed price and invoice milestone",
  implementationStatus: "implemented",
  signature:
    "setProjectFixedPriceAndInvoiceMilestone(projectName, customerOrganizationNumber, projectManagerEmail, fixedPriceExcludingVatNok, milestoneAmountExcludingVatNok, customerName?, projectManagerName?, startDate?, milestonePercentage?, invoiceDate?, milestoneDescription?)",
  summary:
    "Set a fixed project price and invoice a requested milestone percentage.",
  inputSchemaId: SET_PROJECT_FIXED_PRICE_AND_INVOICE_MILESTONE_INPUT_SCHEMA_ID,
  requiredFields: [
    "projectName",
    "customerOrganizationNumber",
    "projectManagerEmail",
    "fixedPriceExcludingVatNok",
    "milestoneAmountExcludingVatNok",
  ] as const,
  optionalFields: [
    "customerName",
    "projectManagerName",
    "startDate",
    "milestonePercentage",
    "invoiceDate",
    "milestoneDescription",
  ] as const,
  fieldDescriptions: {
    projectName:
      "Exact project name to update or reuse.",
    customerOrganizationNumber:
      "Organization number for the linked customer.",
    projectManagerEmail:
      "Email for the linked assignable project manager.",
    fixedPriceExcludingVatNok:
      "Full project fixed price excluding VAT.",
    milestoneAmountExcludingVatNok:
      "Exact milestone invoice amount excluding VAT after any percentage normalization.",
    customerName:
      "Optional customer name used only as supporting lookup evidence.",
    projectManagerName:
      "Optional manager name used only as supporting lookup evidence.",
    startDate:
      "Optional project start date in ISO YYYY-MM-DD format when the prompt supplies it.",
    milestonePercentage:
      "Optional original milestone percentage when the prompt expressed the milestone as a percent of fixed price.",
    invoiceDate:
      "Optional milestone invoice date in ISO YYYY-MM-DD format.",
    milestoneDescription:
      "Optional line description for the milestone order line.",
  },
  extractionNotes: [
    "If the prompt gives a milestone percentage, normalize it into milestoneAmountExcludingVatNok and also keep milestonePercentage when explicit.",
    "Preserve decimal milestone arithmetic exactly; do not round 25% or 33% milestones to whole NOK during extraction.",
    "Leave startDate unset when the prompt does not provide it so runtime can reuse the existing project start date when appropriate.",
  ] as const,
} satisfies TaskSpec<SetProjectFixedPriceAndInvoiceMilestoneInput, typeof SET_PROJECT_FIXED_PRICE_AND_INVOICE_MILESTONE_TASK_ID>;
export type SetProjectFixedPriceAndInvoiceMilestoneStrategy = TaskStrategy<
  SetProjectFixedPriceAndInvoiceMilestoneInput,
  typeof SET_PROJECT_FIXED_PRICE_AND_INVOICE_MILESTONE_TASK_ID
>;
export type SetProjectFixedPriceAndInvoiceMilestoneTaskModule = TaskModule<
  SetProjectFixedPriceAndInvoiceMilestoneInput,
  typeof SET_PROJECT_FIXED_PRICE_AND_INVOICE_MILESTONE_TASK_ID
>;
export type SetProjectFixedPriceAndInvoiceMilestoneTaskUnderstandingResult = TaskUnderstandingResult<
  SetProjectFixedPriceAndInvoiceMilestoneInput,
  typeof SET_PROJECT_FIXED_PRICE_AND_INVOICE_MILESTONE_TASK_ID
>;
export async function loadTaskModule(): Promise<SetProjectFixedPriceAndInvoiceMilestoneTaskModule> {
  const { strategy } = await import("./strategies/not-implemented");
  return {
    task,
    strategies: [strategy],
  };
}
export const taskRegistration = {
  task,
  loadTaskModule,
} satisfies TaskRegistration<SetProjectFixedPriceAndInvoiceMilestoneInput, typeof SET_PROJECT_FIXED_PRICE_AND_INVOICE_MILESTONE_TASK_ID>;