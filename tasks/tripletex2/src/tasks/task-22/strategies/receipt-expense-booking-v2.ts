import type {
  StrategyContext,
  StrategyResult,
} from "../../../runtime/strategy-types";
import { TripletexHttpError } from "../../../runtime/tripletex-client";
import type {
  RegisterReceiptExpenseVoucherInput,
  RegisterReceiptExpenseVoucherStrategy,
} from "../task";
import { REGISTER_RECEIPT_EXPENSE_VOUCHER_TASK_ID } from "../task";

interface IdRef {
  id?: number | null;
}

interface DepartmentSummary {
  id?: number;
  name?: string;
  isInactive?: boolean;
}

interface AccountSummary {
  id?: number;
  number?: number | string | null;
  name?: string | null;
  displayName?: string | null;
  isBankAccount?: boolean | null;
  vatLocked?: boolean | null;
  vatType?: {
    id?: number | null;
    percentage?: number | null;
  } | null;
}

interface VatTypeSummary {
  id?: number;
  number?: string | number | null;
  percentage?: number | null;
  deductionPercentage?: number | null;
}

interface VoucherPostingSummary {
  row?: number;
  account?: {
    id?: number | null;
    number?: number | string | null;
  } | null;
  department?: IdRef | null;
  vatType?: IdRef | null;
  amount?: number | null;
  amountGross?: number | null;
}

interface VoucherSummary {
  id?: number;
  number?: number | string | null;
  attachment?: IdRef | null;
  postings?: VoucherPostingSummary[];
}

interface ListResponse<TValue> {
  values?: TValue[];
}

interface ResponseWrapper<TValue> {
  value?: TValue;
}

const BANK_ACCOUNT_NUMBER = 1920;
const DEFAULT_EXPENSE_ACCOUNT_CANDIDATES = [
  6540,
  6860,
  7100,
  7130,
  7140,
  7141,
  7149,
  7150,
  7160,
  7170,
  7320,
  7330,
  7350,
  7360,
] as const;
const DEFAULT_TRAVEL_ACCOUNT_PRIORITY = [
  7140,
  7130,
  7141,
  7149,
  7150,
  7160,
  7170,
  7100,
  7320,
  7330,
] as const;

