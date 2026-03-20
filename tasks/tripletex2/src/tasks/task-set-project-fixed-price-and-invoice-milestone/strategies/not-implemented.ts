import type {
  StrategyContext,
  StrategyResult,
} from "../../../runtime/contracts";
import type { SetProjectFixedPriceAndInvoiceMilestoneInput, SetProjectFixedPriceAndInvoiceMilestoneStrategy } from "../task";
import { SET_PROJECT_FIXED_PRICE_AND_INVOICE_MILESTONE_TASK_ID } from "../task";

export const strategy = {
  strategyId: "set-project-fixed-price-and-invoice-milestone.not-implemented.v1",
  strategyPath: "src/tasks/task-set-project-fixed-price-and-invoice-milestone/strategies/not-implemented.ts",
  taskId: SET_PROJECT_FIXED_PRICE_AND_INVOICE_MILESTONE_TASK_ID,
  name: "Not implemented",
  summary:
    "Draft stub strategy for task set-project-fixed-price-and-invoice-milestone.",
  hypothesis:
    "Keeping a real typed task surface with a loud runtime stub is safer than hiding the task behind a placeholder registration.",
  stepOutline: [
    "Throw an explicit not-yet-implemented error for task set-project-fixed-price-and-invoice-milestone.",
  ],
  status: "draft",
  async run(
    _ctx: StrategyContext,
    _input: SetProjectFixedPriceAndInvoiceMilestoneInput,
  ): Promise<StrategyResult> {
    throw new Error("Strategy not yet implemented for task set-project-fixed-price-and-invoice-milestone");
  },
} satisfies SetProjectFixedPriceAndInvoiceMilestoneStrategy;
