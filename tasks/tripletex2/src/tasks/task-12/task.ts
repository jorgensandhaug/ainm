import type {
  TaskModule,
  TaskRegistration,
  TaskSpec,
  TaskStrategy,
  TaskUnderstandingResult,
} from "../../runtime/contracts";
export const RUN_PAYROLL_WITH_BONUS_TASK_ID = "12";
export const RUN_PAYROLL_WITH_BONUS_TX_TASK_ID = "12";
export const RUN_PAYROLL_WITH_BONUS_INPUT_SCHEMA_ID = "12.v1";
export interface RunPayrollWithBonusInput {
  employeeEmail: string;
  payrollMonth: string;
  baseSalaryNok: number;
  bonusAmountNok: number;
  employeeName?: string;
  allowManualVoucherFallback?: boolean;
}
export const task = {
  taskId: RUN_PAYROLL_WITH_BONUS_TASK_ID,
  txTaskId: RUN_PAYROLL_WITH_BONUS_TX_TASK_ID,
  taskName: "Run payroll with bonus",
  implementationStatus: "implemented",
  signature:
    "runPayrollWithBonus(employeeEmail, payrollMonth, baseSalaryNok, bonusAmountNok, employeeName?, allowManualVoucherFallback?)",
  summary:
    "Process payroll for an employee and include a one-time bonus amount.",
  inputSchemaId: RUN_PAYROLL_WITH_BONUS_INPUT_SCHEMA_ID,
  requiredFields: [
    "employeeEmail",
    "payrollMonth",
    "baseSalaryNok",
    "bonusAmountNok",
  ] as const,
  optionalFields: [
    "employeeName",
    "allowManualVoucherFallback",
  ] as const,
  fieldDescriptions: {
    employeeEmail:
      "Email for the existing employee who should receive payroll.",
    payrollMonth:
      "Target payroll period normalized to YYYY-MM.",
    baseSalaryNok:
      "Base salary amount in NOK for that payroll period.",
    bonusAmountNok:
      "One-time bonus amount in NOK to add in the same payroll run.",
    employeeName:
      "Optional employee name kept only as supporting evidence for local matching.",
    allowManualVoucherFallback:
      "Whether the prompt explicitly allows the manual voucher fallback if payroll cannot be completed through salary endpoints.",
  },
  extractionNotes: [
    "Normalize prompts that imply the current run month into an explicit YYYY-MM payrollMonth value.",
    "Treat the bonus as a separate one-off amount rather than folding it into baseSalaryNok.",
    "Only set allowManualVoucherFallback when the prompt explicitly permits a manual voucher fallback.",
  ] as const,
} satisfies TaskSpec<RunPayrollWithBonusInput, typeof RUN_PAYROLL_WITH_BONUS_TASK_ID>;
export type RunPayrollWithBonusStrategy = TaskStrategy<
  RunPayrollWithBonusInput,
  typeof RUN_PAYROLL_WITH_BONUS_TASK_ID
>;
export type RunPayrollWithBonusTaskModule = TaskModule<
  RunPayrollWithBonusInput,
  typeof RUN_PAYROLL_WITH_BONUS_TASK_ID
>;
export type RunPayrollWithBonusTaskUnderstandingResult = TaskUnderstandingResult<
  RunPayrollWithBonusInput,
  typeof RUN_PAYROLL_WITH_BONUS_TASK_ID
>;
export async function loadTaskModule(): Promise<RunPayrollWithBonusTaskModule> {
  const { strategy } = await import("./strategies/not-implemented");
  return {
    task,
    strategies: [strategy],
  };
}
export const taskRegistration = {
  task,
  loadTaskModule,
} satisfies TaskRegistration<RunPayrollWithBonusInput, typeof RUN_PAYROLL_WITH_BONUS_TASK_ID>;