export const strategy = {
  strategyId: "22.receipt-expense-booking.v2",
  strategyPath: "src/tasks/task-22/strategies/receipt-expense-booking-v2.ts",
  taskId: REGISTER_RECEIPT_EXPENSE_VOUCHER_TASK_ID,
  name: "Receipt expense booking with NET-to-GROSS conversion",
  summary:
    "v2: Treats input grossAmountNok as the receipt line price (NET before VAT), infers the category-specific VAT rate, converts NET to GROSS, and posts the voucher with the computed GROSS amount. Fixes Check 3 for transport receipts where the receipt line price is NET and the VAT rate is 12%.",
  hypothesis:
    "The Check 3 failure is caused by the v1 strategy passing the LLM-extracted amount directly as amountGross. Receipt line prices on Norwegian synthetic receipts are NET. The strategy must convert NET to GROSS using the item-specific statutory VAT rate (12% for transport, 25% for general goods, 0% for non-deductible representation).",
  expectedCallProfile: {
    targetCalls: 5,
    maxCalls: 6,
  },
  stepOutline: [
    "Department branch: POST /department or GET /department for lookup.",
    "GET /ledger/account for bank account 1920 plus expense account candidates.",
    "Optional: GET /ledger/vatType when the chosen expense account is not VAT-locked.",
    "Convert receipt line price (NET) to GROSS using the determined VAT rate.",
    "POST /ledger/voucher?sendToLedger=true with computed GROSS amounts.",
    "POST /ledger/voucher/{voucherId}/attachment with the receipt PDF.",
  ],
  status: "draft",
  async run(
    ctx: StrategyContext,
    input: RegisterReceiptExpenseVoucherInput,
  ): Promise<StrategyResult> {
    assertNonEmptyText(input.departmentName, "departmentName");
    assertNonEmptyText(input.lineDescription, "lineDescription");
    assertNonEmptyText(input.attachmentFileName, "attachmentFileName");
    assertPositiveAmount(input.grossAmountNok, "grossAmountNok");
    assertIsoDate(input.voucherDate, "voucherDate");

    const voucherDate = input.voucherDate;
    const receiptLinePrice = input.grossAmountNok;
    const attachment = requirePdfAttachment(ctx, input.attachmentFileName);
    const evidenceText = buildEvidenceText(ctx, input, attachment.textContent);
    const department = input.departmentAlreadyExists
      ? await findExistingDepartmentByExactName(ctx, input.departmentName)
      : await createOrResolveDepartment(ctx, input.departmentName);
    const departmentId = requireId(department.id, "department id");

    const requestedAccountNumbers = uniqueAccountNumbers([
      BANK_ACCOUNT_NUMBER,
      input.expenseAccountNumber,
      ...DEFAULT_EXPENSE_ACCOUNT_CANDIDATES,
    ]);
    const accountResponse = await ctx.tripletex.get<ListResponse<AccountSummary>>(
      "/ledger/account",
      {
        query: {
          number: requestedAccountNumbers.join(","),
          fields: "*",
        },
      },
    );
    const accounts = accountResponse.values ?? [];
    const bankAccount = pickExactAccount(
      accounts,
      BANK_ACCOUNT_NUMBER,
      "bank account",
    );
    const expenseAccount =
      input.expenseAccountNumber !== undefined
        ? pickExactAccount(
            accounts,
            input.expenseAccountNumber,
            "expense account",
          )
        : chooseExpenseAccount(accounts, evidenceText);

    const bankAccountId = requireId(bankAccount.id, "bank account id");
    const expenseAccountId = requireId(
      expenseAccount.id,
      "expense account id",
    );
    const expenseAccountNumber = requireAccountNumber(
      expenseAccount,
      "expense account number",
    );

    // Determine the effective VAT rate and optional VAT type override.
    // The VAT rate is used both for the voucher posting AND for converting
    // the receipt line price (NET) to GROSS.
    let selectedVatTypeId: number | undefined;
    let effectiveVatRatePercent: number;
    if (expenseAccount.vatLocked) {
      // VAT-locked accounts use their default rate.
      // For non-deductible accounts (e.g., 7360 representation), rate is 0%.
      effectiveVatRatePercent = Number(expenseAccount.vatType?.percentage ?? 0);
    } else {
      const preferredVatRatePercent =
        input.vatRatePercent ?? inferVatRatePercent(evidenceText);
      const vatTypeResponse = await ctx.tripletex.get<ListResponse<VatTypeSummary>>(
        "/ledger/vatType",
        {
          query: {
            typeOfVat: "INCOMING",
            vatDate: voucherDate,
            fields: "*",
          },
        },
      );
      const vatType = chooseIncomingVatType(
        vatTypeResponse.values ?? [],
        preferredVatRatePercent,
      );
      selectedVatTypeId = requireId(vatType.id, "incoming VAT type id");
      effectiveVatRatePercent = requireNumber(
        vatType.percentage,
        "incoming VAT percentage",
      );
    }

    // Convert receipt line price (NET) to GROSS using the effective VAT rate.
    // Norwegian synthetic receipt line prices are NET (before VAT).
    // GROSS = NET * (1 + vatRate/100).
    // For 12% transport: 8750 * 1.12 = 9800.
    // For 25% general:   1000 * 1.25 = 1250.
    // For 0% non-deductible: amount unchanged.
    const grossAmount = roundToTwo(receiptLinePrice * (1 + effectiveVatRatePercent / 100));

    const voucherResponse = await ctx.tripletex.post<ResponseWrapper<VoucherSummary>>(
      "/ledger/voucher?sendToLedger=true",
      {
        body: {
          date: voucherDate,
          description: input.lineDescription,
          voucherType: null,
          postings: [
            {
              row: 1,
              date: voucherDate,
              description: input.lineDescription,
              account: { id: expenseAccountId },
              department: { id: departmentId },
              ...(selectedVatTypeId
                ? { vatType: { id: selectedVatTypeId } }
                : {}),
              amountGross: grossAmount,
              amountGrossCurrency: grossAmount,
            },
            {
              row: 2,
              date: voucherDate,
              description: input.lineDescription,
              account: { id: bankAccountId },
              amountGross: -grossAmount,
              amountGrossCurrency: -grossAmount,
            },
          ],
        },
      },
    );
    const voucher = requireResponseValue(voucherResponse, "voucher");
    const voucherId = requireId(voucher.id, "voucher id");
    const expensePosting = verifyVoucherWrite({
      voucher,
      voucherId,
      expenseAccountId,
      bankAccountId,
      departmentId,
      grossAmount,
    });

    const attachmentForm = new FormData();
    attachmentForm.append(
      "file",
      new Blob([attachment.bytes], { type: attachment.mediaType }),
      attachment.uploadFileName,
    );
    const attachmentResponse = await ctx.tripletex.post<
      ResponseWrapper<VoucherSummary>
    >(`/ledger/voucher/${voucherId}/attachment`, {
      rawBody: attachmentForm,
    });
    const attachedVoucher = requireResponseValue(
      attachmentResponse,
      "attached voucher",
    );
    verifyAttachmentUpload(attachedVoucher, voucherId);

    const notes: string[] = [];
    if (!input.departmentAlreadyExists && department.created) {
      notes.push(
        `Department ${JSON.stringify(input.departmentName)} was created in this run.`,
      );
    }
    notes.push(
      `NET-to-GROSS conversion: ${receiptLinePrice} * (1 + ${effectiveVatRatePercent}/100) = ${grossAmount}`,
    );

    return {
      createdEntityIds: {
        departmentId,
        voucherId,
        ...(typeof attachedVoucher.attachment?.id === "number"
          ? { attachmentId: attachedVoucher.attachment.id }
          : {}),
      },
      notes,
      verification: {
        departmentName: input.departmentName,
        departmentCreated: department.created,
        voucherDate,
        receiptLinePrice,
        grossAmount,
        expenseAccountNumber,
        expenseAccountId,
        bankAccountNumber: BANK_ACCOUNT_NUMBER,
        bankAccountId,
        vatLocked: expenseAccount.vatLocked ?? false,
        vatRatePercent: effectiveVatRatePercent,
        vatTypeId:
          selectedVatTypeId ??
          expensePosting.vatType?.id ??
          expenseAccount.vatType?.id ??
          null,
        voucherNumber: voucher.number ?? null,
        attachmentUploaded: true,
        attachmentId: attachedVoucher.attachment?.id ?? null,
        expensePosting: {
          row: expensePosting.row ?? null,
          departmentId: expensePosting.department?.id ?? null,
          amount: expensePosting.amount ?? null,
          amountGross: expensePosting.amountGross ?? null,
          vatTypeId: expensePosting.vatType?.id ?? null,
        },
      },
    };
  },
} satisfies RegisterReceiptExpenseVoucherStrategy;

