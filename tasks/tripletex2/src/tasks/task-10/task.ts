import type {
  TaskModule,
  TaskRegistration,
  TaskSpec,
  TaskStrategy,
  TaskUnderstandingResult,
} from "../../runtime/contracts";
export const ISSUE_FULL_CREDIT_NOTE_TASK_ID = "10";
export const ISSUE_FULL_CREDIT_NOTE_TX_TASK_ID = "14";
export const ISSUE_FULL_CREDIT_NOTE_INPUT_SCHEMA_ID = "10.v1";
export interface IssueFullCreditNoteInput {
  customerOrganizationNumber: string;
  lineDescription: string;
  amountExcludingVatNok: number;
  creditNoteDate?: string;
  customerName?: string;
  invoiceId?: number;
  invoiceNumber?: number;
}
export const task = {
  taskId: ISSUE_FULL_CREDIT_NOTE_TASK_ID,
  txTaskId: ISSUE_FULL_CREDIT_NOTE_TX_TASK_ID,
  taskName: "Issue full credit note",
  implementationStatus: "implemented",
  signature:
    "issueFullCreditNote(customerOrganizationNumber, lineDescription, amountExcludingVatNok, creditNoteDate?, customerName?, invoiceId?, invoiceNumber?)",
  summary:
    "Find an invoice and issue a full credit note that reverses the entire amount.",
  inputSchemaId: ISSUE_FULL_CREDIT_NOTE_INPUT_SCHEMA_ID,
  requiredFields: [
    "customerOrganizationNumber",
    "lineDescription",
    "amountExcludingVatNok",
  ] as const,
  optionalFields: [
    "creditNoteDate",
    "customerName",
    "invoiceId",
    "invoiceNumber",
  ] as const,
  fieldDescriptions: {
    customerOrganizationNumber:
      "Organization number for the customer on the original invoice.",
    lineDescription:
      "Exact line or service description used to locate the original invoice.",
    amountExcludingVatNok:
      "Exact original invoice amount excluding VAT used as a locate key.",
    creditNoteDate:
      "Optional credit-note date in ISO YYYY-MM-DD format. If omitted, runtime can use the run date.",
    customerName:
      "Optional customer name for local disambiguation when needed.",
    invoiceId:
      "Optional exact Tripletex invoice id when the prompt provides it directly.",
    invoiceNumber:
      "Optional invoice number when the prompt provides it directly.",
  },
  extractionNotes: [
    "Treat amountExcludingVatNok and lineDescription as locate keys for the original invoice, not as write-time totals to recompute.",
    "If the prompt already gives invoiceId or invoiceNumber, extract it directly instead of forcing a fuzzy locate-only flow.",
    "Do not turn this task into a partial credit-note shape during extraction.",
  ] as const,
} satisfies TaskSpec<IssueFullCreditNoteInput, typeof ISSUE_FULL_CREDIT_NOTE_TASK_ID>;
export type IssueFullCreditNoteStrategy = TaskStrategy<
  IssueFullCreditNoteInput,
  typeof ISSUE_FULL_CREDIT_NOTE_TASK_ID
>;
export type IssueFullCreditNoteTaskModule = TaskModule<
  IssueFullCreditNoteInput,
  typeof ISSUE_FULL_CREDIT_NOTE_TASK_ID
>;
export type IssueFullCreditNoteTaskUnderstandingResult = TaskUnderstandingResult<
  IssueFullCreditNoteInput,
  typeof ISSUE_FULL_CREDIT_NOTE_TASK_ID
>;
export async function loadTaskModule(): Promise<IssueFullCreditNoteTaskModule> {
  const { strategy } = await import("./strategies/issue-full-credit-note");
  return {
    task,
    strategies: [strategy],
  };
}
export const taskRegistration = {
  task,
  loadTaskModule,
} satisfies TaskRegistration<IssueFullCreditNoteInput, typeof ISSUE_FULL_CREDIT_NOTE_TASK_ID>;
