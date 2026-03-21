import type {
  TaskModule,
  TaskRegistration,
  TaskSpec,
  TaskStrategy,
  TaskUnderstandingResult,
} from "../../runtime/contracts";
export const CREATE_PROJECT_TASK_ID = "05";
export const CREATE_PROJECT_TX_TASK_ID = "05";
export const CREATE_PROJECT_INPUT_SCHEMA_ID = "05.v1";
export interface CreateProjectInput {
  projectName: string;
  customerOrganizationNumber: string;
  projectManagerEmail: string;
  startDate?: string;
  customerName?: string;
  projectManagerName?: string;
}
export const task = {
  taskId: CREATE_PROJECT_TASK_ID,
  txTaskId: CREATE_PROJECT_TX_TASK_ID,
  taskName: "Create project",
  implementationStatus: "implemented",
  signature:
    "createProject(projectName, customerOrganizationNumber, projectManagerEmail, startDate?, customerName?, projectManagerName?)",
  summary:
    "Create a project for an existing customer and assign a project manager.",
  inputSchemaId: CREATE_PROJECT_INPUT_SCHEMA_ID,
  requiredFields: [
    "projectName",
    "customerOrganizationNumber",
    "projectManagerEmail",
  ] as const,
  optionalFields: [
    "startDate",
    "customerName",
    "projectManagerName",
  ] as const,
  fieldDescriptions: {
    projectName:
      "Name of the project to create.",
    customerOrganizationNumber:
      "Organization number for the existing customer that should own the project.",
    projectManagerEmail:
      "Email for the assignable project manager.",
    startDate:
      "Optional project start date in ISO YYYY-MM-DD format. If omitted, runtime defaults to the run date.",
    customerName:
      "Optional customer name used only as a local tie-breaker if customer lookup is ambiguous.",
    projectManagerName:
      "Optional manager name used only as a local tie-breaker if the employee lookup is ambiguous.",
  },
  extractionNotes: [
    "Always extract projectManagerEmail exactly; the employee lookup is email-driven.",
    "If the prompt omits startDate, leave it unset instead of inventing one in extraction.",
    "Keep customerName and projectManagerName only when the prompt provides them explicitly.",
  ] as const,
} satisfies TaskSpec<CreateProjectInput, typeof CREATE_PROJECT_TASK_ID>;
export type CreateProjectStrategy = TaskStrategy<
  CreateProjectInput,
  typeof CREATE_PROJECT_TASK_ID
>;
export type CreateProjectTaskModule = TaskModule<
  CreateProjectInput,
  typeof CREATE_PROJECT_TASK_ID
>;
export type CreateProjectTaskUnderstandingResult = TaskUnderstandingResult<
  CreateProjectInput,
  typeof CREATE_PROJECT_TASK_ID
>;
export async function loadTaskModule(): Promise<CreateProjectTaskModule> {
  const { strategy } = await import("./strategies/create-project");
  return {
    task,
    strategies: [strategy],
  };
}
export const taskRegistration = {
  task,
  loadTaskModule,
} satisfies TaskRegistration<CreateProjectInput, typeof CREATE_PROJECT_TASK_ID>;
