import type {
  StrategyContext,
  StrategyResult,
} from "../../../runtime/contracts";
import type {
  CorrectLedgerErrorsInput,
  CorrectLedgerErrorsStrategy,
} from "../task";
import { CORRECT_LEDGER_ERRORS_TASK_ID } from "../task";

const DATE_FROM = "2026-01-01";
const DATE_TO = "2026-03-01";
const CORRECTION_DATE = "2026-02-28";
const VAT_ACCOUNT = 2710;
const VAT_RATE = 0.25;

const VOUCHER_FIELDS =
  "id,number,date,description,reverseVoucher(id),postings(id,row,date,description,account(id,number),supplier(id),customer(id),employee(id),project(id),product(id),department(id),vatType(id),currency(id),amortizationAccount(id),closeGroup(id),freeAccountingDimension1(id),freeAccountingDimension2(id),freeAccountingDimension3(id),invoiceNumber,termOfPayment,postingRuleId,amount,amountCurrency,amountGross,amountGrossCurrency)";

interface PromptParameters {
  wrongAccountSource: number;
  wrongAccountTarget: number;
  wrongAccountAmount: number;
  duplicateAccount: number;
  duplicateAmount: number;
  missingVatAccount: number;
  missingVatNetAmount: number;
  wrongAmountAccount: number;
  wrongAmountRecorded: number;
  wrongAmountCorrect: number;
}

interface IdRef {
  id?: number | null;
  number?: number | string | null;
}

interface PostingSummary {
  id?: number;
  row?: number;
  date?: string | null;
  description?: string | null;
  account?: IdRef | null;
  supplier?: IdRef | null;
  customer?: IdRef | null;
  employee?: IdRef | null;
  project?: IdRef | null;
  product?: IdRef | null;
  department?: IdRef | null;
  vatType?: IdRef | null;
  currency?: IdRef | null;
  amortizationAccount?: IdRef | null;
  closeGroup?: IdRef | null;
  freeAccountingDimension1?: IdRef | null;
  freeAccountingDimension2?: IdRef | null;
  freeAccountingDimension3?: IdRef | null;
  invoiceNumber?: string | null;
  termOfPayment?: string | null;
  postingRuleId?: number | null;
  amount?: number | null;
  amountCurrency?: number | null;
  amountGross?: number | null;
  amountGrossCurrency?: number | null;
}

interface VoucherSummary {
  id?: number;
  number?: number;
  date?: string | null;
  description?: string | null;
  reverseVoucher?: IdRef | null;
  postings?: PostingSummary[] | null;
}

interface AccountSummary extends IdRef {
  id?: number;
}

interface ListResponse<TValue> {
  values?: TValue[];
}

interface ResponseWrapper<TValue> {
  value?: TValue;
}

interface VoucherCreateResponse {
  id?: number;
  number?: number;
}

