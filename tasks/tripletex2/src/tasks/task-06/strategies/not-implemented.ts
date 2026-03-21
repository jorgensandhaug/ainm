import type {
  StrategyContext,
  StrategyResult,
} from "../../../runtime/contracts";
import type { CreateEmployeeInput, CreateEmployeeStrategy } from "../task";
import { CREATE_EMPLOYEE_TASK_ID } from "../task";

export const strategy = {
  strategyId: "06.not-implemented.v1",
  strategyPath: "src/tasks/task-06/strategies/not-implemented.ts",
  taskId: CREATE_EMPLOYEE_TASK_ID,
  name: "Not implemented",
  summary:
    "Draft stub strategy for task 06.",
  hypothesis:
    "Keeping a real typed task surface with a loud runtime stub is safer than hiding the task behind a placeholder registration.",
  stepOutline: [
    "Throw an explicit not-yet-implemented error for task 06.",
  ],
  status: "draft",
  async run(
    _ctx: StrategyContext,
    _input: CreateEmployeeInput,
  ): Promise<StrategyResult> {
    throw new Error("Strategy not yet implemented for task create-employee");
  },
} satisfies CreateEmployeeStrategy;
