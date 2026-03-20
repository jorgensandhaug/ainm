import type {
  StrategyContext,
  StrategyResult,
} from "../../../runtime/contracts";
import type { CreateCustomerInput, CreateCustomerStrategy } from "../task";
import { CREATE_CUSTOMER_TASK_ID } from "../task";

export const strategy = {
  strategyId: "create-customer.not-implemented.v1",
  strategyPath: "src/tasks/task-create-customer/strategies/not-implemented.ts",
  taskId: CREATE_CUSTOMER_TASK_ID,
  name: "Not implemented",
  summary:
    "Draft stub strategy for task create-customer.",
  hypothesis:
    "Keeping a real typed task surface with a loud runtime stub is safer than hiding the task behind a placeholder registration.",
  stepOutline: [
    "Throw an explicit not-yet-implemented error for task create-customer.",
  ],
  status: "draft",
  async run(
    _ctx: StrategyContext,
    _input: CreateCustomerInput,
  ): Promise<StrategyResult> {
    throw new Error("Strategy not yet implemented for task create-customer");
  },
} satisfies CreateCustomerStrategy;
