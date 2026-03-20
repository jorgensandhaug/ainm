import type {
  StrategyContext,
  StrategyResult,
} from "../../../runtime/contracts";
import type { CreateProjectInput, CreateProjectStrategy } from "../task";
import { CREATE_PROJECT_TASK_ID } from "../task";

export const strategy = {
  strategyId: "create-project.not-implemented.v1",
  strategyPath: "src/tasks/task-create-project/strategies/not-implemented.ts",
  taskId: CREATE_PROJECT_TASK_ID,
  name: "Not implemented",
  summary:
    "Draft stub strategy for task create-project.",
  hypothesis:
    "Keeping a real typed task surface with a loud runtime stub is safer than hiding the task behind a placeholder registration.",
  stepOutline: [
    "Throw an explicit not-yet-implemented error for task create-project.",
  ],
  status: "draft",
  async run(
    _ctx: StrategyContext,
    _input: CreateProjectInput,
  ): Promise<StrategyResult> {
    throw new Error("Strategy not yet implemented for task create-project");
  },
} satisfies CreateProjectStrategy;
