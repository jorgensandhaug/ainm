import type {
  TaskModule,
  TaskRegistration,
  TaskSpec,
  TaskStrategy,
  TaskUnderstandingResult,
} from "../../runtime/contracts";

export const TEMPLATE_TASK_ID = "replace-task-id";
export const TEMPLATE_TX_TASK_ID = "00";
export const TEMPLATE_INPUT_SCHEMA_ID = "replace-task-id.v1";

export interface TemplateTaskInput {
  primaryValue: string;
  optionalValue?: string;
}

export const task = {
  taskId: TEMPLATE_TASK_ID,
  txTaskId: TEMPLATE_TX_TASK_ID,
  taskName: "Replace task name",
  signature: "replaceTask(primaryValue, optionalValue?)",
  summary: "Replace this with a one-sentence task summary.",
  inputSchemaId: TEMPLATE_INPUT_SCHEMA_ID,
  requiredFields: ["primaryValue"] as const,
  optionalFields: ["optionalValue"] as const,
  fieldDescriptions: {
    primaryValue: "Required typed value the extractor must produce.",
    optionalValue: "Optional typed value if the prompt includes it.",
  },
  extractionNotes: [
    "The extractor should emit typed values only, not a plan.",
  ] as const,
} satisfies TaskSpec<TemplateTaskInput, typeof TEMPLATE_TASK_ID>;

export type TemplateTaskStrategy = TaskStrategy<
  TemplateTaskInput,
  typeof TEMPLATE_TASK_ID
>;

export type TemplateTaskModule = TaskModule<
  TemplateTaskInput,
  typeof TEMPLATE_TASK_ID
>;

export type TemplateTaskUnderstandingResult = TaskUnderstandingResult<
  TemplateTaskInput,
  typeof TEMPLATE_TASK_ID
>;

export async function loadTaskModule(): Promise<TemplateTaskModule> {
  const { strategy } = await import("./strategies/example-strategy");

  return {
    task,
    strategies: [strategy],
  };
}

export const taskRegistration = {
  task,
  loadTaskModule,
} satisfies TaskRegistration<TemplateTaskInput, typeof TEMPLATE_TASK_ID>;
