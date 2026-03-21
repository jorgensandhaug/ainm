import type {
  StrategyContext,
  StrategyResult,
  TripletexClient,
} from "../../../runtime/contracts";
import type {
  CorrectLedgerErrorsInput,
  CorrectLedgerErrorsStrategy,
} from "../task";
import { CORRECT_LEDGER_ERRORS_TASK_ID } from "../task";

interface ListResponse<TValue> {
  values?: TValue[];
}

interface ResponseWrapper<TValue> {
  value?: TValue;
}

interface RefEntity {
  id?: number | null;
  number?: number | string | null;
  name?: string | null;
}

interface VoucherSummary {
  id?: number;
  version?: number | null;
  number?: number | null;
  date?: string | null;
  description?: string | null;
  reverseVoucher?: RefEntity | null;
  postings?: PostingSummary[] | null;
}

interface PostingSummary {
  id?: number | null;
  date?: string | null;
  row?: number | null;
  description?: string | null;
  account?: RefEntity | null;
  supplier?: RefEntity | null;
  customer?: RefEntity | null;
  employee?: RefEntity | null;
  project?: RefEntity | null;
  product?: RefEntity | null;
  department?: RefEntity | null;
  vatType?: RefEntity | null;
  currency?: RefEntity | null;
  amortizationAccount?: RefEntity | null;
  closeGroup?: RefEntity | null;
  freeAccountingDimension1?: RefEntity | null;
  freeAccountingDimension2?: RefEntity | null;
  freeAccountingDimension3?: RefEntity | null;
  invoiceNumber?: string | null;
  termOfPayment?: string | null;
  postingRuleId?: number | null;
  amount?: number | null;
  amountCurrency?: number | null;
  amountGross?: number | null;
  amountGrossCurrency?: number | null;
}

interface AccountSummary extends RefEntity {
  id?: number;
  number?: number | string | null;
}

interface AnalysisResult {
  wrongAccountVoucher: VoucherSummary;
  duplicateVoucherToReverse: VoucherSummary;
  missingVatVoucher: VoucherSummary;
  wrongAmountVoucher: VoucherSummary;
  account2710: AccountSummary;
  account7140: AccountSummary;
}

type CompletedStrategyResult = StrategyResult & {
  status: "completed";
};

type StrategyApiClient = Pick<TripletexClient, "get" | "post" | "put">;

const DATE_FROM = "2026-01-01";
const DATE_TO = "2026-03-01";
const WRONG_ACCOUNT_FROM = 7100;
const WRONG_ACCOUNT_TO = 7140;
const WRONG_ACCOUNT_AMOUNT = 2250;
const DUPLICATE_ACCOUNT = 6500;
const DUPLICATE_AMOUNT = 1500;
const MISSING_VAT_ACCOUNT = 6540;
const MISSING_VAT_AMOUNT_EX_VAT = 22000;
const MISSING_VAT_TARGET_ACCOUNT = 2710;
const MISSING_VAT_AMOUNT = 5500;
const WRONG_AMOUNT_ACCOUNT = 6860;
const WRONG_AMOUNT_BOOKED = 8650;
const WRONG_AMOUNT_CORRECT = 7900;
const WRONG_AMOUNT_DELTA = WRONG_AMOUNT_BOOKED - WRONG_AMOUNT_CORRECT;

