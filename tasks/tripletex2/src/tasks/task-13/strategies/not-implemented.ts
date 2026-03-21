import type {
  StrategyContext,
  StrategyResult,
} from "../../../runtime/contracts";
import type { RegisterTravelExpenseInput, RegisterTravelExpenseStrategy } from "../task";
import { REGISTER_TRAVEL_EXPENSE_TASK_ID } from "../task";

export const strategy = {
  strategyId: "13.not-implemented.v1",
  strategyPath: "src/tasks/task-13/strategies/not-implemented.ts",
  taskId: REGISTER_TRAVEL_EXPENSE_TASK_ID,
  name: "Not implemented",
  summary:
    "Draft stub strategy for task 13.",
  hypothesis:
    "Keeping a real typed task surface with a loud runtime stub is safer than hiding the task behind a placeholder registration.",
  stepOutline: [
    "Throw an explicit not-yet-implemented error for task 13.",
  ],
  status: "draft",
  async run(
    _ctx: StrategyContext,
    _input: RegisterTravelExpenseInput,
  ): Promise<StrategyResult> {
    throw new Error("Strategy not yet implemented for task register-travel-expense");
  },
} satisfies RegisterTravelExpenseStrategy;
