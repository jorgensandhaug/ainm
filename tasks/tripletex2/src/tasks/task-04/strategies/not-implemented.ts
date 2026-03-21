import type {
  StrategyContext,
  StrategyResult,
} from "../../../runtime/contracts";
import type { CreateProductInput, CreateProductStrategy } from "../task";
import { CREATE_PRODUCT_TASK_ID } from "../task";

export const strategy = {
  strategyId: "04.not-implemented.v1",
  strategyPath: "src/tasks/task-04/strategies/not-implemented.ts",
  taskId: CREATE_PRODUCT_TASK_ID,
  name: "Not implemented",
  summary:
    "Draft stub strategy for task 04.",
  hypothesis:
    "Keeping a real typed task surface with a loud runtime stub is safer than hiding the task behind a placeholder registration.",
  stepOutline: [
    "Throw an explicit not-yet-implemented error for task 04.",
  ],
  status: "draft",
  async run(
    _ctx: StrategyContext,
    _input: CreateProductInput,
  ): Promise<StrategyResult> {
    throw new Error("Strategy not yet implemented for task create-product");
  },
} satisfies CreateProductStrategy;