export const strategy = {
  strategyId: "21.correct-ledger-errors.v1",
  strategyPath: "src/tasks/task-21/strategies/correct-ledger-errors.ts",
  taskId: CORRECT_LEDGER_ERRORS_TASK_ID,
  name: "Correct deterministic Jan-Feb 2026 ledger errors",
  summary:
    "Scans Jan-Feb 2026 vouchers for the four prompt-defined ledger mistakes and applies the matching correction entries.",
  hypothesis:
    "A single decisive voucher scan plus one account lookup is enough to identify the four prompt-defined defects and post the exact repairs in six calls.",
  expectedCallProfile: {
    targetCalls: 6,
    maxCalls: 6,
  },
  stepOutline: [
    "API call 1: GET /ledger/voucher for Jan-Feb 2026 with expanded postings and reverseVoucher data.",
    "API call 2: GET /ledger/account for accounts 2710 and 7140.",
    "API call 3: POST /ledger/voucher to reclassify 2250 NOK from 7100 to 7140.",
    "API call 4: PUT /ledger/voucher/{duplicateVoucherId}/:reverse on the duplicate 6500 voucher.",
    "API call 5: POST /ledger/voucher to add the missing 2710 VAT line for the 6540 voucher.",
    "API call 6: POST /ledger/voucher to correct the 6860 amount difference from 8650 to 7900.",
  ],
  status: "active",
  async run(
    ctx: StrategyContext,
    _input: CorrectLedgerErrorsInput,
  ): Promise<StrategyResult> {
    const api = resolveApiClient(ctx);

    const voucherResponse = await api.get<ListResponse<VoucherSummary>>(
      "/ledger/voucher",
      {
        query: {
          dateFrom: DATE_FROM,
          dateTo: DATE_TO,
          count: 1000,
          sorting: "date",
          fields:
            "*,reverseVoucher(*),postings(*,account(*),supplier(*),customer(*),employee(*),project(*),product(*),department(*),vatType(*),currency(*),amortizationAccount(*),closeGroup(*),freeAccountingDimension1(*),freeAccountingDimension2(*),freeAccountingDimension3(*))",
        },
      },
    );
    const vouchers = requireArray(voucherResponse.values, "voucher values");

    const accountResponse = await api.get<ListResponse<AccountSummary>>(
      "/ledger/account",
      {
        query: {
          number: `${MISSING_VAT_TARGET_ACCOUNT},${WRONG_ACCOUNT_TO}`,
          fields: "*",
          count: 1000,
        },
      },
    );
    const accounts = requireArray(accountResponse.values, "account values");
    const analysis = analyze(vouchers, accounts);

    const wrongAccountVoucherId = await createVoucher(api, {
      date: requireString(
        analysis.wrongAccountVoucher.date,
        "wrong-account voucher date",
      ),
      description: `Korrigering: ${
        analysis.wrongAccountVoucher.description ??
        `feil konto ${WRONG_ACCOUNT_FROM}/${WRONG_ACCOUNT_TO}`
      }`,
      voucherType: null,
      postings: [
        buildPosting({
          row: 1,
          date: requireString(
            analysis.wrongAccountVoucher.date,
            "wrong-account voucher date",
          ),
          description: `Korrigering konto ${WRONG_ACCOUNT_FROM} til ${WRONG_ACCOUNT_TO}`,
          accountId: requireNumber(
            analysis.account7140.id,
            `account ${WRONG_ACCOUNT_TO} id`,
          ),
          amount: WRONG_ACCOUNT_AMOUNT,
        }),
        buildPosting({
          row: 2,
          date: requireString(
            analysis.wrongAccountVoucher.date,
            "wrong-account voucher date",
          ),
          description: `Korrigering konto ${WRONG_ACCOUNT_FROM} til ${WRONG_ACCOUNT_TO}`,
          accountId: requireNumber(
            pickSingle(
              requireArray(
                analysis.wrongAccountVoucher.postings,
                "wrong-account voucher postings",
              ).filter(
                (posting) => accountNumberOf(posting) === WRONG_ACCOUNT_FROM,
              ),
              `${WRONG_ACCOUNT_FROM} posting`,
            ).account?.id,
            `account ${WRONG_ACCOUNT_FROM} id`,
          ),
          amount: -WRONG_ACCOUNT_AMOUNT,
        }),
      ],
    });

    const reverseVoucherId = await reverseVoucher(
      api,
      analysis.duplicateVoucherToReverse,
    );

    const missingVatCounterpart = findCounterpartPosting(
      analysis.missingVatVoucher,
      MISSING_VAT_ACCOUNT,
    );
    const missingVatVoucherId = await createVoucher(api, {
      date: requireString(
        analysis.missingVatVoucher.date,
        "missing-vat voucher date",
      ),
      description: `MVA-korrigering: ${
        analysis.missingVatVoucher.description ?? String(MISSING_VAT_ACCOUNT)
      }`,
      voucherType: null,
      postings: [
        buildPosting({
          row: 1,
          date: requireString(
            analysis.missingVatVoucher.date,
            "missing-vat voucher date",
          ),
          description: "Manglande MVA-linje",
          accountId: requireNumber(
            analysis.account2710.id,
            `account ${MISSING_VAT_TARGET_ACCOUNT} id`,
          ),
          amount: MISSING_VAT_AMOUNT,
        }),
        buildPosting({
          row: 2,
          date: requireString(
            analysis.missingVatVoucher.date,
            "missing-vat voucher date",
          ),
          description: "Manglande MVA-linje",
          accountId: requireNumber(
            missingVatCounterpart.account?.id,
            "missing-vat counterpart account id",
          ),
          amount: -MISSING_VAT_AMOUNT,
          template: missingVatCounterpart,
        }),
      ],
    });

    const wrongAmountCounterpart = findCounterpartPosting(
      analysis.wrongAmountVoucher,
      WRONG_AMOUNT_ACCOUNT,
    );
    const wrongAmountVoucherId = await createVoucher(api, {
      date: requireString(
        analysis.wrongAmountVoucher.date,
        "wrong-amount voucher date",
      ),
      description: `Beløpskorrigering: ${
        analysis.wrongAmountVoucher.description ?? String(WRONG_AMOUNT_ACCOUNT)
      }`,
      voucherType: null,
      postings: [
        buildPosting({
          row: 1,
          date: requireString(
            analysis.wrongAmountVoucher.date,
            "wrong-amount voucher date",
          ),
          description: `Korrigering ${WRONG_AMOUNT_BOOKED} til ${WRONG_AMOUNT_CORRECT}`,
          accountId: requireNumber(
            pickSingle(
              requireArray(
                analysis.wrongAmountVoucher.postings,
                "wrong-amount voucher postings",
              ).filter(
                (posting) => accountNumberOf(posting) === WRONG_AMOUNT_ACCOUNT,
              ),
              `${WRONG_AMOUNT_ACCOUNT} posting`,
            ).account?.id,
            `account ${WRONG_AMOUNT_ACCOUNT} id`,
          ),
          amount: -WRONG_AMOUNT_DELTA,
        }),
        buildPosting({
          row: 2,
          date: requireString(
            analysis.wrongAmountVoucher.date,
            "wrong-amount voucher date",
          ),
          description: `Korrigering ${WRONG_AMOUNT_BOOKED} til ${WRONG_AMOUNT_CORRECT}`,
          accountId: requireNumber(
            wrongAmountCounterpart.account?.id,
            "wrong-amount counterpart account id",
          ),
          amount: WRONG_AMOUNT_DELTA,
          template: wrongAmountCounterpart,
        }),
      ],
    });

    const result: CompletedStrategyResult = {
      status: "completed",
      createdEntityIds: {
        wrongAccountCorrectionVoucherId: wrongAccountVoucherId,
        duplicateReverseVoucherId: reverseVoucherId,
        missingVatCorrectionVoucherId: missingVatVoucherId,
        wrongAmountCorrectionVoucherId: wrongAmountVoucherId,
      },
      verification: {
        wrongAccountVoucherId: analysis.wrongAccountVoucher.id,
        duplicateVoucherId: analysis.duplicateVoucherToReverse.id,
        missingVatVoucherId: analysis.missingVatVoucher.id,
        wrongAmountVoucherId: analysis.wrongAmountVoucher.id,
        wrongAccountCorrectionAmount: WRONG_ACCOUNT_AMOUNT,
        missingVatAmount: MISSING_VAT_AMOUNT,
        wrongAmountDelta: WRONG_AMOUNT_DELTA,
      },
    };

    return result;
  },
} satisfies CorrectLedgerErrorsStrategy;

