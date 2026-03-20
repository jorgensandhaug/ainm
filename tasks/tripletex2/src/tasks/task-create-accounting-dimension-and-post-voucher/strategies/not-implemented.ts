import type {
  StrategyContext,
  StrategyResult,
} from "../../../runtime/contracts";
import type { CreateAccountingDimensionAndPostVoucherInput, CreateAccountingDimensionAndPostVoucherStrategy } from "../task";
import { CREATE_ACCOUNTING_DIMENSION_AND_POST_VOUCHER_TASK_ID } from "../task";

export const strategy = {
  strategyId: "create-accounting-dimension-and-post-voucher.not-implemented.v1",
  strategyPath: "src/tasks/task-create-accounting-dimension-and-post-voucher/strategies/not-implemented.ts",
  taskId: CREATE_ACCOUNTING_DIMENSION_AND_POST_VOUCHER_TASK_ID,
  name: "Not implemented",
  summary:
    "Draft stub strategy for task create-accounting-dimension-and-post-voucher.",
  hypothesis:
    "Keeping a real typed task surface with a loud runtime stub is safer than hiding the task behind a placeholder registration.",
  stepOutline: [
    "Throw an explicit not-yet-implemented error for task create-accounting-dimension-and-post-voucher.",
  ],
  status: "draft",
  async run(
    _ctx: StrategyContext,
    _input: CreateAccountingDimensionAndPostVoucherInput,
  ): Promise<StrategyResult> {
    throw new Error("Strategy not yet implemented for task create-accounting-dimension-and-post-voucher");
  },
} satisfies CreateAccountingDimensionAndPostVoucherStrategy;
