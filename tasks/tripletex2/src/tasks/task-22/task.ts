import type {
  TaskModule,
  TaskRegistration,
  TaskSpec,
  TaskStrategy,
  TaskUnderstandingResult,
} from "../../runtime/contracts";

export const REGISTER_RECEIPT_EXPENSE_VOUCHER_TASK_ID = "22";
export const REGISTER_RECEIPT_EXPENSE_VOUCHER_TX_TASK_ID = "22";
export const REGISTER_RECEIPT_EXPENSE_VOUCHER_INPUT_SCHEMA_ID = "22.v1";

export interface RegisterReceiptExpenseVoucherInput {
  departmentName: string;
  lineDescription: string;
  grossAmountNok: number;
  voucherDate: string;
  attachmentFileName: string;
  expenseAccountNumber?: number;
  vatRatePercent?: number;
  departmentAlreadyExists?: boolean;
}

export const task = {
  taskId: REGISTER_RECEIPT_EXPENSE_VOUCHER_TASK_ID,
  txTaskId: REGISTER_RECEIPT_EXPENSE_VOUCHER_TX_TASK_ID,
  taskName: "Register receipt expense voucher",
  implementationStatus: "implemented",
  signature:
    "registerReceiptExpenseVoucher(departmentName, lineDescription, grossAmountNok, voucherDate, attachmentFileName, expenseAccountNumber?, vatRatePercent?, departmentAlreadyExists?)",
  summary:
    "Book one receipt-backed expense voucher to the requested department, balance it against bank account 1920, and upload the source receipt.",
  inputSchemaId: REGISTER_RECEIPT_EXPENSE_VOUCHER_INPUT_SCHEMA_ID,
  requiredFields: [
    "departmentName",
    "lineDescription",
    "grossAmountNok",
    "voucherDate",
    "attachmentFileName",
  ] as const,
  optionalFields: [
    "expenseAccountNumber",
    "vatRatePercent",
    "departmentAlreadyExists",
  ] as const,
  fieldDescriptions: {
    departmentName:
      "Exact department name that should own the expense posting.",
    lineDescription:
      "Exact receipt line or purchase description that should be booked.",
    grossAmountNok:
      "Receipt line amount in NOK as printed on the receipt. Do not add or remove VAT — the strategy computes the correct VAT-inclusive gross from the expense category's statutory rate.",
    voucherDate:
      "Receipt purchase date normalized to ISO YYYY-MM-DD and used as the voucher date.",
    attachmentFileName:
      "Exact request attachment filename for the receipt PDF that must be uploaded to the final voucher.",
    expenseAccountNumber:
      "Optional explicit expense ledger account number when the prompt or receipt already makes the account choice unambiguous.",
    vatRatePercent:
      "Optional explicit VAT percentage when the prompt or receipt already gives the intended incoming VAT treatment.",
    departmentAlreadyExists:
      "Whether the prompt explicitly says the target department already exists and runtime should prefer an exact lookup-first branch.",
  },
  extractionNotes: [
    "Use the attached receipt PDF as first-class evidence to extract the booked line description, receipt line amount, receipt date, and exact attachment filename.",
    "Extract the selected receipt line amount exactly as printed on the receipt, not the whole receipt total. Do NOT add VAT or multiply by any rate — pass the receipt line price as-is. The runtime strategy handles VAT conversion.",
    "Normalize the receipt date to ISO YYYY-MM-DD and preserve the department name and booked line text exactly.",
    "Only set expenseAccountNumber or vatRatePercent when the prompt or receipt makes them explicit; otherwise leave account and VAT selection to the deterministic runtime strategy.",
    "Receipt line prices on Norwegian receipts are NET (before VAT) when the receipt shows 'herav MVA' and total × 0.25 equals the stated MVA. Pass the receipt line price exactly as printed — do not multiply by any VAT factor. The strategy converts to the correct gross using the statutory VAT rate for the expense category.",
    "Only set departmentAlreadyExists when the prompt explicitly says the department already exists or clearly implies a retry against existing state.",
  ] as const,
} satisfies TaskSpec<
  RegisterReceiptExpenseVoucherInput,
  typeof REGISTER_RECEIPT_EXPENSE_VOUCHER_TASK_ID
>;

export type RegisterReceiptExpenseVoucherStrategy = TaskStrategy<
  RegisterReceiptExpenseVoucherInput,
  typeof REGISTER_RECEIPT_EXPENSE_VOUCHER_TASK_ID
>;

export type RegisterReceiptExpenseVoucherTaskModule = TaskModule<
  RegisterReceiptExpenseVoucherInput,
  typeof REGISTER_RECEIPT_EXPENSE_VOUCHER_TASK_ID
>;

export type RegisterReceiptExpenseVoucherTaskUnderstandingResult =
  TaskUnderstandingResult<
    RegisterReceiptExpenseVoucherInput,
    typeof REGISTER_RECEIPT_EXPENSE_VOUCHER_TASK_ID
  >;

export async function loadTaskModule(): Promise<RegisterReceiptExpenseVoucherTaskModule> {
  const { strategy } = await import(
    "./strategies/receipt-expense-booking"
  );
  const { strategy: strategyV2 } = await import(
    "./strategies/receipt-expense-booking-v2"
  );

  return {
    task,
    strategies: [strategy, strategyV2],
  };
}

export const taskRegistration = {
  task,
  loadTaskModule,
} satisfies TaskRegistration<
  RegisterReceiptExpenseVoucherInput,
  typeof REGISTER_RECEIPT_EXPENSE_VOUCHER_TASK_ID
>;
