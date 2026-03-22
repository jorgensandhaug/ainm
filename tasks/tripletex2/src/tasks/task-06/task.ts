import type {
  TaskModule,
  TaskRegistration,
  TaskSpec,
  TaskStrategy,
  TaskUnderstandingResult,
} from "../../runtime/contracts";
export const CREATE_EMPLOYEE_TASK_ID = "06";
export const CREATE_EMPLOYEE_TX_TASK_ID = "01";
export const CREATE_EMPLOYEE_INPUT_SCHEMA_ID = "06.v1";
export interface CreateEmployeeInput {
  employeeName: string;
  birthDate: string;
  email: string;
  startDate: string;
  userType?: string;
}
export const task = {
  taskId: CREATE_EMPLOYEE_TASK_ID,
  txTaskId: CREATE_EMPLOYEE_TX_TASK_ID,
  taskName: "Create employee",
  implementationStatus: "implemented",
  signature:
    "createEmployee(employeeName, birthDate, email, startDate, userType?)",
  summary:
    "Create a new employee with identifying details, contact email, and start date.",
  inputSchemaId: CREATE_EMPLOYEE_INPUT_SCHEMA_ID,
  requiredFields: [
    "employeeName",
    "birthDate",
    "email",
    "startDate",
  ] as const,
  optionalFields: [
    "userType",
  ] as const,
  fieldDescriptions: {
    employeeName:
      "Full employee name exactly as it should be created.",
    birthDate:
      "Employee birth date normalized to ISO YYYY-MM-DD.",
    email:
      "Employee email address.",
    startDate:
      "Employment start date normalized to ISO YYYY-MM-DD.",
    userType:
      "Optional explicit Tripletex user type or role if the prompt provides one.",
  },
  extractionNotes: [
    "Normalize mixed-language date expressions into ISO YYYY-MM-DD values.",
    "Preserve Unicode in employee names exactly; do not ASCII-normalize names.",
    "Do not invent department or division fields during extraction.",
  ] as const,
} satisfies TaskSpec<CreateEmployeeInput, typeof CREATE_EMPLOYEE_TASK_ID>;
export type CreateEmployeeStrategy = TaskStrategy<
  CreateEmployeeInput,
  typeof CREATE_EMPLOYEE_TASK_ID
>;
export type CreateEmployeeTaskModule = TaskModule<
  CreateEmployeeInput,
  typeof CREATE_EMPLOYEE_TASK_ID
>;
export type CreateEmployeeTaskUnderstandingResult = TaskUnderstandingResult<
  CreateEmployeeInput,
  typeof CREATE_EMPLOYEE_TASK_ID
>;
export async function loadTaskModule(): Promise<CreateEmployeeTaskModule> {
  const [{ strategy: createEmployee }, { strategy: createEmployeeDirect }] =
    await Promise.all([
      import("./strategies/create-employee"),
      import("./strategies/create-employee-direct"),
    ]);

  return {
    task,
    strategies: [createEmployee, createEmployeeDirect],
  };
}
export const taskRegistration = {
  task,
  loadTaskModule,
} satisfies TaskRegistration<CreateEmployeeInput, typeof CREATE_EMPLOYEE_TASK_ID>;