function resolveApiClient(ctx: StrategyContext): StrategyApiClient {
  const ctxWithFetch = ctx as StrategyContext & {
    fetch?: StrategyApiClient;
  };

  return ctxWithFetch.fetch ?? ctx.tripletex;
}

function analyze(
  vouchers: readonly VoucherSummary[],
  accounts: readonly AccountSummary[],
): AnalysisResult {
  const active = activeVouchers(vouchers);
  const account2710 = pickAccountByNumber(accounts, MISSING_VAT_TARGET_ACCOUNT);
  const account7140 = pickAccountByNumber(accounts, WRONG_ACCOUNT_TO);

  const wrongAccountVoucher = pickSingle(
    active.filter((voucher) =>
      hasAccount(voucher, WRONG_ACCOUNT_FROM, WRONG_ACCOUNT_AMOUNT),
    ),
    "wrong-account voucher",
  );

  const duplicateCandidates = active.filter((voucher) =>
    hasAccount(voucher, DUPLICATE_ACCOUNT, DUPLICATE_AMOUNT),
  );
  const duplicateVoucherToReverse = selectDuplicateVoucherToReverse(
    duplicateCandidates,
  );

  const missingVatVoucher = pickSingle(
    active.filter((voucher) =>
      hasAccount(voucher, MISSING_VAT_ACCOUNT, MISSING_VAT_AMOUNT_EX_VAT),
    ),
    "missing-vat voucher",
  );

  const wrongAmountVoucher = pickSingle(
    active.filter((voucher) =>
      hasAccount(voucher, WRONG_AMOUNT_ACCOUNT, WRONG_AMOUNT_BOOKED),
    ),
    "wrong-amount voucher",
  );

  return {
    wrongAccountVoucher,
    duplicateVoucherToReverse,
    missingVatVoucher,
    wrongAmountVoucher,
    account2710,
    account7140,
  };
}

