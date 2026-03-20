import type {
  StrategyContext,
  StrategyResult,
} from "../../../runtime/contracts";
import type { TemplateTaskInput, TemplateTaskStrategy } from "../task";
import { TEMPLATE_TASK_ID } from "../task";

export const strategy = {
  strategyId: "replace-task-id.example-strategy.v1",
  strategyPath: "src/tasks/task-replace/strategies/example-strategy.ts",
  taskId: TEMPLATE_TASK_ID,
  name: "Replace strategy name",
  summary: "Replace this with one concrete solve idea.",
  hypothesis: "Replace this with why the idea may beat alternatives.",
  expectedCallProfile: {
    targetCalls: 2,
    maxCalls: 3,
  },
  stepOutline: [
    "API call 1: Replace with the prerequisite lookup or create.",
    "API call 2: Replace with the scoring write that uses call 1 output.",
  ],
  status: "draft",
  async run(
    _ctx: StrategyContext,
    input: TemplateTaskInput,
  ): Promise<StrategyResult> {
    assertNonEmptyText(input.primaryValue, "primaryValue");

    throw new Error(
      "Replace the template run() body with the concrete task-specific Tripletex call sequence.",
    );
  },
} satisfies TemplateTaskStrategy;

function assertNonEmptyText(value: string, fieldName: string): void {
  if (value.trim().length === 0) {
    throw new Error(`${fieldName} must be a non-empty string.`);
  }
}