export const strategy = {
  strategyId: "24.correct-ledger-errors.v3",
  strategyPath: "src/tasks/task-24/strategies/correct-ledger-errors-v3.ts",
  taskId: CORRECT_LEDGER_ERRORS_TASK_ID,
  name: "Dynamic prompt-driven ledger error correction with direct VAT posting",
  summary:
    "Parses the multi-language prompt to extract the four error parameters dynamically, scans Jan-Feb 2026 vouchers, and posts one corrective voucher. Uses direct account-2710 posting for the missing-VAT correction instead of expense-account VAT auto-generation.",
  hypothesis:
    "Extracting parameters from the prompt at runtime fixes the hardcoded-value problem (production never matches), and posting directly to 2710 fixes the VAT auto-split problem (Check 3 always fails). Together these should raise the score from 2.25/6 to 6/6.",
  expectedCallProfile: {
    targetCalls: 3,
    maxCalls: 3,
  },
  stepOutline: [
    "Parse prompt to extract 10 error parameters (accounts and amounts) from any supported language.",
    "API call 1: GET /ledger/account for all unique accounts from prompt plus 2710.",
    "API call 2: GET /ledger/voucher for Jan-Feb 2026 with posting expansion.",
    "API call 3: POST /ledger/voucher?sendToLedger=true with one 8-posting corrective voucher.",
  ],
  status: "draft" as const,

  async run(
    ctx: StrategyContext,
    _input: CorrectLedgerErrorsInput,
  ): Promise<StrategyResult> {
    const prompt = ctx.request?.prompt;
    if (!prompt) {
      throw new Error("No prompt available in strategy context.");
    }

    const params = parsePrompt(prompt);

    const uniqueAccountNumbers = deduplicateNumbers([
      params.wrongAccountSource,
      params.wrongAccountTarget,
      params.duplicateAccount,
      params.missingVatAccount,
      params.wrongAmountAccount,
      VAT_ACCOUNT,
    ]);

    const accountResponse = await ctx.tripletex.get<
      ListResponse<AccountSummary>
    >("/ledger/account", {
      query: {
        number: uniqueAccountNumbers.join(","),
        fields: "*",
      },
    });

    const voucherResponse = await ctx.tripletex.get<
      ListResponse<VoucherSummary>
    >("/ledger/voucher", {
      query: {
        dateFrom: DATE_FROM,
        dateTo: DATE_TO,
        count: 1000,
        sorting: "date",
        fields: VOUCHER_FIELDS,
      },
    });

    const accountsByNumber = mapAccountsByNumber(accountResponse.values ?? []);
    for (const acctNum of uniqueAccountNumbers) {
      requireAccount(accountsByNumber, acctNum);
    }

    const activeVouchers = filterActiveVouchers(voucherResponse.values ?? []);

    // Error 1: Wrong account
    const wrongAccountVoucher = pickSingle(
      activeVouchers.filter((v) =>
        hasPosting(v, params.wrongAccountSource, params.wrongAccountAmount),
      ),
      "wrong-account voucher",
    );
    const wrongAccountPosting = requirePosting(
      findPosting(
        wrongAccountVoucher,
        params.wrongAccountSource,
        params.wrongAccountAmount,
      ),
      "wrong-account posting",
    );

    // Error 2: Duplicate
    const duplicateVoucher = selectDuplicateVoucher(
      activeVouchers,
      params.duplicateAccount,
      params.duplicateAmount,
    );
    const duplicatePosting = requirePosting(
      findPosting(
        duplicateVoucher,
        params.duplicateAccount,
        params.duplicateAmount,
      ),
      "duplicate posting",
    );
    const duplicateCounterpart = findCounterpart(
      duplicateVoucher,
      duplicatePosting,
      [params.duplicateAccount],
    );

    // Error 3: Missing VAT — find voucher WITHOUT a 2710 posting
    const missingVatVoucher = pickSingle(
      activeVouchers.filter(
        (v) =>
          hasPosting(v, params.missingVatAccount, params.missingVatNetAmount) &&
          !hasAccount(v, VAT_ACCOUNT),
      ),
      "missing-vat voucher (without 2710 posting)",
    );
    const missingVatPosting = requirePosting(
      findPosting(
        missingVatVoucher,
        params.missingVatAccount,
        params.missingVatNetAmount,
      ),
      "missing-vat posting",
    );
    const missingVatCounterpart = findCounterpart(
      missingVatVoucher,
      missingVatPosting,
      [params.missingVatAccount],
    );

    // Error 4: Wrong amount
    const wrongAmountVoucher = pickSingle(
      activeVouchers.filter((v) =>
        hasPosting(v, params.wrongAmountAccount, params.wrongAmountRecorded),
      ),
      "wrong-amount voucher",
    );
    const wrongAmountPosting = requirePosting(
      findPosting(
        wrongAmountVoucher,
        params.wrongAmountAccount,
        params.wrongAmountRecorded,
      ),
      "wrong-amount posting",
    );
    const wrongAmountCounterpart = findCounterpart(
      wrongAmountVoucher,
      wrongAmountPosting,
      [params.wrongAmountAccount],
    );

    // Build corrections
    const vatAmount = roundToTwo(params.missingVatNetAmount * VAT_RATE);
    const missingVatSign = signedDirection(missingVatPosting);
    const wrongAmountDelta = roundToTwo(
      params.wrongAmountRecorded - params.wrongAmountCorrect,
    );

    const account2710Id = requireId(
      requireAccount(accountsByNumber, VAT_ACCOUNT).id,
      "account 2710 id",
    );

    const correctionResponse = await ctx.tripletex.post<
      ResponseWrapper<VoucherCreateResponse>
    >("/ledger/voucher", {
      query: { sendToLedger: true },
      body: {
        date: CORRECTION_DATE,
        description: "Korreksjonsbilag januar-februar 2026",
        postings: [
          // Row 1-2: Wrong account reclassification
          buildPostingFromTemplate({
            row: 1,
            date: CORRECTION_DATE,
            description: `Korreksjon: ompostering fra ${params.wrongAccountSource}`,
            accountId: requireId(
              requireAccount(accountsByNumber, params.wrongAccountSource).id,
              `account ${params.wrongAccountSource} id`,
            ),
            amount: -signedAmount(wrongAccountPosting),
            template: wrongAccountPosting,
          }),
          buildPostingFromTemplate({
            row: 2,
            date: CORRECTION_DATE,
            description: `Korreksjon: ompostering til ${params.wrongAccountTarget}`,
            accountId: requireId(
              requireAccount(accountsByNumber, params.wrongAccountTarget).id,
              `account ${params.wrongAccountTarget} id`,
            ),
            amount: signedAmount(wrongAccountPosting),
            template: wrongAccountPosting,
          }),

          // Row 3-4: Duplicate reversal
          buildPostingFromTemplate({
            row: 3,
            date: CORRECTION_DATE,
            description: "Korreksjon: reversering duplikat",
            accountId: requireId(
              requireAccount(accountsByNumber, params.duplicateAccount).id,
              `account ${params.duplicateAccount} id`,
            ),
            amount: -signedAmount(duplicatePosting),
            template: duplicatePosting,
          }),
          buildPostingFromTemplate({
            row: 4,
            date: CORRECTION_DATE,
            description: "Korreksjon: reversering duplikat",
            accountId: requireId(
              duplicateCounterpart.account?.id,
              "duplicate counterpart account id",
            ),
            amount: signedAmount(duplicatePosting),
            template: duplicateCounterpart,
          }),

          // Row 5-6: Missing VAT — direct 2710 posting (no vatType auto-generation)
          buildDirectPosting({
            row: 5,
            date: CORRECTION_DATE,
            description: "Korreksjon: manglende MVA",
            accountId: account2710Id,
            amount: roundToTwo(missingVatSign * vatAmount),
          }),
          buildDirectPosting({
            row: 6,
            date: CORRECTION_DATE,
            description: "Korreksjon: manglende MVA",
            accountId: requireId(
              missingVatCounterpart.account?.id,
              "missing-vat counterpart account id",
            ),
            amount: roundToTwo(-missingVatSign * vatAmount),
            supplierId: missingVatCounterpart.supplier?.id,
          }),

          // Row 7-8: Wrong amount correction
          // vatType is copied from the original posting template. This is deliberate:
          // if the original was booked with vatType=1, the correction must also use
          // vatType=1 so Tripletex auto-splits the net/VAT adjustment correctly.
          // All 5 production runs pass Check 4 with this approach (codex agent does the same).
          // Risk: if the original posting has an unexpected vatType, the correction
          // could mis-split. This has not been observed in production evidence.
          buildPostingFromTemplate({
            row: 7,
            date: CORRECTION_DATE,
            description: `Korreksjon: feil beløp ${params.wrongAmountRecorded} til ${params.wrongAmountCorrect}`,
            accountId: requireId(
              requireAccount(accountsByNumber, params.wrongAmountAccount).id,
              `account ${params.wrongAmountAccount} id`,
            ),
            amount: -signedDirection(wrongAmountPosting) * wrongAmountDelta,
            template: wrongAmountPosting,
          }),
          buildPostingFromTemplate({
            row: 8,
            date: CORRECTION_DATE,
            description: `Korreksjon: feil beløp ${params.wrongAmountRecorded} til ${params.wrongAmountCorrect}`,
            accountId: requireId(
              wrongAmountCounterpart.account?.id,
              "wrong-amount counterpart account id",
            ),
            amount: signedDirection(wrongAmountPosting) * wrongAmountDelta,
            template: wrongAmountCounterpart,
          }),
        ],
      },
    });

    const voucherId = requireId(
      correctionResponse.value?.id,
      "correction voucher id",
    );

    return {
      createdEntityIds: { voucherId },
      verification: {
        correctionDate: CORRECTION_DATE,
        correctionVoucherNumber: correctionResponse.value?.number ?? null,
        wrongAccountVoucherId: wrongAccountVoucher.id ?? null,
        duplicateVoucherId: duplicateVoucher.id ?? null,
        missingVatVoucherId: missingVatVoucher.id ?? null,
        wrongAmountVoucherId: wrongAmountVoucher.id ?? null,
        correctionPostingCount: 8,
        missingVatCorrectionAmount: vatAmount,
        wrongAmountCorrectionDelta: wrongAmountDelta,
        promptParameters: params,
      },
    };
  },
} satisfies CorrectLedgerErrorsStrategy;

