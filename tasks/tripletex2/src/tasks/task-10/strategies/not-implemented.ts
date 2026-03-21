import type {
  StrategyContext,
  StrategyResult,
} from "../../../runtime/contracts";
import type { IssueFullCreditNoteInput, IssueFullCreditNoteStrategy } from "../task";
import { ISSUE_FULL_CREDIT_NOTE_TASK_ID } from "../task";

export const strategy = {
  strategyId: "10.not-implemented.v1",
  strategyPath: "src/tasks/task-10/strategies/not-implemented.ts",
  taskId: ISSUE_FULL_CREDIT_NOTE_TASK_ID,
  name: "Not implemented",
  summary:
    "Draft stub strategy for task 10.",
  hypothesis:
    "Keeping a real typed task surface with a loud runtime stub is safer than hiding the task behind a placeholder registration.",
  stepOutline: [
    "Throw an explicit not-yet-implemented error for task 10.",
  ],
  status: "draft",
  async run(
    _ctx: StrategyContext,
    _input: IssueFullCreditNoteInput,
  ): Promise<StrategyResult> {
    throw new Error("Strategy not yet implemented for task issue-full-credit-note");
  },
} satisfies IssueFullCreditNoteStrategy;
