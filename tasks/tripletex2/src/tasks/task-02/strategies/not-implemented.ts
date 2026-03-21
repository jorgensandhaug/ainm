import type {
  StrategyContext,
  StrategyResult,
} from "../../../runtime/contracts";
import type { CreateSupplierInput, CreateSupplierStrategy } from "../task";
import { CREATE_SUPPLIER_TASK_ID } from "../task";

export const strategy = {
  strategyId: "02.not-implemented.v1",
  strategyPath: "src/tasks/task-02/strategies/not-implemented.ts",
  taskId: CREATE_SUPPLIER_TASK_ID,
  name: "Not implemented",
  summary:
    "Draft stub strategy for task 02.",
  hypothesis:
    "Keeping a real typed task surface with a loud runtime stub is safer than hiding the task behind a placeholder registration.",
  stepOutline: [
    "Throw an explicit not-yet-implemented error for task 02.",
  ],
  status: "draft",
  async run(
    _ctx: StrategyContext,
    _input: CreateSupplierInput,
  ): Promise<StrategyResult> {
    throw new Error("Strategy not yet implemented for task create-supplier");
  },
} satisfies CreateSupplierStrategy;
