import type {
  StrategyContext,
  StrategyResult,
} from "../../../runtime/contracts";
import type { SetProjectFixedPriceAndInvoiceMilestoneInput, SetProjectFixedPriceAndInvoiceMilestoneStrategy } from "../task";
import { SET_PROJECT_FIXED_PRICE_AND_INVOICE_MILESTONE_TASK_ID } from "../task";

export const strategy = {
  strategyId: "14.not-implemented.v1",
  strategyPath: "src/tasks/task-14/strategies/not-implemented.ts",
  taskId: SET_PROJECT_FIXED_PRICE_AND_INVOICE_MILESTONE_TASK_ID,
  name: "Not implemented",
  summary:
    "Draft stub strategy for task 14.",
  hypothesis:
    "Keeping a real typed task surface with a loud runtime stub is safer than hiding the task behind a placeholder registration.",
  stepOutline: [
    "Throw an explicit not-yet-implemented error for task 14.",
  ],
  status: "draft",
  async run(
    _ctx: StrategyContext,
    _input: SetProjectFixedPriceAndInvoiceMilestoneInput,
  ): Promise<StrategyResult> {
    throw new Error("Strategy not yet implemented for task set-project-fixed-price-and-invoice-milestone");
  },
} satisfies SetProjectFixedPriceAndInvoiceMilestoneStrategy;