// --- Prompt Parsing ---

function parsePrompt(prompt: string): PromptParameters {
  const groups: string[] = [];
  const regex = /\(([^)]+)\)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(prompt)) !== null) {
    groups.push(match[1]);
  }

  if (groups.length < 4) {
    throw new Error(
      `Expected at least 4 parenthesized error groups in prompt, found ${groups.length}.`,
    );
  }

  const g1Nums = extractNumbers(groups[0]);
  const g2Nums = extractNumbers(groups[1]);
  const g3Nums = extractNumbers(groups[2]);
  const g4Nums = extractNumbers(groups[3]);

  if (g1Nums.length < 3) {
    throw new Error(
      `Wrong-account group needs 3 numbers (source, target, amount), found ${g1Nums.length}: "${groups[0]}"`,
    );
  }

  if (g2Nums.length < 2) {
    throw new Error(
      `Duplicate group needs 2 numbers (account, amount), found ${g2Nums.length}: "${groups[1]}"`,
    );
  }

  const g3Without2710 = g3Nums.filter((n) => n !== 2710);
  if (g3Without2710.length < 2) {
    throw new Error(
      `Missing-VAT group needs 2 numbers besides 2710 (account, netAmount), found ${g3Without2710.length}: "${groups[2]}"`,
    );
  }

  if (g4Nums.length < 3) {
    throw new Error(
      `Wrong-amount group needs 3 numbers (account, recorded, correct), found ${g4Nums.length}: "${groups[3]}"`,
    );
  }

  const params: PromptParameters = {
    wrongAccountSource: g1Nums[0],
    wrongAccountTarget: g1Nums[1],
    wrongAccountAmount: g1Nums[2],
    duplicateAccount: g2Nums[0],
    duplicateAmount: g2Nums[1],
    missingVatAccount: g3Without2710[0],
    missingVatNetAmount: g3Without2710[1],
    wrongAmountAccount: g4Nums[0],
    wrongAmountRecorded: g4Nums[1],
    wrongAmountCorrect: g4Nums[2],
  };

  validatePromptParameters(params);
  return params;
}

