import type {
  StrategyContext,
  StrategyResult,
} from "../../../runtime/contracts";
import type {
  CorrectLedgerErrorsInput,
  CorrectLedgerErrorsStrategy,
} from "../task";
import { CORRECT_LEDGER_ERRORS_TASK_ID } from "../task";

/* ── Constants ────────────────────────────────────────────── */

const DATE_FROM = "2026-01-01";
const DATE_TO = "2026-03-01";
const CORRECTION_DATE = "2026-02-28";
const VAT_ACCOUNT = 2710;
const VAT_RATE = 0.25;

/* ── Prompt-parsed parameters ─────────────────────────────── */

interface ParsedErrors {
  wrongAccount: { source: number; target: number; amount: number };
  duplicate: { account: number; amount: number };
  missingVat: { account: number; postedAmount: number };
  wrongAmount: { account: number; recorded: number; correct: number };
}

/* ── Types ─────────────────────────────────────────────────── */

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

/* ── Voucher fields expansion ─────────────────────────────── */

const VOUCHER_FIELDS =
  "id,number,date,description,reverseVoucher(id),postings(id,row,date,description,account(id,number),supplier(id),customer(id),employee(id),project(id),product(id),department(id),vatType(id),currency(id),amortizationAccount(id),closeGroup(id),freeAccountingDimension1(id),freeAccountingDimension2(id),freeAccountingDimension3(id),invoiceNumber,termOfPayment,postingRuleId,amount,amountCurrency,amountGross,amountGrossCurrency)";