function activeVouchers(
  vouchers: readonly VoucherSummary[],
): VoucherSummary[] {
  const reversedVoucherIds = new Set<number>();

  for (const voucher of vouchers) {
    const reverseVoucherId = voucher.reverseVoucher?.id;
    if (typeof reverseVoucherId === "number") {
      reversedVoucherIds.add(reverseVoucherId);
    }
  }

  return vouchers.filter((voucher) => {
    const voucherId = voucher.id;
    return typeof voucherId === "number" && !reversedVoucherIds.has(voucherId);
  });
}

function selectDuplicateVoucherToReverse(
  duplicateCandidates: readonly VoucherSummary[],
): VoucherSummary {
  const tagged = duplicateCandidates.find((voucher) =>
    normalizeText(voucher.description).includes("duplikat"),
  );
  if (tagged) {
    return tagged;
  }

  const groups = new Map<string, VoucherSummary[]>();
  for (const voucher of duplicateCandidates) {
    const signature = duplicateSignature(voucher);
    const current = groups.get(signature) ?? [];
    current.push(voucher);
    groups.set(signature, current);
  }

  const duplicateGroup = [...groups.values()].find((group) => group.length === 2);
  if (!duplicateGroup) {
    throw new Error(
      `Expected one duplicate voucher pair on account ${DUPLICATE_ACCOUNT}, found ${duplicateCandidates.length} candidates: ${JSON.stringify(
        duplicateCandidates.map(compactVoucher),
      )}`,
    );
  }

  return [...duplicateGroup].sort(compareVoucherRecency)[0];
}

