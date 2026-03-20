import type {
  TaskModule,
  TaskRegistration,
  TaskSpec,
  TaskStrategy,
  TaskUnderstandingResult,
} from "../../runtime/contracts";
export const REGISTER_TRAVEL_EXPENSE_TASK_ID = "register-travel-expense";
export const REGISTER_TRAVEL_EXPENSE_TX_TASK_ID = "13";
export const REGISTER_TRAVEL_EXPENSE_INPUT_SCHEMA_ID = "register-travel-expense.v1";
export interface RegisterTravelExpenseCostInput {
  categoryName: string;
  amountNokInclVat: number;
  comment?: string;
  vatRatePercent?: number;
}
export interface RegisterTravelExpensePerDiemInput {
  count: number;
  rateNok: number;
  amountNok: number;
  overnightAccommodation?: string;
}

export interface RegisterTravelExpenseInput {
  employeeEmail: string;
  title: string;
  purpose: string;
  departureDate: string;
  returnDate: string;
  costs: RegisterTravelExpenseCostInput[];
  perDiemCompensations: RegisterTravelExpensePerDiemInput[];
  departureFrom?: string;
  employeeName?: string;
  detailedJourneyDescription?: string;
}
export const task = {
  taskId: REGISTER_TRAVEL_EXPENSE_TASK_ID,
  txTaskId: REGISTER_TRAVEL_EXPENSE_TX_TASK_ID,
  taskName: "Register travel expense",
  implementationStatus: "implemented",
  signature:
    "registerTravelExpense(employeeEmail, title, purpose, departureDate, returnDate, costs, perDiemCompensations, departureFrom?, employeeName?, detailedJourneyDescription?)",
  summary:
    "Register a travel expense claim with per diem and named out-of-pocket expenses.",
  inputSchemaId: REGISTER_TRAVEL_EXPENSE_INPUT_SCHEMA_ID,
  requiredFields: [
    "employeeEmail",
    "title",
    "purpose",
    "departureDate",
    "returnDate",
    "costs",
    "perDiemCompensations",
  ] as const,
  optionalFields: [
    "departureFrom",
    "employeeName",
    "detailedJourneyDescription",
  ] as const,
  fieldDescriptions: {
    employeeEmail:
      "Email for the existing employee who should own the travel expense.",
    title:
      "Travel expense title.",
    purpose:
      "Travel purpose text copied into travelDetails.",
    departureDate:
      "Trip departure date normalized to ISO YYYY-MM-DD.",
    returnDate:
      "Trip return date normalized to ISO YYYY-MM-DD.",
    costs:
      "Named travel-expense cost rows with category names and gross NOK amounts.",
    perDiemCompensations:
      "Per-diem rows with manual count, rate, amount, and any overnight-accommodation hint from the prompt.",
    departureFrom:
      "Optional concrete departure location from the prompt. Leave unset when runtime must infer it from employee or company data.",
    employeeName:
      "Optional employee name used only as supporting lookup evidence.",
    detailedJourneyDescription:
      "Optional detailed journey description when the prompt provides one separately from the purpose.",
  },
  extractionNotes: [
    "Do not invent a generic departureFrom placeholder; leave it unset when the prompt does not provide a concrete location.",
    "Normalize travel dates to ISO YYYY-MM-DD and preserve the title, purpose, and comments exactly.",
    "Only use this task surface when the prompt supplies enough explicit dates and per-diem detail to reach a deliverable travel expense.",
  ] as const,
} satisfies TaskSpec<RegisterTravelExpenseInput, typeof REGISTER_TRAVEL_EXPENSE_TASK_ID>;
export type RegisterTravelExpenseStrategy = TaskStrategy<
  RegisterTravelExpenseInput,
  typeof REGISTER_TRAVEL_EXPENSE_TASK_ID
>;
export type RegisterTravelExpenseTaskModule = TaskModule<
  RegisterTravelExpenseInput,
  typeof REGISTER_TRAVEL_EXPENSE_TASK_ID
>;
export type RegisterTravelExpenseTaskUnderstandingResult = TaskUnderstandingResult<
  RegisterTravelExpenseInput,
  typeof REGISTER_TRAVEL_EXPENSE_TASK_ID
>;
export async function loadTaskModule(): Promise<RegisterTravelExpenseTaskModule> {
  const { strategy } = await import("./strategies/not-implemented");
  return {
    task,
    strategies: [strategy],
  };
}
export const taskRegistration = {
  task,
  loadTaskModule,
} satisfies TaskRegistration<RegisterTravelExpenseInput, typeof REGISTER_TRAVEL_EXPENSE_TASK_ID>;