async function createOrResolveDepartment(
  ctx: StrategyContext,
  departmentName: string,
): Promise<DepartmentSummary & { created: boolean }> {
  try {
    const createResponse = await ctx.tripletex.post<ResponseWrapper<DepartmentSummary>>(
      "/department",
      {
        body: {
          name: departmentName,
        },
      },
    );
    const createdDepartment = requireResponseValue(
      createResponse,
      "department",
    );
    if (createdDepartment.name !== departmentName) {
      throw new Error(
        `Tripletex returned department name ${JSON.stringify(createdDepartment.name)} instead of ${JSON.stringify(departmentName)}.`,
      );
    }

    return {
      ...createdDepartment,
      created: true,
    };
  } catch (error) {
    if (!isDepartmentConflict(error)) {
      throw error;
    }
  }

  const existingDepartment = await findExistingDepartmentByExactName(
    ctx,
    departmentName,
  );
  return {
    ...existingDepartment,
    created: false,
  };
}

async function findExistingDepartmentByExactName(
  ctx: StrategyContext,
  departmentName: string,
): Promise<DepartmentSummary & { created: boolean }> {
  const departmentResponse = await ctx.tripletex.get<ListResponse<DepartmentSummary>>(
    "/department",
    {
      query: {
        name: departmentName,
        isInactive: false,
        fields: "*",
      },
    },
  );
  const exactMatch = (departmentResponse.values ?? []).find(
    (department) =>
      department.name === departmentName && department.isInactive !== true,
  );

  if (!exactMatch?.id) {
    throw new Error(
      `Expected an exact active department named ${JSON.stringify(departmentName)}, but Tripletex did not return one.`,
    );
  }

  return {
    ...exactMatch,
    created: false,
  };
}