function validatePromptParameters(params: PromptParameters): void {
  const accountFields: Array<[string, number]> = [
    ["wrongAccountSource", params.wrongAccountSource],
    ["wrongAccountTarget", params.wrongAccountTarget],
    ["duplicateAccount", params.duplicateAccount],
    ["missingVatAccount", params.missingVatAccount],
    ["wrongAmountAccount", params.wrongAmountAccount],
  ];

  for (const [name, value] of accountFields) {
    if (value < 1000 || value > 9999) {
      throw new Error(
        `Parsed ${name}=${value} is outside valid Norwegian account range (1000–9999). Prompt parsing may have extracted a non-account number.`,
      );
    }
  }

  const amountFields: Array<[string, number]> = [
    ["wrongAccountAmount", params.wrongAccountAmount],
    ["duplicateAmount", params.duplicateAmount],
    ["missingVatNetAmount", params.missingVatNetAmount],
    ["wrongAmountRecorded", params.wrongAmountRecorded],
    ["wrongAmountCorrect", params.wrongAmountCorrect],
  ];

  for (const [name, value] of amountFields) {
    if (value <= 0) {
      throw new Error(
        `Parsed ${name}=${value} must be a positive amount. Prompt parsing may have failed.`,
      );
    }
  }

  if (params.wrongAccountSource === params.wrongAccountTarget) {
    throw new Error(
      `wrongAccountSource (${params.wrongAccountSource}) and wrongAccountTarget (${params.wrongAccountTarget}) are identical — no reclassification possible.`,
    );
  }

  if (params.wrongAmountRecorded <= params.wrongAmountCorrect) {
    throw new Error(
      `wrongAmountRecorded (${params.wrongAmountRecorded}) must be greater than wrongAmountCorrect (${params.wrongAmountCorrect}). Prompt says the recorded amount was too high.`,
    );
  }
}

