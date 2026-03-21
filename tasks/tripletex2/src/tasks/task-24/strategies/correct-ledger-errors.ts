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

const WRONG_ACCOUNT_SOURCE = 7300;
const WRONG_ACCOUNT_TARGET = 7000;
const WRONG_ACCOUNT_AMOUNT = 7800;

const DUPLICATE_ACCOUNT = 6860;
const DUPLICATE_AMOUNT = 3500;

const MISSING_VAT_ACCOUNT = 6500;
const MISSING_VAT_NET_AMOUNT = 18350;
const VAT_ACCOUNT = 2710;
const VAT_RATE_PERCENT = 25;

const WRONG_AMOUNT_ACCOUNT = 7300;
const WRONG_AMOUNT_RECORDED = 15000;
const WRONG_AMOUNT_CORRECT = 10050;

const RELEVANT_ACCOUNT_NUMBERS = [
  WRONG_ACCOUNT_SOURCE,
  WRONG_ACCOUNT_TARGET,
  DUPLICATE_ACCOUNT,
  MISSING_VAT_ACCOUNT,
  VAT_ACCOUNT,
] as const;

const VOUCHER_FIELDS =
  "id,number,date,description,reverseVoucher(id),postings(id,row,date,description,account(id,number),supplier(id),customer(id),employee(id),project(id),product(id),department(id),vatType(id),currency(id),amortizationAccount(id),closeGroup(id),freeAccountingDimension1(id),freeAccountingDimension2(id),freeAccountingDimension3(id),invoiceNumber,termOfPayment,postingRuleId,amount,amountCurrency,amountGross,amountGrossCurrency)";

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
  strategyId: "24.correct-ledger-errors.v1",
  strategyPath: "src/tasks/task-24/strategies/correct-ledger-errors.ts",
  taskId: CORRECT_LEDGER_ERRORS_TASK_ID,
  name: "Correct four known Jan-Feb 2026 ledger errors",
  summary:
    "Loads the relevant ledger accounts, scans Jan-Feb 2026 vouchers for the four known anomalies, then posts one balanced correction voucher with id-based postings.",
  hypothesis:
    "This task family is deterministic because the prompt fixes one date window and four exact error signatures, so a single scan plus one correction voucher is enough.",
  expectedCallProfile: {
    targetCalls: 3,
    maxCalls: 3,
  },
  stepOutline: [
    "API call 1: GET /ledger/account for accounts 7300, 7000, 6860, 6500, and 2710.",
    "API call 2: GET /ledger/voucher for the Jan-Feb 2026 window with posting expansion, then identify the wrong-account, duplicate, missing-VAT, and wrong-amount vouchers.",
    "API call 3: POST /ledger/voucher?sendToLedger=true with one corrective voucher dated 2026-02-28.",
  ],
  status: "active",
  async run(
    ctx: StrategyContext,
    _input: CorrectLedgerErrorsInput,
  ): Promise<StrategyResult> {
    const accountResponse = await ctx.tripletex.get<ListResponse<AccountSummary>>(
      "/ledger/account",
      {
        query: {
          number: RELEVANT_ACCOUNT_NUMBERS.join(","),
          fields: "*",
        },
      },
    );
    const voucherResponse = await ctx.tripletex.get<ListResponse<VoucherSummary>>(
      "/ledger/voucher",
      {
        query: {
          dateFrom: DATE_FROM,
          dateTo: DATE_TO,
          count: 1000,
          sorting: "date",
          fields: VOUCHER_FIELDS,
        },
      },
    );

    const accountsByNumber = mapAccountsByNumber(accountResponse.values ?? []);
    for (const accountNumber of RELEVANT_ACCOUNT_NUMBERS) {
      requireAccount(accountsByNumber, accountNumber);
    }

    const activeVouchers = filterActiveVouchers(voucherResponse.values ?? []);

    const wrongAccountVoucher = pickSingle(
      activeVouchers.filter((voucher) =>
        hasPosting(voucher, WRONG_ACCOUNT_SOURCE, WRONG_ACCOUNT_AMOUNT),
      ),
      "wrong-account voucher",
    );
    const wrongAccountPosting = requirePosting(
      findPosting(wrongAccountVoucher, WRONG_ACCOUNT_SOURCE, WRONG_ACCOUNT_AMOUNT),
      "wrong-account posting",
    );

    const duplicateVoucher = selectDuplicateVoucher(activeVouchers);
    const duplicatePosting = requirePosting(
      findPosting(duplicateVoucher, DUPLICATE_ACCOUNT, DUPLICATE_AMOUNT),
      "duplicate posting",
    );
    const duplicateCounterpart = findCounterpart(
      duplicateVoucher,
      duplicatePosting,
      [DUPLICATE_ACCOUNT],
    );

    const missingVatMatches = activeVouchers.filter(
      (voucher) =>
        hasPosting(voucher, MISSING_VAT_ACCOUNT, MISSING_VAT_NET_AMOUNT) &&
        !hasAccount(voucher, VAT_ACCOUNT),
    );
    const missingVatVoucher =
      missingVatMatches.length > 0
        ? pickSingle(missingVatMatches, "missing-vat voucher")
        : pickSingle(
            activeVouchers.filter((voucher) =>
              hasPosting(voucher, MISSING_VAT_ACCOUNT, MISSING_VAT_NET_AMOUNT),
            ),
            "missing-vat voucher",
          );
    const missingVatPosting = requirePosting(
      findPosting(missingVatVoucher, MISSING_VAT_ACCOUNT, MISSING_VAT_NET_AMOUNT),
      "missing-vat posting",
    );
    const missingVatCounterpart = findCounterpart(
      missingVatVoucher,
      missingVatPosting,
      [MISSING_VAT_ACCOUNT],
    );

    const wrongAmountVoucher = pickSingle(
      activeVouchers.filter((voucher) =>
        hasPosting(voucher, WRONG_AMOUNT_ACCOUNT, WRONG_AMOUNT_RECORDED),
      ),
      "wrong-amount voucher",
    );
    const wrongAmountPosting = requirePosting(
      findPosting(wrongAmountVoucher, WRONG_AMOUNT_ACCOUNT, WRONG_AMOUNT_RECORDED),
      "wrong-amount posting",
    );
    const wrongAmountCounterpart = findCounterpart(
      wrongAmountVoucher,
      wrongAmountPosting,
      [WRONG_AMOUNT_ACCOUNT],
    );

    const missingVatCorrectionAmount =
      signedDirection(missingVatPosting) *
      roundToTwo(MISSING_VAT_NET_AMOUNT * (VAT_RATE_PERCENT / 100));
    const wrongAmountCorrectionAmount =
      -signedDirection(wrongAmountPosting) *
      roundToTwo(WRONG_AMOUNT_RECORDED - WRONG_AMOUNT_CORRECT);

    const correctionResponse = await ctx.tripletex.post<
      ResponseWrapper<VoucherCreateResponse>
    >("/ledger/voucher", {
      query: {
        sendToLedger: true,
      },
      body: {
        date: CORRECTION_DATE,
        description: "Korreksjonsbilag januar-februar 2026",
        postings: [
          buildPostingFromTemplate({
            row: 1,
            date: CORRECTION_DATE,
            description: "Korreksjon: ompostering fra 7300",
            accountId: requireId(
              requireAccount(accountsByNumber, WRONG_ACCOUNT_SOURCE).id,
              "account 7300 id",
            ),
            amount: -signedAmount(wrongAccountPosting),
            template: wrongAccountPosting,
          }),
          buildPostingFromTemplate({
            row: 2,
            date: CORRECTION_DATE,
            description: "Korreksjon: ompostering til 7000",
            accountId: requireId(
              requireAccount(accountsByNumber, WRONG_ACCOUNT_TARGET).id,
              "account 7000 id",
            ),
            amount: signedAmount(wrongAccountPosting),
            template: wrongAccountPosting,
          }),
          buildPostingFromTemplate({
            row: 3,
            date: CORRECTION_DATE,
            description: "Korreksjon: reversering duplikat",
            accountId: requireId(
              requireAccount(accountsByNumber, DUPLICATE_ACCOUNT).id,
              "account 6860 id",
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
          buildPostingFromTemplate({
            row: 5,
            date: CORRECTION_DATE,
            description: "Korreksjon: manglende MVA",
            accountId: requireId(
              requireAccount(accountsByNumber, MISSING_VAT_ACCOUNT).id,
              "account 6500 id",
            ),
            amount: missingVatCorrectionAmount,
            template: missingVatPosting,
            forceVatTypeId: missingVatPosting.vatType?.id ?? 1,
          }),
          buildPostingFromTemplate({
            row: 6,
            date: CORRECTION_DATE,
            description: "Korreksjon: manglende MVA",
            accountId: requireId(
              missingVatCounterpart.account?.id,
              "missing-vat counterpart account id",
            ),
            amount: -missingVatCorrectionAmount,
            template: missingVatCounterpart,
          }),
          buildPostingFromTemplate({
            row: 7,
            date: CORRECTION_DATE,
            description: "Korreksjon: feil beløp 15000 til 10050",
            accountId: requireId(
              requireAccount(accountsByNumber, WRONG_AMOUNT_ACCOUNT).id,
              "account 7300 id",
            ),
            amount: wrongAmountCorrectionAmount,
            template: wrongAmountPosting,
          }),
          buildPostingFromTemplate({
            row: 8,
            date: CORRECTION_DATE,
            description: "Korreksjon: feil beløp 15000 til 10050",
            accountId: requireId(
              wrongAmountCounterpart.account?.id,
              "wrong-amount counterpart account id",
            ),
            amount: -wrongAmountCorrectionAmount,
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
      createdEntityIds: {
        voucherId,
      },
      verification: {
        correctionDate: CORRECTION_DATE,
        correctionVoucherNumber: correctionResponse.value?.number ?? null,
        wrongAccountVoucherId: wrongAccountVoucher.id ?? null,
        duplicateVoucherId: duplicateVoucher.id ?? null,
        missingVatVoucherId: missingVatVoucher.id ?? null,
        wrongAmountVoucherId: wrongAmountVoucher.id ?? null,
        correctionPostingCount: 8,
        missingVatCorrectionAmount: roundToTwo(Math.abs(missingVatCorrectionAmount)),
        wrongAmountCorrectionAmount: roundToTwo(Math.abs(wrongAmountCorrectionAmount)),
      },
    };
  },
} satisfies CorrectLedgerErrorsStrategy;

function mapAccountsByNumber(
  accounts: readonly AccountSummary[],
): Map<number, AccountSummary> {
  const byNumber = new Map<number, AccountSummary>();

  for (const account of accounts) {
    const number = toOptionalNumber(account.number);
    if (number !== undefined) {
      byNumber.set(number, account);
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
): VoucherSummary {
  const candidates = vouchers.filter((voucher) =>
    hasPosting(voucher, DUPLICATE_ACCOUNT, DUPLICATE_AMOUNT),
  );
  const explicitlyNamed = candidates.filter((voucher) =>
    /duplikat|duplicate/i.test(voucher.description ?? ""),
  );
  if (explicitlyNamed.length === 1) {
    return explicitlyNamed[0];
  }

  const grouped = new Map<string, VoucherSummary[]>();
  for (const voucher of candidates) {
    const signature = signatureForVoucher(voucher);
    const existing = grouped.get(signature) ?? [];
    existing.push(voucher);
    grouped.set(signature, existing);
  }

  const duplicateGroup = [...grouped.values()].find((group) => group.length === 2);
  if (!duplicateGroup) {
    throw new Error(
      `Expected one decisive duplicate 6860/${DUPLICATE_AMOUNT} voucher, found ${candidates.length} candidates.`,
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

function pickSingle<TValue>(
  items: readonly TValue[],
  label: string,
): TValue {
  if (items.length !== 1) {
    throw new Error(`Expected exactly one ${label}, found ${items.length}.`);
  }
  return items[0];
}

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

function requirePostings(voucher: VoucherSummary): PostingSummary[] {
  if (!Array.isArray(voucher.postings)) {
    throw new Error(
      `Voucher ${voucher.id ?? "unknown"} did not include postings in the Tripletex response.`,
    );
  }
  return [...voucher.postings];
}

function buildPostingFromTemplate(input: {
  row: number;
  date: string;
  description: string;
  accountId: number;
  amount: number;
  template: PostingSummary;
  forceVatTypeId?: number;
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
    const link = cloneRef(input.template[sourceKey] as IdRef | null | undefined);
    if (link) {
      posting[targetKey] = link;
    }
  }

  const vatTypeId = input.forceVatTypeId ?? input.template.vatType?.id;
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

function cloneRef(value: IdRef | null | undefined): { id: number } | undefined {
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

function requireId(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Tripletex did not return ${label}.`);
  }
  return value;
}
