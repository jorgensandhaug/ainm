import type {
  TaskModule,
  TaskRegistration,
  TaskSpec,
  TaskStrategy,
  TaskUnderstandingResult,
} from "../../runtime/contracts";
export const REGISTER_TRAVEL_EXPENSE_TASK_ID = "13";
export const REGISTER_TRAVEL_EXPENSE_TX_TASK_ID = "13";
export const REGISTER_TRAVEL_EXPENSE_INPUT_SCHEMA_ID = "13.v1";
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
  tripDurationDays: number;
  costs: RegisterTravelExpenseCostInput[];
  perDiemCompensations: RegisterTravelExpensePerDiemInput[];
  departureDate?: string;
  returnDate?: string;
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
    "registerTravelExpense(employeeEmail, title, purpose, tripDurationDays, costs, perDiemCompensations, departureDate?, returnDate?, departureFrom?, employeeName?, detailedJourneyDescription?)",
  summary:
    "Register a travel expense claim with per diem and named out-of-pocket expenses.",
  inputSchemaId: REGISTER_TRAVEL_EXPENSE_INPUT_SCHEMA_ID,
  requiredFields: [
    "employeeEmail",
    "title",
    "purpose",
    "tripDurationDays",
    "costs",
    "perDiemCompensations",
  ] as const,
  optionalFields: [
    "departureDate",
    "returnDate",
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
    tripDurationDays:
      "Number of travel days extracted from the prompt (e.g. '5 dagar' → 5, '2 days' → 2). Always extractable even when concrete dates are not given.",
    departureDate:
      "Optional trip departure date in ISO YYYY-MM-DD. Only set when the prompt provides an explicit calendar date.",
    returnDate:
      "Optional trip return date in ISO YYYY-MM-DD. Only set when the prompt provides an explicit calendar date.",
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
    "tripDurationDays is ALWAYS extractable: '5 dagar' → 5, '2 days' → 2, '4 dager med diett' → 4. Extract the integer day count.",
    "departureDate and returnDate are OPTIONAL. Only set them when the prompt gives explicit calendar dates (e.g. '15. mars'). Most prompts give only duration.",
    "Preserve the title, purpose, and comments exactly as stated in the prompt.",
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
  const [{ strategy: v1 }, { strategy: v3 }] = await Promise.all([
    import("./strategies/create-and-deliver-travel-expense"),
    import("./strategies/create-and-deliver-travel-expense-v3"),
  ]);
  return {
    task,
    strategies: [v3, v1],
  };
}
export const taskRegistration = {
  task,
  loadTaskModule,
} satisfies TaskRegistration<RegisterTravelExpenseInput, typeof REGISTER_TRAVEL_EXPENSE_TASK_ID>;
