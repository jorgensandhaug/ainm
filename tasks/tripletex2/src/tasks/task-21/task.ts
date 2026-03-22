import type {
  TaskModule,
  TaskRegistration,
  TaskSpec,
  TaskStrategy,
  TaskUnderstandingResult,
} from "../../runtime/contracts";

export const ONBOARD_EMPLOYEE_OFFER_LETTER_TASK_ID = "21";
export const ONBOARD_EMPLOYEE_OFFER_LETTER_TX_TASK_ID = "21";
export const ONBOARD_EMPLOYEE_OFFER_LETTER_INPUT_SCHEMA_ID = "21.v1";

export interface OnboardEmployeeOfferLetterInput {
  employeeName: string;
  birthDate: string;
  departmentName: string;
  occupationCodeId: number;
  annualSalaryNok: number;
  percentageOfFullTimeEquivalent: number;
  startDate: string;
  employmentForm?: string;
  standardHoursPerDay?: number;
}

export const task = {
  taskId: ONBOARD_EMPLOYEE_OFFER_LETTER_TASK_ID,
  txTaskId: ONBOARD_EMPLOYEE_OFFER_LETTER_TX_TASK_ID,
  taskName: "Onboard employee from offer letter",
  implementationStatus: "implemented",
  signature:
    "onboardEmployeeOfferLetter(employeeName, birthDate, departmentName, occupationCodeId, annualSalaryNok, percentageOfFullTimeEquivalent, startDate, employmentForm?, standardHoursPerDay?)",
  summary:
    "Create a new employee from a tilbudsbrev (offer letter) PDF, creating the department if needed. Uses remunerationType NOT_CHOSEN because offer letters do not specify Lonnstype.",
  inputSchemaId: ONBOARD_EMPLOYEE_OFFER_LETTER_INPUT_SCHEMA_ID,
  requiredFields: [
    "employeeName",
    "birthDate",
    "departmentName",
    "occupationCodeId",
    "annualSalaryNok",
    "percentageOfFullTimeEquivalent",
    "startDate",
  ] as const,
  optionalFields: [
    "employmentForm",
    "standardHoursPerDay",
  ] as const,
  fieldDescriptions: {
    employeeName:
      "Full employee name exactly as written in the tilbudsbrev PDF.",
    birthDate:
      "Employee birth date from the tilbudsbrev, normalized to ISO YYYY-MM-DD.",
    departmentName:
      "Exact department name from the tilbudsbrev PDF.",
    occupationCodeId:
      "Resolved Tripletex occupation code id. Use hardcoded mappings: Seniorutvikler→5935, Regnskapssjef→4679, HR-rådgiver→4169, Salgssjef→4930, Kontormedarbeider→2951, IT-konsulent→2610.",
    annualSalaryNok:
      "Annual salary in NOK from the tilbudsbrev ('Årslønn' field).",
    percentageOfFullTimeEquivalent:
      "Employment percentage from the tilbudsbrev ('Stillingsprosent' field), as a whole number like 100 or 80.",
    startDate:
      "Employment start date from the tilbudsbrev ('Tiltredelse' field), normalized to ISO YYYY-MM-DD.",
    employmentForm:
      "Employment form from the tilbudsbrev ('Ansettelsesform' field). Usually 'Fast stilling' → PERMANENT. Defaults to PERMANENT.",
    standardHoursPerDay:
      "Standard working hours per day from the tilbudsbrev ('Arbeidstid' field). Optional; used with POST /employee/standardTime.",
  },
  extractionNotes: [
    "Use the attached tilbudsbrev (offer letter) PDF as first-class evidence. The prompt itself is generic.",
    "The tilbudsbrev does NOT contain Lonnstype. Do NOT extract remunerationType — the strategy forces NOT_CHOSEN.",
    "The tilbudsbrev does NOT contain email, nationalIdentityNumber, or bankAccountNumber. Do not fabricate them.",
    "Resolve the job title (Stilling field) to a Tripletex occupationCodeId using hardcoded mappings. For 'Senior'-prefixed titles, map to the base occupation (e.g., Seniorutvikler→SYSTEMUTVIKLER id 5935).",
    "Keep percentageOfFullTimeEquivalent as the percentage value itself, not a fractional ratio.",
    "Normalize 'Fast stilling' to employmentForm=PERMANENT.",
  ] as const,
} satisfies TaskSpec<
  OnboardEmployeeOfferLetterInput,
  typeof ONBOARD_EMPLOYEE_OFFER_LETTER_TASK_ID
>;

export type OnboardEmployeeOfferLetterStrategy = TaskStrategy<
  OnboardEmployeeOfferLetterInput,
  typeof ONBOARD_EMPLOYEE_OFFER_LETTER_TASK_ID
>;

export type OnboardEmployeeOfferLetterTaskModule = TaskModule<
  OnboardEmployeeOfferLetterInput,
  typeof ONBOARD_EMPLOYEE_OFFER_LETTER_TASK_ID
>;

export type OnboardEmployeeOfferLetterTaskUnderstandingResult =
  TaskUnderstandingResult<
    OnboardEmployeeOfferLetterInput,
    typeof ONBOARD_EMPLOYEE_OFFER_LETTER_TASK_ID
  >;

export async function loadTaskModule(): Promise<OnboardEmployeeOfferLetterTaskModule> {
  const { strategy } = await import(
    "./strategies/onboard-employee-offer-letter"
  );

  return {
    task,
    strategies: [strategy],
  };
}

export const taskRegistration = {
  task,
  loadTaskModule,
} satisfies TaskRegistration<
  OnboardEmployeeOfferLetterInput,
  typeof ONBOARD_EMPLOYEE_OFFER_LETTER_TASK_ID
>;