function extractNumbers(text: string): number[] {
  const result: number[] = [];
  const numRegex = /\b(\d+(?:\.\d+)?)\b/g;
  let match: RegExpExecArray | null;
  while ((match = numRegex.exec(text)) !== null) {
    result.push(Number(match[1]));
  }
  return result;
}

// --- Account Helpers ---

function mapAccountsByNumber(
  accounts: readonly AccountSummary[],
): Map<number, AccountSummary> {
  const byNumber = new Map<number, AccountSummary>();
  for (const account of accounts) {
    const num = toOptionalNumber(account.number);
    if (num !== undefined) {
      byNumber.set(num, account);
    }
  }
  return byNumber;
}

function requireAccount(
  accountsByNumber: ReadonlyMap<number, AccountSummary>,
  accountNumber: number,
): AccountSummary {
  const account = accountsByNumber.get(accountNumber);
  if (!account) {
    throw new Error(`Tripletex did not return account ${accountNumber}.`);
  }
  return account;
}

// --- Voucher Filtering ---

function filterActiveVouchers(
  vouchers: readonly VoucherSummary[],
): VoucherSummary[] {
  const reversedVoucherIds = new Set<number>();
  const reversalVoucherIds = new Set<number>();

  for (const voucher of vouchers) {
    if (typeof voucher.reverseVoucher?.id === "number") {
      reversedVoucherIds.add(voucher.reverseVoucher.id);
      if (typeof voucher.id === "number") {
        reversalVoucherIds.add(voucher.id);
      }
    }
  }

  return vouchers.filter(
    (voucher) =>
      typeof voucher.id === "number" &&
      !reversedVoucherIds.has(voucher.id) &&
      !reversalVoucherIds.has(voucher.id),
  );
}

