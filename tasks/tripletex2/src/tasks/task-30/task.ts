import type {
  TaskModule,
  TaskRegistration,
  TaskSpec,
  TaskStrategy,
  TaskUnderstandingResult,
} from "../../runtime/contracts";

export const ANNUAL_CLOSING_TASK_ID = "30";
export const ANNUAL_CLOSING_TX_TASK_ID = "30";
export const ANNUAL_CLOSING_INPUT_SCHEMA_ID = "30.v1";

export interface AnnualClosingAsset {
  name: string;
  costNok: number;
  usefulLifeYears: number;
}

export interface AnnualClosingInput {
  year: string;
  assets: AnnualClosingAsset[];
  depreciationCostAccountNumber: number;
  accumulatedDepreciationAccountNumber: number;
  prepaidExpenseAmount: number;
  prepaidExpenseAccountNumber: number;
}

export const task = {
  taskId: ANNUAL_CLOSING_TASK_ID,
  txTaskId: ANNUAL_CLOSING_TX_TASK_ID,
  taskName: "Simplified annual closing (2025)",
  implementationStatus: "implemented",
  signature:
    "simplifiedAnnualClosing(year, assets, depreciationCostAccountNumber, accumulatedDepreciationAccountNumber, prepaidExpenseAmount, prepaidExpenseAccountNumber)",
  summary:
    "Perform the simplified annual closing for a fiscal year: calculate and book annual depreciation for fixed assets (separate voucher each), reverse prepaid expenses, calculate and book tax expense (22% of taxable result), and post result disposition.",
  inputSchemaId: ANNUAL_CLOSING_INPUT_SCHEMA_ID,
  requiredFields: [
    "year",
    "assets",
    "depreciationCostAccountNumber",
    "accumulatedDepreciationAccountNumber",
    "prepaidExpenseAmount",
    "prepaidExpenseAccountNumber",
  ] as const,
  optionalFields: [] as const,
  fieldDescriptions: {
    year: "Fiscal year for the closing (e.g. '2025').",
    assets:
      "Array of fixed assets to depreciate. Each has name, costNok, and usefulLifeYears.",
    depreciationCostAccountNumber:
      "Account number for depreciation expense (e.g. 6010).",
    accumulatedDepreciationAccountNumber:
      "Account number for accumulated depreciation (e.g. 1209).",
    prepaidExpenseAmount:
      "Total prepaid expense reversal amount in NOK (e.g. 45900).",
    prepaidExpenseAccountNumber:
      "Balance sheet account holding prepaid expenses (e.g. 1700). Contra account is resolved by name.",
  },
  extractionNotes: [
    "Extract year, assets, depreciation accounts, and prepaid expense from the prompt.",
    "The prompt may mention tax accounts 8700/2920 — ignore those, the strategy uses 8300/2500.",
    "Asset account numbers in the prompt (e.g. 1200, 1240, 1250) identify the assets but are not used in voucher postings.",
    "Depreciation cost and accumulated depreciation accounts are always the same for all assets.",
  ] as const,
} satisfies TaskSpec<AnnualClosingInput, typeof ANNUAL_CLOSING_TASK_ID>;

export type AnnualClosingStrategy = TaskStrategy<
  AnnualClosingInput,
  typeof ANNUAL_CLOSING_TASK_ID
>;

export type AnnualClosingTaskModule = TaskModule<
  AnnualClosingInput,
  typeof ANNUAL_CLOSING_TASK_ID
>;

export type AnnualClosingTaskUnderstandingResult = TaskUnderstandingResult<
  AnnualClosingInput,
  typeof ANNUAL_CLOSING_TASK_ID
>;

export async function loadTaskModule(): Promise<AnnualClosingTaskModule> {
  const [{ strategy: notImplemented }, { strategy: v1 }, { strategy: v2 }, { strategy: v3 }] =
    await Promise.all([
      import("./strategies/not-implemented"),
      import("./strategies/simplified-annual-closing"),
      import("./strategies/simplified-annual-closing-v2"),
      import("./strategies/simplified-annual-closing-v3"),
    ]);

  return {
    task,
    strategies: [v3, v2, v1, notImplemented],
  };
}

export const taskRegistration = {
  task,
  loadTaskModule,
} satisfies TaskRegistration<
  AnnualClosingInput,
  typeof ANNUAL_CLOSING_TASK_ID
>;
