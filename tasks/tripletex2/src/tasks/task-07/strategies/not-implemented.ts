import type {
  StrategyContext,
  StrategyResult,
} from "../../../runtime/contracts";
import type { CreateAccountingDimensionAndPostVoucherInput, CreateAccountingDimensionAndPostVoucherStrategy } from "../task";
import { CREATE_ACCOUNTING_DIMENSION_AND_POST_VOUCHER_TASK_ID } from "../task";

export const strategy = {
  strategyId: "07.not-implemented.v1",
  strategyPath: "src/tasks/task-07/strategies/not-implemented.ts",
  taskId: CREATE_ACCOUNTING_DIMENSION_AND_POST_VOUCHER_TASK_ID,
  name: "Not implemented",
  summary:
    "Draft stub strategy for task 07.",
  hypothesis:
    "Keeping a real typed task surface with a loud runtime stub is safer than hiding the task behind a placeholder registration.",
  stepOutline: [
    "Throw an explicit not-yet-implemented error for task 07.",
  ],
  status: "draft",
  async run(
    _ctx: StrategyContext,
    _input: CreateAccountingDimensionAndPostVoucherInput,
  ): Promise<StrategyResult> {
    throw new Error("Strategy not yet implemented for task create-accounting-dimension-and-post-voucher");
  },
} satisfies CreateAccountingDimensionAndPostVoucherStrategy;