function selectDuplicateVoucher(
  vouchers: readonly VoucherSummary[],
  duplicateAccount: number,
  duplicateAmount: number,
): VoucherSummary {
  const candidates = vouchers.filter((voucher) =>
    hasPosting(voucher, duplicateAccount, duplicateAmount),
  );

  const explicitlyNamed = candidates.filter((voucher) =>
    /duplikat|duplicate/i.test(voucher.description ?? ""),
  );
  if (explicitlyNamed.length === 1) {
    return explicitlyNamed[0];
  }

  const grouped = new Map<string, VoucherSummary[]>();
  for (const voucher of candidates) {
    const sig = signatureForVoucher(voucher);
    const existing = grouped.get(sig) ?? [];
    existing.push(voucher);
    grouped.set(sig, existing);
  }

  const duplicateGroup = [...grouped.values()].find(
    (group) => group.length === 2,
  );
  if (!duplicateGroup) {
    throw new Error(
      `Expected one duplicate voucher pair on account ${duplicateAccount}/${duplicateAmount}, found ${candidates.length} candidates.`,
    );
  }

  return [...duplicateGroup].sort(compareVoucherRecency)[0];
}

function compareVoucherRecency(
  left: VoucherSummary,
  right: VoucherSummary,
): number {
  const leftNumber = left.number ?? 0;
  const rightNumber = right.number ?? 0;
  if (leftNumber !== rightNumber) {
    return rightNumber - leftNumber;
  }
  return requireId(right.id, "voucher id") - requireId(left.id, "voucher id");
}

function signatureForVoucher(voucher: VoucherSummary): string {
  return requirePostings(voucher)
    .map((posting) => ({
      account: accountNumberOf(posting) ?? null,
      amount: signedAmount(posting),
      description: posting.description ?? "",
      supplierId: posting.supplier?.id ?? null,
      customerId: posting.customer?.id ?? null,
      employeeId: posting.employee?.id ?? null,
      projectId: posting.project?.id ?? null,
      departmentId: posting.department?.id ?? null,
      vatTypeId: posting.vatType?.id ?? null,
    }))
    .sort((left, right) =>
      JSON.stringify(left).localeCompare(JSON.stringify(right)),
    )
    .map((entry) => JSON.stringify(entry))
    .join("|");
}

// --- Posting Search ---

function hasAccount(voucher: VoucherSummary, accountNumber: number): boolean {
  return requirePostings(voucher).some(
    (posting) => accountNumberOf(posting) === accountNumber,
  );
}

function hasPosting(
  voucher: VoucherSummary,
  accountNumber: number,
  amountAbs: number,
): boolean {
  return findPosting(voucher, accountNumber, amountAbs) !== undefined;
}

function findPosting(
  voucher: VoucherSummary,
  accountNumber: number,
  amountAbs: number,
): PostingSummary | undefined {
  return requirePostings(voucher).find(
    (posting) =>
      accountNumberOf(posting) === accountNumber &&
      nearlyEqual(Math.abs(signedAmount(posting)), amountAbs),
  );
}

function findCounterpart(
  voucher: VoucherSummary,
  primaryPosting: PostingSummary,
  excludedAccounts: readonly number[],
): PostingSummary {
  const excluded = new Set<number>([...excludedAccounts, VAT_ACCOUNT]);
  const primarySign = signedDirection(primaryPosting);
  const candidates = requirePostings(voucher).filter((posting) => {
    const accountNumber = accountNumberOf(posting);
    return (
      accountNumber !== undefined &&
      !excluded.has(accountNumber) &&
      signedDirection(posting) === -primarySign
    );
  });

  return pickSingle(candidates, "counterpart posting");
}

// --- Posting Building ---