function duplicateSignature(voucher: VoucherSummary): string {
  const postings = requireArray(voucher.postings, "voucher postings")
    .map((posting) => ({
      account: accountNumberOf(posting) ?? null,
      amount: amountSigned(posting),
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
    );

  return JSON.stringify({
    date: voucher.date ?? null,
    description: voucher.description ?? "",
    postings,
  });
}

function compareVoucherRecency(
  left: VoucherSummary,
  right: VoucherSummary,
): number {
  const numberDiff = requireFiniteNumber(right.number, "voucher number") -
    requireFiniteNumber(left.number, "voucher number");
  if (numberDiff !== 0) {
    return numberDiff;
  }

  return requireFiniteNumber(right.id, "voucher id") -
    requireFiniteNumber(left.id, "voucher id");
}

function hasAccount(
  voucher: VoucherSummary,
  accountNumber: number,
  absAmount?: number,
): boolean {
  return requireArray(voucher.postings, "voucher postings").some((posting) => {
    if (accountNumberOf(posting) !== accountNumber) {
      return false;
    }

    return absAmount === undefined || amountAbs(posting) === absAmount;
  });
}

function findCounterpartPosting(
  voucher: VoucherSummary,
  excludedAccountNumber: number,
): PostingSummary {
  const counterpart = requireArray(voucher.postings, "voucher postings")
    .filter((posting) => accountNumberOf(posting) !== excludedAccountNumber)
    .sort((left, right) => Math.abs(amountSigned(right)) - Math.abs(amountSigned(left)))[0];

  if (!counterpart) {
    throw new Error(
      `Expected counterpart posting for voucher ${voucher.id ?? "(unknown)"}.`,
    );
  }

  return counterpart;
}

function buildPosting(input: {
  row: number;
  date: string;
  description: string;
  accountId: number;
  amount: number;
  template?: PostingSummary;
}): Record<string, unknown> {
  const posting: Record<string, unknown> = {
    row: input.row,
    date: input.date,
    description: input.description,
    account: { id: input.accountId },
    currency: cloneLink(input.template?.currency) ?? { id: 1 },
    amount: input.amount,
    amountCurrency: input.amount,
    amountGross: input.amount,
    amountGrossCurrency: input.amount,
  };

  for (const [sourceKey, targetKey] of TEMPLATE_LINK_FIELDS) {
    const link = cloneLink(input.template?.[sourceKey] as RefEntity | null | undefined);
    if (link) {
      posting[targetKey] = link;
    }
  }

  if (input.template?.invoiceNumber) {
    posting.invoiceNumber = input.template.invoiceNumber;
  }
  if (input.template?.termOfPayment) {
    posting.termOfPayment = input.template.termOfPayment;
  }
  if (typeof input.template?.postingRuleId === "number") {
    posting.postingRuleId = input.template.postingRuleId;
  }

  return posting;
}

const TEMPLATE_LINK_FIELDS: ReadonlyArray<
  [keyof PostingSummary, string]
> = [
  ["supplier", "supplier"],
  ["customer", "customer"],
  ["employee", "employee"],
  ["project", "project"],
  ["product", "product"],
  ["department", "department"],
  ["vatType", "vatType"],
  ["amortizationAccount", "amortizationAccount"],
  ["closeGroup", "closeGroup"],
  ["freeAccountingDimension1", "freeAccountingDimension1"],
  ["freeAccountingDimension2", "freeAccountingDimension2"],
  ["freeAccountingDimension3", "freeAccountingDimension3"],
];

function cloneLink(
  ref: RefEntity | null | undefined,
): { id: number } | undefined {
  if (typeof ref?.id !== "number") {
    return undefined;
  }

  return { id: ref.id };
}

async function createVoucher(
  api: StrategyApiClient,
  body: Record<string, unknown>,
): Promise<number> {
  const response = await api.post<ResponseWrapper<VoucherSummary>>("/ledger/voucher", {
    query: {
      sendToLedger: true,
    },
    body,
  });

  return requireNumber(response.value?.id, "created voucher id");
}

async function reverseVoucher(
  api: StrategyApiClient,
  voucher: VoucherSummary,
): Promise<number> {
  const voucherId = requireNumber(voucher.id, "voucher id");
  const response = await api.put<ResponseWrapper<VoucherSummary>>(
    `/ledger/voucher/${voucherId}/:reverse`,
    {
      query: {
        date: requireString(voucher.date, "voucher date"),
      },
    },
  );

  return requireNumber(response.value?.id, "reverse voucher id");
}

function pickAccountByNumber(
  accounts: readonly AccountSummary[],
  accountNumber: number,
): AccountSummary {
  const match = accounts.find(
    (account) => accountNumberOf({ account }) === accountNumber,
  );

  if (!match) {
    throw new Error(`Tripletex did not return account ${accountNumber}.`);
  }

  return match;
}

function compactVoucher(voucher: VoucherSummary): Record<string, unknown> {
  return {
    id: voucher.id ?? null,
    number: voucher.number ?? null,
    date: voucher.date ?? null,
    description: voucher.description ?? null,
  };
}

function accountNumberOf(
  postingOrWrapper:
    | PostingSummary
    | {
        account?: RefEntity | null;
      }
    | null
    | undefined,
): number | undefined {
  const raw = postingOrWrapper?.account?.number;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return raw;
  }
  if (typeof raw === "string" && raw.trim() !== "" && !Number.isNaN(Number(raw))) {
    return Number(raw);
  }

  return undefined;
}

function amountSigned(posting: PostingSummary | null | undefined): number {
  return (
    posting?.amountGross ??
    posting?.amountGrossCurrency ??
    posting?.amountCurrency ??
    posting?.amount ??
    0
  );
}

function amountAbs(posting: PostingSummary | null | undefined): number {
  return Math.abs(amountSigned(posting));
}

function normalizeText(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function pickSingle<T>(items: readonly T[], label: string): T {
  if (items.length !== 1) {
    throw new Error(`Expected exactly one ${label}, found ${items.length}.`);
  }

  return items[0];
}

function requireArray<T>(
  value: readonly T[] | null | undefined,
  label: string,
): T[] {
  if (!Array.isArray(value)) {
    throw new Error(`Expected ${label} to be an array.`);
  }

  return [...value];
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Expected ${label} to be a non-empty string.`);
  }

  return value;
}

function requireNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Expected ${label} to be a finite number.`);
  }

  return value;
}

function requireFiniteNumber(value: unknown, label: string): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) {
    return Number(value);
  }

  throw new Error(`Expected ${label} to be numeric.`);
}