function chooseExpenseAccount(
  accounts: readonly AccountSummary[],
  evidenceText: string,
): AccountSummary {
  const expenseAccounts = accounts.filter(
    (account) => requireOptionalAccountNumber(account) !== BANK_ACCOUNT_NUMBER,
  );
  if (expenseAccounts.length === 0) {
    throw new Error(
      "Tripletex did not return any usable expense account candidates for task 22.",
    );
  }

  const normalizedEvidence = normalizeText(evidenceText);
  const byNumber = new Map(
    expenseAccounts.map((account) => [
      requireAccountNumber(account, "expense account candidate number"),
      account,
    ]),
  );

  if (looksLikeRepresentation(normalizedEvidence)) {
    const exactRepresentation =
      byNumber.get(7360) ??
      [...expenseAccounts]
        .sort((left, right) => {
          const leftScore = representationScore(left, normalizedEvidence);
          const rightScore = representationScore(right, normalizedEvidence);
          if (leftScore === rightScore) {
            return (
              requireAccountNumber(left, "expense account number") -
              requireAccountNumber(right, "expense account number")
            );
          }
          return rightScore - leftScore;
        })[0];
    if (!exactRepresentation) {
      throw new Error("No suitable representation expense account found.");
    }
    return exactRepresentation;
  }

  if (looksLikeMeetingExpense(normalizedEvidence)) {
    const meetingAccount = byNumber.get(6860);
    if (meetingAccount) {
      return meetingAccount;
    }
  }

  if (looksLikeTravel(normalizedEvidence)) {
    for (const accountNumber of DEFAULT_TRAVEL_ACCOUNT_PRIORITY) {
      const account = byNumber.get(accountNumber);
      if (account) {
        return account;
      }
    }
  }

  const rankedAccounts = [...expenseAccounts].sort((left, right) => {
    const leftScore = genericAccountScore(left, normalizedEvidence);
    const rightScore = genericAccountScore(right, normalizedEvidence);
    if (leftScore === rightScore) {
      return (
        requireAccountNumber(left, "expense account number") -
        requireAccountNumber(right, "expense account number")
      );
    }
    return rightScore - leftScore;
  });
  const bestAccount = rankedAccounts[0];

  if (!bestAccount) {
    throw new Error("No suitable expense account found.");
  }

  return bestAccount;
}

function chooseIncomingVatType(
  vatTypes: readonly VatTypeSummary[],
  preferredRatePercent: number,
): VatTypeSummary {
  const deductible = vatTypes.filter(
    (vatType) => Number(vatType.deductionPercentage ?? 100) === 100,
  );
  if (deductible.length === 0) {
    throw new Error(
      "Tripletex did not return any fully deductible incoming VAT types.",
    );
  }

  const orderedPreferences = uniqueNumbers([
    preferredRatePercent,
    preferredRatePercent === 12 ? 25 : 12,
    25,
    12,
    0,
  ]);
  for (const percentage of orderedPreferences) {
    const exactMatch = [...deductible]
      .filter((vatType) => Number(vatType.percentage) === percentage)
      .sort((left, right) =>
        String(left.number ?? "").localeCompare(String(right.number ?? "")),
      )[0];
    if (exactMatch) {
      return exactMatch;
    }
  }

  return [...deductible].sort((left, right) =>
    String(left.number ?? "").localeCompare(String(right.number ?? "")),
  )[0]!;
}

function inferVatRatePercent(evidenceText: string): number {
  const normalizedEvidence = normalizeText(evidenceText);

  // Category-specific rates take priority over receipt text.
  // Receipt "MVA 25%" is a blended summary across all items;
  // individual items have statutory rates (12% for transport).
  if (looksLikeTravel(normalizedEvidence)) {
    return 12;
  }

  if (looksLikeMeetingExpense(normalizedEvidence)) {
    return 25;
  }

  const percentageMatches = [
    ...normalizedEvidence.matchAll(/\b(0|12|15|25)(?:[.,]0+)?\s*%/g),
  ]
    .map((match) => Number(match[1]))
    .filter((value) => Number.isFinite(value));
  if (percentageMatches.length > 0) {
    return percentageMatches[0]!;
  }

  return 25;
}