const LINK_FIELDS: ReadonlyArray<[keyof PostingSummary, string]> = [
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

/* ── Strategy export ──────────────────────────────────────── */

export const strategy = {
  strategyId: "24.correct-ledger-errors.v3",
  strategyPath: "src/tasks/task-24/strategies/correct-ledger-errors-v3.ts",
  taskId: CORRECT_LEDGER_ERRORS_TASK_ID,
  name: "Correct four ledger errors – dynamic prompt parsing + direct 2710",
  summary:
    "Parses the multilingual prompt to extract the four error parameters dynamically, then scans vouchers and posts one correction voucher. Missing-VAT correction posts directly to account 2710.",
  hypothesis:
    "v1 fails because (a) hardcoded account/amount values do not match actual prompt parameters which vary every run, and (b) the VAT correction uses expense+vatType=1 instead of direct 2710, and (c) detection picks the correctly-booked voucher instead of the error voucher. Parsing the prompt, preferring no-2710 vouchers, and posting directly to 2710 fixes all three.",
  expectedCallProfile: {
    targetCalls: 3,
    maxCalls: 3,
  },
  stepOutline: [
    "Parse the multilingual prompt to extract the 10 error parameters (accounts and amounts).",
    "API call 1: GET /ledger/account for all unique referenced accounts plus 2710.",
    "API call 2: GET /ledger/voucher for the Jan-Feb 2026 window with posting expansion, then identify the four error vouchers. For missing-VAT, prefer vouchers WITHOUT a 2710 posting.",
    "API call 3: POST /ledger/voucher?sendToLedger=true with one corrective voucher dated 2026-02-28. Missing-VAT correction posts directly to 2710 (no vatType, no expense account).",
  ],
  status: "active" as const,

  async run(
    ctx: StrategyContext,
    _input: CorrectLedgerErrorsInput,
  ): Promise<StrategyResult> {
    const prompt = ctx.request?.prompt;
    if (!prompt) {
      throw new Error(
        "Strategy requires ctx.request.prompt to extract error parameters from the task prompt.",
      );
    }
    const params = parsePrompt(prompt);

    const uniqueAccountNumbers = [
      ...new Set([
        params.wrongAccount.source,
        params.wrongAccount.target,
        params.duplicate.account,
        params.missingVat.account,
        VAT_ACCOUNT,
        params.wrongAmount.account,
      ]),
    ];

    // API call 1: GET accounts
    const accountResponse = await ctx.tripletex.get<
      ListResponse<AccountSummary>
    >("/ledger/account", {
      query: {
        number: uniqueAccountNumbers.join(","),
        fields: "*",
      },
    });
    const accountsByNumber = mapAccountsByNumber(accountResponse.values ?? []);
    for (const num of uniqueAccountNumbers) {
      requireAccount(accountsByNumber, num);
    }

    // API call 2: GET vouchers
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
    const activeVouchers = filterActiveVouchers(voucherResponse.values ?? []);

    // ── Identify the 4 error vouchers ──

    // 1. Wrong account
    const wrongAccountVoucher = pickSingle(
      activeVouchers.filter((v) =>
        hasPosting(v, params.wrongAccount.source, params.wrongAccount.amount),
      ),
      "wrong-account voucher",
    );
    const wrongAccountPosting = requirePosting(
      findPosting(
        wrongAccountVoucher,
        params.wrongAccount.source,
        params.wrongAccount.amount,
      ),
      "wrong-account posting",
    );

    // 2. Duplicate
    const duplicateVoucher = selectDuplicateVoucher(
      activeVouchers,
      params.duplicate.account,
      params.duplicate.amount,
    );
    const duplicatePosting = requirePosting(
      findPosting(
        duplicateVoucher,
        params.duplicate.account,
        params.duplicate.amount,
      ),
      "duplicate posting",
    );
    const duplicateCounterpart = findCounterpart(
      duplicateVoucher,
      duplicatePosting,
      [params.duplicate.account],
    );

    // 3. Missing VAT — PREFER voucher WITHOUT 2710 (Case A)
    const missingVatVoucher = selectMissingVatVoucher(
      activeVouchers,
      params.missingVat.account,
      params.missingVat.postedAmount,
    );
    const missingVatPosting = requirePosting(
      findPosting(
        missingVatVoucher,
        params.missingVat.account,
        params.missingVat.postedAmount,
      ) ?? findPostingByAccount(missingVatVoucher, params.missingVat.account),
      "missing-vat posting",
    );
    const missingVatCounterpart = findCounterpart(
      missingVatVoucher,
      missingVatPosting,
      [params.missingVat.account],
    );

    // 4. Wrong amount
    const wrongAmountVoucher = pickSingle(
      activeVouchers.filter((v) =>
        hasPosting(
          v,
          params.wrongAmount.account,
          params.wrongAmount.recorded,
        ),
      ),
      "wrong-amount voucher",
    );
    const wrongAmountPosting = requirePosting(
      findPosting(
        wrongAmountVoucher,
        params.wrongAmount.account,
        params.wrongAmount.recorded,
      ),
      "wrong-amount posting",
    );
    const wrongAmountCounterpart = findCounterpart(
      wrongAmountVoucher,
      wrongAmountPosting,
      [params.wrongAmount.account],
    );

    // ── Compute correction amounts ──

    const vatAmount =
      signedDirection(missingVatPosting) *
      roundToTwo(params.missingVat.postedAmount * VAT_RATE);

    const wrongAmountDelta =
      -signedDirection(wrongAmountPosting) *
      roundToTwo(params.wrongAmount.recorded - params.wrongAmount.correct);

    // ── API call 3: POST correction voucher ──

    const postings: Record<string, unknown>[] = [
      // Wrong account: reverse source, post to target
      buildPostingFromTemplate({
        row: 1,
        date: CORRECTION_DATE,
        description: `Korreksjon: ompostering fra ${params.wrongAccount.source}`,
        accountId: requireId(
          requireAccount(accountsByNumber, params.wrongAccount.source).id,
          `account ${params.wrongAccount.source} id`,
        ),
        amount: -signedAmount(wrongAccountPosting),
        template: wrongAccountPosting,
      }),
      buildPostingFromTemplate({
        row: 2,
        date: CORRECTION_DATE,
        description: `Korreksjon: ompostering til ${params.wrongAccount.target}`,
        accountId: requireId(
          requireAccount(accountsByNumber, params.wrongAccount.target).id,
          `account ${params.wrongAccount.target} id`,
        ),
        amount: signedAmount(wrongAccountPosting),
        template: wrongAccountPosting,
      }),

      // Duplicate: reverse expense and counterpart
      buildPostingFromTemplate({
        row: 3,
        date: CORRECTION_DATE,
        description: "Korreksjon: reversering duplikat",
        accountId: requireId(
          requireAccount(accountsByNumber, params.duplicate.account).id,
          `account ${params.duplicate.account} id`,
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

      // Missing VAT: direct 2710 posting (no vatType, no expense account)
      buildPostingFromTemplate({
        row: 5,
        date: CORRECTION_DATE,
        description: "Korreksjon: manglende MVA",
        accountId: requireId(
          requireAccount(accountsByNumber, VAT_ACCOUNT).id,
          "account 2710 id",
        ),
        amount: vatAmount,
        // No template — clean posting on 2710, no vatType
      }),
      buildPostingFromTemplate({
        row: 6,
        date: CORRECTION_DATE,
        description: "Korreksjon: manglende MVA",
        accountId: requireId(
          missingVatCounterpart.account?.id,
          "missing-vat counterpart account id",
        ),
        amount: -vatAmount,
        template: missingVatCounterpart,
      }),

      // Wrong amount: post the delta
      buildPostingFromTemplate({
        row: 7,
        date: CORRECTION_DATE,
        description: `Korreksjon: feil beløp ${params.wrongAmount.recorded} til ${params.wrongAmount.correct}`,
        accountId: requireId(
          requireAccount(accountsByNumber, params.wrongAmount.account).id,
          `account ${params.wrongAmount.account} id`,
        ),
        amount: wrongAmountDelta,
        template: wrongAmountPosting,
      }),
      buildPostingFromTemplate({
        row: 8,
        date: CORRECTION_DATE,
        description: `Korreksjon: feil beløp ${params.wrongAmount.recorded} til ${params.wrongAmount.correct}`,
        accountId: requireId(
          wrongAmountCounterpart.account?.id,
          "wrong-amount counterpart account id",
        ),
        amount: -wrongAmountDelta,
        template: wrongAmountCounterpart,
      }),
    ];

    const correctionResponse = await ctx.tripletex.post<
      ResponseWrapper<VoucherCreateResponse>
    >("/ledger/voucher", {
      query: {
        sendToLedger: true,
      },
      body: {
        date: CORRECTION_DATE,
        description: "Korreksjonsbilag januar-februar 2026",
        postings,
      },
    });

    const voucherId = requireId(
      correctionResponse.value?.id,
      "correction voucher id",
    );

    const isCaseA = !voucherHasAccount(missingVatVoucher, VAT_ACCOUNT);

    return {
      createdEntityIds: {
        voucherId,
      },
      verification: {
        parsedParams: params,
        correctionDate: CORRECTION_DATE,
        correctionVoucherNumber: correctionResponse.value?.number ?? null,
        wrongAccountVoucherId: wrongAccountVoucher.id ?? null,
        duplicateVoucherId: duplicateVoucher.id ?? null,
        missingVatVoucherId: missingVatVoucher.id ?? null,
        missingVatCase: isCaseA ? "A-no-2710" : "B-has-2710",
        wrongAmountVoucherId: wrongAmountVoucher.id ?? null,
        correctionPostingCount: postings.length,
        vatCorrectionAmount: roundToTwo(Math.abs(vatAmount)),
        wrongAmountCorrectionDelta: roundToTwo(Math.abs(wrongAmountDelta)),
      },
    };
  },
} satisfies CorrectLedgerErrorsStrategy;

/* ── Prompt parser ────────────────────────────────────────── */

function parsePrompt(prompt: string): ParsedErrors {
  const blocks = [...prompt.matchAll(/\(([^)]+)\)/g)].map((m) => m[1]);
  if (blocks.length < 4) {
    throw new Error(
      `Expected at least 4 parenthesized error blocks in prompt, found ${blocks.length}.`,
    );
  }

  const extractNumbers = (s: string): number[] =>
    [...s.matchAll(/\d+/g)].map((m) => Number(m[0]));

  const b1 = extractNumbers(blocks[0]);
  const b2 = extractNumbers(blocks[1]);
  const b3 = extractNumbers(blocks[2]);
  const b4 = extractNumbers(blocks[3]);

  if (b1.length < 3) {
    throw new Error(
      `Wrong-account block has ${b1.length} numbers, expected ≥3: "${blocks[0]}"`,
    );
  }
  if (b2.length < 2) {
    throw new Error(
      `Duplicate block has ${b2.length} numbers, expected ≥2: "${blocks[1]}"`,
    );
  }
  if (b3.length < 3) {
    throw new Error(
      `Missing-VAT block has ${b3.length} numbers, expected ≥3: "${blocks[2]}"`,
    );
  }
  if (b4.length < 3) {
    throw new Error(
      `Wrong-amount block has ${b4.length} numbers, expected ≥3: "${blocks[3]}"`,
    );
  }

  return {
    wrongAccount: { source: b1[0], target: b1[1], amount: b1[2] },
    duplicate: { account: b2[0], amount: b2[1] },
    missingVat: { account: b3[0], postedAmount: b3[1] },
    wrongAmount: { account: b4[0], recorded: b4[1], correct: b4[2] },
  };
}

/* ── Voucher detection helpers ────────────────────────────── */

function selectMissingVatVoucher(
  activeVouchers: readonly VoucherSummary[],
  account: number,
  postedAmount: number,
): VoucherSummary {
  // Candidates matching account + exact amount
  const exactCandidates = activeVouchers.filter((v) =>
    hasPosting(v, account, postedAmount),
  );

  // Prefer Case A: voucher WITHOUT a 2710 posting (the actual error voucher)
  const withoutVat = exactCandidates.filter(
    (v) => !voucherHasAccount(v, VAT_ACCOUNT),
  );
  if (withoutVat.length >= 1) {
    return withoutVat[0];
  }

  // Broader search: any voucher on the account without 2710, ignoring amount
  const broaderWithout = activeVouchers.filter(
    (v) =>
      voucherHasAccount(v, account) && !voucherHasAccount(v, VAT_ACCOUNT),
  );
  if (broaderWithout.length >= 1) {
    return broaderWithout[0];
  }

  // Last resort: pick from exact candidates even if they have 2710
  if (exactCandidates.length >= 1) {
    return exactCandidates[0];
  }

  throw new Error(
    `No vouchers found on account ${account} for missing-VAT detection.`,
  );
}

function selectDuplicateVoucher(
  vouchers: readonly VoucherSummary[],
  account: number,
  amount: number,
): VoucherSummary {
  const candidates = vouchers.filter((v) => hasPosting(v, account, amount));

  const explicitlyNamed = candidates.filter((v) =>
    /duplikat|duplicate/i.test(v.description ?? ""),
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
      `Expected one duplicate pair on account ${account}/${amount}, found ${candidates.length} candidates.`,
    );
  }

  return [...duplicateGroup].sort(compareVoucherRecency)[0];
}

/* ── Account/voucher helpers ──────────────────────────────── */

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

function voucherHasAccount(
  voucher: VoucherSummary,
  accountNumber: number,
): boolean {
  return requirePostings(voucher).some(
    (p) => accountNumberOf(p) === accountNumber,
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
    (p) =>
      accountNumberOf(p) === accountNumber &&
      nearlyEqual(Math.abs(signedAmount(p)), amountAbs),
  );
}

function findPostingByAccount(
  voucher: VoucherSummary,
  accountNumber: number,
): PostingSummary | undefined {
  return requirePostings(voucher).find(
    (p) => accountNumberOf(p) === accountNumber,
  );
}

function findCounterpart(
  voucher: VoucherSummary,
  primaryPosting: PostingSummary,
  excludedAccounts: readonly number[],
): PostingSummary {
  const excluded = new Set<number>([...excludedAccounts, VAT_ACCOUNT]);
  const primarySign = signedDirection(primaryPosting);
  const candidates = requirePostings(voucher)
    .filter((p) => {
      const num = accountNumberOf(p);
      return (
        num !== undefined &&
        !excluded.has(num) &&
        signedDirection(p) === -primarySign
      );
    })
    .sort(
      (a, b) => Math.abs(signedAmount(b)) - Math.abs(signedAmount(a)),
    );

  if (candidates.length === 0) {
    throw new Error(
      `No counterpart posting found in voucher ${voucher.id ?? "unknown"}.`,
    );
  }
  return candidates[0];
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
    .map((p) => ({
      account: accountNumberOf(p) ?? null,
      amount: signedAmount(p),
      description: p.description ?? "",
      supplierId: p.supplier?.id ?? null,
      customerId: p.customer?.id ?? null,
      employeeId: p.employee?.id ?? null,
      projectId: p.project?.id ?? null,
      departmentId: p.department?.id ?? null,
      vatTypeId: p.vatType?.id ?? null,
    }))
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
    .map((e) => JSON.stringify(e))
    .join("|");
}

/* ── Posting builder ──────────────────────────────────────── */

function buildPostingFromTemplate(input: {
  row: number;
  date: string;
  description: string;
  accountId: number;
  amount: number;
  template?: PostingSummary;
  forceVatTypeId?: number;
}): Record<string, unknown> {
  const roundedAmount = roundToTwo(input.amount);
  const posting: Record<string, unknown> = {
    row: input.row,
    date: input.date,
    description: input.description,
    account: { id: input.accountId },
    currency: cloneRef(input.template?.currency) ?? { id: 1 },
    amount: roundedAmount,
    amountCurrency: roundedAmount,
    amountGross: roundedAmount,
    amountGrossCurrency: roundedAmount,
  };

  if (input.template) {
    for (const [sourceKey, targetKey] of LINK_FIELDS) {
      const link = cloneRef(
        input.template[sourceKey] as IdRef | null | undefined,
      );
      if (link) {
        posting[targetKey] = link;
      }
    }
  }

  const vatTypeId = input.forceVatTypeId ?? input.template?.vatType?.id;
  if (typeof vatTypeId === "number") {
    posting.vatType = { id: vatTypeId };
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

/* ── Primitive helpers ────────────────────────────────────── */

function requirePostings(voucher: VoucherSummary): PostingSummary[] {
  if (!Array.isArray(voucher.postings)) {
    throw new Error(
      `Voucher ${voucher.id ?? "unknown"} did not include postings.`,
    );
  }
  return [...voucher.postings];
}

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
