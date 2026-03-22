import type {
  TaskModule,
  TaskRegistration,
  TaskSpec,
  TaskStrategy,
  TaskUnderstandingResult,
} from "../../runtime/contracts";

export const ONBOARD_EMPLOYEE_FROM_CONTRACT_TASK_ID = "19";
export const ONBOARD_EMPLOYEE_FROM_CONTRACT_TX_TASK_ID = "19";
export const ONBOARD_EMPLOYEE_FROM_CONTRACT_INPUT_SCHEMA_ID = "19.v1";

export interface OnboardEmployeeFromContractInput {
  employeeName: string;
  birthDate: string;
  departmentName: string;
  occupationCodeId: number;
  annualSalaryNok: number;
  percentageOfFullTimeEquivalent: number;
  startDate: string;
  email?: string;
  nationalIdentityNumber?: string;
  bankAccountNumber?: string;
  employmentType?: string;
  employmentForm?: string;
  remunerationType?: string;
  workingHoursScheme?: string;
  standardHoursPerDay?: number;
}

export const task = {
  taskId: ONBOARD_EMPLOYEE_FROM_CONTRACT_TASK_ID,
  txTaskId: ONBOARD_EMPLOYEE_FROM_CONTRACT_TX_TASK_ID,
  taskName: "Onboard employee from contract",
  implementationStatus: "implemented",
  signature:
    "onboardEmployeeFromContract(employeeName, birthDate, departmentName, occupationCodeId, annualSalaryNok, percentageOfFullTimeEquivalent, startDate, email?, nationalIdentityNumber?, bankAccountNumber?, employmentType?, employmentForm?, remunerationType?, workingHoursScheme?, standardHoursPerDay?)",
  summary:
    "Create a new employee from a contract, creating the department if needed and writing nested employment details with the resolved occupation code.",
  inputSchemaId: ONBOARD_EMPLOYEE_FROM_CONTRACT_INPUT_SCHEMA_ID,
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
    "email",
    "nationalIdentityNumber",
    "bankAccountNumber",
    "employmentType",
    "employmentForm",
    "remunerationType",
    "workingHoursScheme",
    "standardHoursPerDay",
  ] as const,
  fieldDescriptions: {
    employeeName:
      "Full employee name exactly as it should be created in Tripletex.",
    birthDate:
      "Employee birth date normalized to ISO YYYY-MM-DD.",
    departmentName:
      "Exact department name from the prompt or attached contract PDF.",
    occupationCodeId:
      "Resolved Tripletex occupation code id. For the exact STYRK-only 2511 contract shape, extract 301.",
    annualSalaryNok:
      "Annual salary in NOK from the contract.",
    percentageOfFullTimeEquivalent:
      "Employment percentage as a whole-number percentage, for example 100 or 80.",
    startDate:
      "Employment start date normalized to ISO YYYY-MM-DD.",
    email:
      "Optional employee email address when the contract provides one.",
    nationalIdentityNumber:
      "Optional Norwegian national identity number from the contract.",
    bankAccountNumber:
      "Optional Norwegian bank account number from the contract.",
    employmentType:
      "Optional explicit Tripletex employmentType when the contract overrides the ordinary default.",
    employmentForm:
      "Optional explicit Tripletex employmentForm when the contract overrides the permanent default.",
    remunerationType:
      "Optional explicit Tripletex remunerationType when the contract overrides the monthly-wage default.",
    workingHoursScheme:
      "Optional explicit Tripletex workingHoursScheme when the contract overrides the normal non-shift default.",
    standardHoursPerDay:
      "Optional employee-specific standard worktime hours per day for POST /employee/standardTime.",
  },
  extractionNotes: [
    "Use the attached employment contract PDF as first-class evidence when the prompt itself is generic.",
    "For the exact STYRK-only 2511 contract branch, extract occupationCodeId=301 directly instead of leaving a raw 2511 group code.",
    "Normalize permanent-employment wording to employmentForm=PERMANENT, monthly-salary wording to remunerationType=MONTHLY_WAGE, and ordinary day-work wording to workingHoursScheme=NOT_SHIFT when the contract does not override them.",
    "Keep percentageOfFullTimeEquivalent as the percentage value itself, not a fractional ratio.",
    "Include nationalIdentityNumber and bankAccountNumber only when the contract explicitly provides them.",
  ] as const,
} satisfies TaskSpec<
  OnboardEmployeeFromContractInput,
  typeof ONBOARD_EMPLOYEE_FROM_CONTRACT_TASK_ID
>;

export type OnboardEmployeeFromContractStrategy = TaskStrategy<
  OnboardEmployeeFromContractInput,
  typeof ONBOARD_EMPLOYEE_FROM_CONTRACT_TASK_ID
>;

export type OnboardEmployeeFromContractTaskModule = TaskModule<
  OnboardEmployeeFromContractInput,
  typeof ONBOARD_EMPLOYEE_FROM_CONTRACT_TASK_ID
>;

export type OnboardEmployeeFromContractTaskUnderstandingResult =
  TaskUnderstandingResult<
    OnboardEmployeeFromContractInput,
    typeof ONBOARD_EMPLOYEE_FROM_CONTRACT_TASK_ID
  >;

export async function loadTaskModule(): Promise<OnboardEmployeeFromContractTaskModule> {
  const { strategy } = await import(
    "./strategies/onboard-employee-from-contract"
  );
  const { strategy: strategyV3 } = await import(
    "./strategies/onboard-employee-from-contract-v3"
  );

  return {
    task,
    strategies: [strategy, strategyV3],
  };
}

export const taskRegistration = {
  task,
  loadTaskModule,
} satisfies TaskRegistration<
  OnboardEmployeeFromContractInput,
  typeof ONBOARD_EMPLOYEE_FROM_CONTRACT_TASK_ID
>;