function buildPostingFromTemplate(input: {
  row: number;
  date: string;
  description: string;
  accountId: number;
  amount: number;
  template: PostingSummary;
}): Record<string, unknown> {
  const roundedAmount = roundToTwo(input.amount);
  const posting: Record<string, unknown> = {
    row: input.row,
    date: input.date,
    description: input.description,
    account: { id: input.accountId },
    currency: cloneRef(input.template.currency) ?? { id: 1 },
    amount: roundedAmount,
    amountCurrency: roundedAmount,
    amountGross: roundedAmount,
    amountGrossCurrency: roundedAmount,
  };

  const linkFields: Array<[keyof PostingSummary, string]> = [
    ["supplier", "supplier"],
    ["customer", "customer"],
    ["employee", "employee"],
    ["project", "project"],
    ["product", "product"],
    ["department", "department"],
    ["amortizationAccount", "amortizationAccount"],
    ["closeGroup", "closeGroup"],
    ["freeAccountingDimension1", "freeAccountingDimension1"],
    ["freeAccountingDimension2", "freeAccountingDimension2"],
    ["freeAccountingDimension3", "freeAccountingDimension3"],
  ];

  for (const [sourceKey, targetKey] of linkFields) {
    const link = cloneRef(
      input.template[sourceKey] as IdRef | null | undefined,
    );
    if (link) {
      posting[targetKey] = link;
    }
  }

  const vatTypeId = input.template.vatType?.id;
  if (typeof vatTypeId === "number") {
    posting.vatType = { id: vatTypeId };
  }

  if (input.template.invoiceNumber) {
    posting.invoiceNumber = input.template.invoiceNumber;
  }
  if (input.template.termOfPayment) {
    posting.termOfPayment = input.template.termOfPayment;
  }
  if (typeof input.template.postingRuleId === "number") {
    posting.postingRuleId = input.template.postingRuleId;
  }

  return posting;
}

function buildDirectPosting(input: {
  row: number;
  date: string;
  description: string;
  accountId: number;
  amount: number;
  supplierId?: number | null;
}): Record<string, unknown> {
  const roundedAmount = roundToTwo(input.amount);
  const posting: Record<string, unknown> = {
    row: input.row,
    date: input.date,
    description: input.description,
    account: { id: input.accountId },
    currency: { id: 1 },
    amount: roundedAmount,
    amountCurrency: roundedAmount,
    amountGross: roundedAmount,
    amountGrossCurrency: roundedAmount,
  };

  if (typeof input.supplierId === "number") {
    posting.supplier = { id: input.supplierId };
  }

  return posting;
}

// --- Utilities ---

function cloneRef(
  value: IdRef | null | undefined,
): { id: number } | undefined {
  if (typeof value?.id !== "number") {
    return undefined;
  }
  return { id: value.id };
}

function accountNumberOf(posting: PostingSummary): number | undefined {
  return toOptionalNumber(posting.account?.number);
}

function toOptionalNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function signedAmount(posting: PostingSummary): number {
  return roundToTwo(
    posting.amountGrossCurrency ??
      posting.amountGross ??
      posting.amountCurrency ??
      posting.amount ??
      0,
  );
}

function signedDirection(posting: PostingSummary): number {
  return signedAmount(posting) >= 0 ? 1 : -1;
}

function nearlyEqual(left: number, right: number): boolean {
  return Math.abs(left - right) < 0.005;
}

function roundToTwo(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function requirePosting(
  posting: PostingSummary | undefined,
  label: string,
): PostingSummary {
  if (!posting) {
    throw new Error(`Could not resolve ${label}.`);
  }
  return posting;
}

function requirePostings(voucher: VoucherSummary): PostingSummary[] {
  if (!Array.isArray(voucher.postings)) {
    throw new Error(
      `Voucher ${voucher.id ?? "unknown"} did not include postings in the Tripletex response.`,
    );
  }
  return [...voucher.postings];
}

function requireId(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Tripletex did not return ${label}.`);
  }
  return value;
}

function pickSingle<TValue>(
  items: readonly TValue[],
  label: string,
): TValue {
  if (items.length !== 1) {
    throw new Error(`Expected exactly one ${label}, found ${items.length}.`);
  }
  return items[0];
}

function deduplicateNumbers(numbers: readonly number[]): number[] {
  return [...new Set(numbers)];
}
