import { createNotImplementedStrategy } from "../../shared/not-implemented";
import type { OnboardEmployeeOfferLetterStrategy } from "../task";
import { ONBOARD_EMPLOYEE_OFFER_LETTER_TASK_ID } from "../task";

export const strategy = createNotImplementedStrategy({
  taskId: ONBOARD_EMPLOYEE_OFFER_LETTER_TASK_ID,
  strategyPath: "src/tasks/task-21/strategies/not-implemented.ts",
}) satisfies OnboardEmployeeOfferLetterStrategy;
