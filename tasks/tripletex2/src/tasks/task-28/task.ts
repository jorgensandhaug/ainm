import type {
  TaskModule,
  TaskRegistration,
  TaskSpec,
  TaskStrategy,
  TaskUnderstandingResult,
} from "../../runtime/contracts";

export const ANALYZE_EXPENSE_INCREASE_CREATE_INTERNAL_PROJECTS_TASK_ID = "28";
export const ANALYZE_EXPENSE_INCREASE_CREATE_INTERNAL_PROJECTS_TX_TASK_ID = "28";
export const ANALYZE_EXPENSE_INCREASE_CREATE_INTERNAL_PROJECTS_INPUT_SCHEMA_ID =
  "28.v1";

export interface AnalyzeExpenseIncreaseCreateInternalProjectsInput {}

export const task = {
  taskId: ANALYZE_EXPENSE_INCREASE_CREATE_INTERNAL_PROJECTS_TASK_ID,
  txTaskId: ANALYZE_EXPENSE_INCREASE_CREATE_INTERNAL_PROJECTS_TX_TASK_ID,
  taskName: "Analyze expense increase and create internal projects",
  implementationStatus: "implemented",
  signature: "analyzeExpenseIncreaseCreateInternalProjects()",
  summary:
    "Analyze January-versus-February 2026 ledger expenses, select the three expense accounts with the largest increase, and create one internal project plus one activity for each selected account.",
  inputSchemaId:
    ANALYZE_EXPENSE_INCREASE_CREATE_INTERNAL_PROJECTS_INPUT_SCHEMA_ID,
  requiredFields: [] as const,
  extractionNotes: [
    "This task family has no free-form extracted inputs; the scored workflow is the fixed January-versus-February 2026 expense-account analysis.",
    "Do not invent alternate month windows, manager identities, or customer linkage for this exact task shape.",
    "The deterministic runtime must create exactly three internal projects and one non-chargeable project-specific activity per selected account.",
  ] as const,
} satisfies TaskSpec<
  AnalyzeExpenseIncreaseCreateInternalProjectsInput,
  typeof ANALYZE_EXPENSE_INCREASE_CREATE_INTERNAL_PROJECTS_TASK_ID
>;

export type AnalyzeExpenseIncreaseCreateInternalProjectsStrategy = TaskStrategy<
  AnalyzeExpenseIncreaseCreateInternalProjectsInput,
  typeof ANALYZE_EXPENSE_INCREASE_CREATE_INTERNAL_PROJECTS_TASK_ID
>;

export type AnalyzeExpenseIncreaseCreateInternalProjectsTaskModule = TaskModule<
  AnalyzeExpenseIncreaseCreateInternalProjectsInput,
  typeof ANALYZE_EXPENSE_INCREASE_CREATE_INTERNAL_PROJECTS_TASK_ID
>;

export type AnalyzeExpenseIncreaseCreateInternalProjectsTaskUnderstandingResult =
  TaskUnderstandingResult<
    AnalyzeExpenseIncreaseCreateInternalProjectsInput,
    typeof ANALYZE_EXPENSE_INCREASE_CREATE_INTERNAL_PROJECTS_TASK_ID
  >;

export async function loadTaskModule(): Promise<AnalyzeExpenseIncreaseCreateInternalProjectsTaskModule> {
  const { strategy } = await import("./strategies/cost-analysis-projects");

  return {
    task,
    strategies: [strategy],
  };
}

export const taskRegistration = {
  task,
  loadTaskModule,
} satisfies TaskRegistration<
  AnalyzeExpenseIncreaseCreateInternalProjectsInput,
  typeof ANALYZE_EXPENSE_INCREASE_CREATE_INTERNAL_PROJECTS_TASK_ID
>;