function verifyVoucherWrite(input: {
  voucher: VoucherSummary;
  voucherId: number;
  expenseAccountId: number;
  bankAccountId: number;
  departmentId: number;
  grossAmount: number;
}): VoucherPostingSummary {
  const expensePosting = input.voucher.postings?.find(
    (posting) => posting.account?.id === input.expenseAccountId,
  );
  const bankPosting = input.voucher.postings?.find(
    (posting) => posting.account?.id === input.bankAccountId,
  );

  if (
    input.voucher.id !== input.voucherId ||
    !expensePosting ||
    !bankPosting ||
    expensePosting.department?.id !== input.departmentId ||
    roundToTwo(expensePosting.amountGross ?? NaN) !== input.grossAmount ||
    roundToTwo(bankPosting.amountGross ?? NaN) !== -input.grossAmount
  ) {
    throw new Error(
      "Tripletex voucher write response did not prove the expected receipt expense voucher postings.",
    );
  }

  return expensePosting;
}

function verifyAttachmentUpload(
  voucher: VoucherSummary,
  voucherId: number,
): void {
  if (voucher.id !== voucherId) {
    throw new Error(
      "Tripletex attachment upload response did not confirm the intended voucher.",
    );
  }
}

function requirePdfAttachment(
  ctx: StrategyContext,
  attachmentFileName: string,
): {
  bytes: Uint8Array;
  mediaType: string;
  textContent?: string;
  uploadFileName: string;
} {
  const requestFiles = ctx.request?.files ?? [];
  const matches = requestFiles.filter(
    (file) => file.fileName === attachmentFileName,
  );

  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one request attachment named "${attachmentFileName}", but found ${matches.length}.`,
    );
  }

  const attachment = matches[0];
  if (!attachment.contentBase64) {
    throw new Error(
      `Request attachment "${attachmentFileName}" did not include raw content needed for voucher upload.`,
    );
  }

  const mediaType = attachment.mediaType ?? "application/pdf";
  if (mediaType !== "application/pdf") {
    throw new Error(
      `Expected attachment "${attachmentFileName}" to be application/pdf, got "${mediaType}".`,
    );
  }

  return {
    bytes: Buffer.from(attachment.contentBase64, "base64"),
    mediaType,
    textContent: attachment.textContent,
    uploadFileName: basenameLike(attachment.fileName),
  };
}

function buildEvidenceText(
  ctx: StrategyContext,
  input: RegisterReceiptExpenseVoucherInput,
  attachmentText?: string,
): string {
  return [
    input.lineDescription,
    input.departmentName,
    ctx.request?.prompt ?? "",
    attachmentText,
  ]
    .filter((value) => value.trim().length > 0)
    .join("\n");
}

function pickExactAccount(
  accounts: readonly AccountSummary[],
  accountNumber: number,
  label: string,
): AccountSummary {
  const match = accounts.find(
    (account) => requireOptionalAccountNumber(account) === accountNumber,
  );
  if (!match?.id) {
    throw new Error(
      `Expected ${label} ${accountNumber}, but Tripletex did not return it.`,
    );
  }
  return match;
}

function requireResponseValue<TValue>(
  response: ResponseWrapper<TValue>,
  label: string,
): TValue {
  if (!response.value) {
    throw new Error(`Tripletex did not return the expected ${label}.`);
  }
  return response.value;
}

function requireAccountNumber(
  account: AccountSummary,
  label: string,
): number {
  const number = requireOptionalAccountNumber(account);
  if (number === undefined) {
    throw new Error(`Missing ${label}.`);
  }
  return number;
}

function requireOptionalAccountNumber(
  account: AccountSummary,
): number | undefined {
  if (account.number === undefined || account.number === null) {
    return undefined;
  }
  const numeric = Number(account.number);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function representationScore(
  account: AccountSummary,
  normalizedEvidence: string,
): number {
  const accountNumber = requireAccountNumber(account, "expense account number");
  const name = normalizeText(account.displayName ?? account.name ?? "");
  let score = baseAccountScore(account, normalizedEvidence);

  if (accountNumber === 7360) {
    score += 120;
  } else if (accountNumber === 7350) {
    score += 70;
  }

  if (name.includes("representasjon")) {
    score += 40;
  }
  if (name.includes("ikke fradrags")) {
    score += 20;
  }
  if (name.includes("fradragsberettiget")) {
    score -= 10;
  }

  return score;
}

function genericAccountScore(
  account: AccountSummary,
  normalizedEvidence: string,
): number {
  const accountNumber = requireAccountNumber(account, "expense account number");
  const name = normalizeText(account.displayName ?? account.name ?? "");
  let score = baseAccountScore(account, normalizedEvidence);

  if (looksLikeTravel(normalizedEvidence)) {
    score += numberWeight(
      accountNumber,
      DEFAULT_TRAVEL_ACCOUNT_PRIORITY,
      100,
      6,
    );
    if (/(reisekost|reise)/.test(name)) {
      score += 30;
    }
    if (/(transport|tog|jernbane|billett)/.test(name)) {
      score += 20;
    }
    if (/representasjon/.test(name)) {
      score -= 50;
    }
  } else {
    score += numberWeight(
      accountNumber,
      DEFAULT_TRAVEL_ACCOUNT_PRIORITY,
      25,
      1,
    );
  }

  return score;
}

function baseAccountScore(
  account: AccountSummary,
  normalizedEvidence: string,
): number {
  const name = normalizeText(account.displayName ?? account.name ?? "");
  return wordOverlapScore(name, normalizedEvidence);
}

function wordOverlapScore(
  accountName: string,
  normalizedEvidence: string,
): number {
  const accountTokens = new Set(tokenize(accountName));
  let score = 0;
  for (const token of tokenize(normalizedEvidence)) {
    if (accountTokens.has(token)) {
      score += 5;
    }
  }
  return score;
}

function tokenize(text: string): string[] {
  return text
    .split(/[^a-z0-9]+/g)
    .map((token) => token.trim())
    .filter((token) => token.length >= 4);
}

function numberWeight(
  accountNumber: number,
  orderedNumbers: readonly number[],
  base: number,
  step: number,
): number {
  const index = orderedNumbers.indexOf(accountNumber);
  return index === -1 ? 0 : base - index * step;
}

function looksLikeTravel(normalizedEvidence: string): boolean {
  return /(tog|billett|reise|reisekost|transport|jernbane|fly|buss|taxi)/.test(
    normalizedEvidence,
  );
}

function looksLikeMeetingExpense(normalizedEvidence: string): boolean {
  return /(kaffemote|kaffemate|coffee.?meeting|intern.?mote|kurs|seminar)/.test(
    normalizedEvidence,
  );
}

function looksLikeRepresentation(normalizedEvidence: string): boolean {
  // Kaffemote is a meeting expense (6860), NOT representation (7360).
  if (looksLikeMeetingExpense(normalizedEvidence)) {
    return false;
  }
  return /(forretningslunsj|representasjon|restaurant|middag|lunsj|bedriftskort)/.test(
    normalizedEvidence,
  );
}

function normalizeText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

function uniqueAccountNumbers(values: readonly (number | undefined)[]): number[] {
  const seen = new Set<number>();
  const result: number[] = [];
  for (const value of values) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      continue;
    }
    if (!seen.has(value)) {
      seen.add(value);
      result.push(value);
    }
  }
  return result;
}

function uniqueNumbers(values: readonly (number | undefined)[]): number[] {
  return uniqueAccountNumbers(values);
}

function basenameLike(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const segments = normalized.split("/");
  return segments[segments.length - 1] || normalized;
}

function isDepartmentConflict(error: unknown): error is TripletexHttpError {
  if (!(error instanceof Error)) {
    return false;
  }

  const tripletexError = error as TripletexHttpError;
  if (tripletexError.path !== "/department") {
    return false;
  }

  if (tripletexError.status === 409) {
    return true;
  }

  return (
    tripletexError.status === 422 &&
    /already exists|eksisterer allerede|duplicate/i.test(tripletexError.message)
  );
}

function requireId(value: unknown, label: string): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new Error(`Missing ${label}.`);
  }
  return numeric;
}

function requireNumber(value: unknown, label: string): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    throw new Error(`Missing ${label}.`);
  }
  return numeric;
}

function roundToTwo(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function assertNonEmptyText(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
}

function assertPositiveAmount(
  value: unknown,
  label: string,
): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive number.`);
  }
}

function assertIsoDate(value: unknown, label: string): asserts value is string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    Number.isNaN(Date.parse(`${value}T00:00:00Z`))
  ) {
    throw new Error(`${label} must be an ISO YYYY-MM-DD date string.`);
  }
}
