import type {
  TaskModule,
  TaskRegistration,
  TaskSpec,
  TaskStrategy,
  TaskUnderstandingResult,
} from "../../runtime/contracts";
export const CREATE_ACCOUNTING_DIMENSION_AND_POST_VOUCHER_TASK_ID = "07";
export const CREATE_ACCOUNTING_DIMENSION_AND_POST_VOUCHER_TX_TASK_ID = "17";
export const CREATE_ACCOUNTING_DIMENSION_AND_POST_VOUCHER_INPUT_SCHEMA_ID = "07.v1";
export interface CreateAccountingDimensionAndPostVoucherInput {
  dimensionName: string;
  dimensionValueNames: string[];
  postingDimensionValueName: string;
  postingAccountNumber: number;
  amountNok: number;
  voucherDate?: string;
  balancingAccountNumber?: number;
}
export const task = {
  taskId: CREATE_ACCOUNTING_DIMENSION_AND_POST_VOUCHER_TASK_ID,
  txTaskId: CREATE_ACCOUNTING_DIMENSION_AND_POST_VOUCHER_TX_TASK_ID,
  taskName: "Create accounting dimension and post voucher",
  implementationStatus: "implemented",
  signature:
    "createAccountingDimensionAndPostVoucher(dimensionName, dimensionValueNames, postingDimensionValueName, postingAccountNumber, amountNok, voucherDate?, balancingAccountNumber?)",
  summary:
    "Create a custom accounting dimension with values, then post a voucher linked to one value.",
  inputSchemaId: CREATE_ACCOUNTING_DIMENSION_AND_POST_VOUCHER_INPUT_SCHEMA_ID,
  requiredFields: [
    "dimensionName",
    "dimensionValueNames",
    "postingDimensionValueName",
    "postingAccountNumber",
    "amountNok",
  ] as const,
  optionalFields: [
    "voucherDate",
    "balancingAccountNumber",
  ] as const,
  fieldDescriptions: {
    dimensionName:
      "Name of the free accounting dimension to create.",
    dimensionValueNames:
      "Names of the new dimension values to create, in prompt order.",
    postingDimensionValueName:
      "The one created dimension value that the scored voucher posting should reference.",
    postingAccountNumber:
      "Ledger account number for the scored voucher posting.",
    amountNok:
      "Voucher posting amount in NOK.",
    voucherDate:
      "Optional voucher date in ISO YYYY-MM-DD format. If omitted, runtime can use the run date.",
    balancingAccountNumber:
      "Optional balancing ledger account number. If omitted, the strategy can fall back to 1920 per the trusted standard.",
  },
  extractionNotes: [
    "Keep dimension and dimension value names exactly as written in the prompt.",
    "Normalize account numbers into numeric values before runtime.",
    "If the prompt omits a balancing account, leave balancingAccountNumber unset instead of inventing one during extraction.",
  ] as const,
} satisfies TaskSpec<CreateAccountingDimensionAndPostVoucherInput, typeof CREATE_ACCOUNTING_DIMENSION_AND_POST_VOUCHER_TASK_ID>;
export type CreateAccountingDimensionAndPostVoucherStrategy = TaskStrategy<
  CreateAccountingDimensionAndPostVoucherInput,
  typeof CREATE_ACCOUNTING_DIMENSION_AND_POST_VOUCHER_TASK_ID
>;
export type CreateAccountingDimensionAndPostVoucherTaskModule = TaskModule<
  CreateAccountingDimensionAndPostVoucherInput,
  typeof CREATE_ACCOUNTING_DIMENSION_AND_POST_VOUCHER_TASK_ID
>;
export type CreateAccountingDimensionAndPostVoucherTaskUnderstandingResult = TaskUnderstandingResult<
  CreateAccountingDimensionAndPostVoucherInput,
  typeof CREATE_ACCOUNTING_DIMENSION_AND_POST_VOUCHER_TASK_ID
>;
export async function loadTaskModule(): Promise<CreateAccountingDimensionAndPostVoucherTaskModule> {
  const { strategy } = await import("./strategies/create-dimension-and-post-voucher");
  return {
    task,
    strategies: [strategy],
  };
}
export const taskRegistration = {
  task,
  loadTaskModule,
} satisfies TaskRegistration<CreateAccountingDimensionAndPostVoucherInput, typeof CREATE_ACCOUNTING_DIMENSION_AND_POST_VOUCHER_TASK_ID>;
