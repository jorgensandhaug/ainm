import type {
  StrategyContext,
  StrategyResult,
} from "../../../runtime/contracts";
import type { RunPayrollWithBonusInput, RunPayrollWithBonusStrategy } from "../task";
import { RUN_PAYROLL_WITH_BONUS_TASK_ID } from "../task";

export const strategy = {
  strategyId: "12.not-implemented.v1",
  strategyPath: "src/tasks/task-12/strategies/not-implemented.ts",
  taskId: RUN_PAYROLL_WITH_BONUS_TASK_ID,
  name: "Not implemented",
  summary:
    "Draft stub strategy for task 12.",
  hypothesis:
    "Keeping a real typed task surface with a loud runtime stub is safer than hiding the task behind a placeholder registration.",
  stepOutline: [
    "Throw an explicit not-yet-implemented error for task 12.",
  ],
  status: "draft",
  async run(
    _ctx: StrategyContext,
    _input: RunPayrollWithBonusInput,
  ): Promise<StrategyResult> {
    throw new Error("Strategy not yet implemented for task run-payroll-with-bonus");
  },
} satisfies RunPayrollWithBonusStrategy;
