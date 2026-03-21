import type {
  StrategyContext,
  StrategyResult,
} from "../../../runtime/contracts";
import type { RegisterProjectHoursAndCreateProjectInvoiceInput, RegisterProjectHoursAndCreateProjectInvoiceStrategy } from "../task";
import { REGISTER_PROJECT_HOURS_AND_CREATE_PROJECT_INVOICE_TASK_ID } from "../task";

export const strategy = {
  strategyId: "15.not-implemented.v1",
  strategyPath: "src/tasks/task-15/strategies/not-implemented.ts",
  taskId: REGISTER_PROJECT_HOURS_AND_CREATE_PROJECT_INVOICE_TASK_ID,
  name: "Not implemented",
  summary:
    "Draft stub strategy for task 15.",
  hypothesis:
    "Keeping a real typed task surface with a loud runtime stub is safer than hiding the task behind a placeholder registration.",
  stepOutline: [
    "Throw an explicit not-yet-implemented error for task 15.",
  ],
  status: "draft",
  async run(
    _ctx: StrategyContext,
    _input: RegisterProjectHoursAndCreateProjectInvoiceInput,
  ): Promise<StrategyResult> {
    throw new Error("Strategy not yet implemented for task register-project-hours-and-create-project-invoice");
  },
} satisfies RegisterProjectHoursAndCreateProjectInvoiceStrategy;
