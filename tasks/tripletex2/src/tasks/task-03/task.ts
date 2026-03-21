import type {
  TaskModule,
  TaskRegistration,
  TaskSpec,
  TaskStrategy,
  TaskUnderstandingResult,
} from "../../runtime/contracts";
export const CREATE_DEPARTMENT_TASK_ID = "03";
export const CREATE_DEPARTMENT_TX_TASK_ID = "03";
export const CREATE_DEPARTMENT_INPUT_SCHEMA_ID = "03.v1";
export interface CreateDepartmentInput {
  departmentNames: string[];
}
export const task = {
  taskId: CREATE_DEPARTMENT_TASK_ID,
  txTaskId: CREATE_DEPARTMENT_TX_TASK_ID,
  taskName: "Create department",
  implementationStatus: "implemented",
  signature:
    "createDepartment(departmentNames)",
  summary:
    "Create one or more new departments with the requested names.",
  inputSchemaId: CREATE_DEPARTMENT_INPUT_SCHEMA_ID,
  requiredFields: [
    "departmentNames",
  ] as const,
  fieldDescriptions: {
    departmentNames:
      "Department names to create, in prompt order.",
  },
  extractionNotes: [
    "Normalize single-department prompts into a one-element departmentNames array.",
    "Preserve department names exactly, including Unicode letters such as O-slash.",
    "Do not invent department numbers or manager assignments for this create-only task.",
  ] as const,
} satisfies TaskSpec<CreateDepartmentInput, typeof CREATE_DEPARTMENT_TASK_ID>;
export type CreateDepartmentStrategy = TaskStrategy<
  CreateDepartmentInput,
  typeof CREATE_DEPARTMENT_TASK_ID
>;
export type CreateDepartmentTaskModule = TaskModule<
  CreateDepartmentInput,
  typeof CREATE_DEPARTMENT_TASK_ID
>;
export type CreateDepartmentTaskUnderstandingResult = TaskUnderstandingResult<
  CreateDepartmentInput,
  typeof CREATE_DEPARTMENT_TASK_ID
>;
export async function loadTaskModule(): Promise<CreateDepartmentTaskModule> {
  const { strategy } = await import("./strategies/direct-create-departments");
  return {
    task,
    strategies: [strategy],
  };
}
export const taskRegistration = {
  task,
  loadTaskModule,
} satisfies TaskRegistration<CreateDepartmentInput, typeof CREATE_DEPARTMENT_TASK_ID>;
