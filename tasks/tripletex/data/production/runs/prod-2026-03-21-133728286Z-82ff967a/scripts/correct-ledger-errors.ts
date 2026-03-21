const BASE_URL = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const SESSION_TOKEN = "qEKvmxNWDioUKGIXQPVLH2HWoii2rqIUUvI7jZ_BrIM";

const DATE_FROM = "2026-01-01";
const DATE_TO = "2026-03-01";
const CORRECTION_DATE = "2026-02-28";
const DRY_RUN = process.env.DRY_RUN === "1";

const ACCOUNT_NUMBERS = [7300, 7000, 6860, 6500, 2710];

type Json =
  | null
  | boolean
  | number
  | string
  | Json[]
  | { [key: string]: Json };

type ApiEnvelope = {
  value?: any;
  values?: any[];
  [key: string]: any;
};

type AccountRef = {
  id: number;
  number: number;
};

type Posting = {
  id: number;
  description?: string | null;
  amount?: number | null;
  amountGross?: number | null;
  amountGrossCurrency?: number | null;
  account?: { id: number; number?: number | null } | null;
  vatType?: { id: number } | null;
  supplier?: { id: number } | null;
};

type Voucher = {
  id: number;
  date: string;
  description?: string | null;
  postings: Posting[];
};

const authHeader = `Basic ${Buffer.from(`0:${SESSION_TOKEN}`).toString("base64")}`;

function unwrap<T>(json: ApiEnvelope): T {
  if (json.values !== undefined) return json.values as T;
  if (json.value !== undefined) return json.value as T;
  return json as T;
}

function buildUrl(path: string, query?: Record<string, string | number | undefined>) {
  const base = BASE_URL.replace(/\/+$/, "");
  const cleanPath = path.replace(/^\/+/, "");
  const url = new URL(`${base}/${cleanPath}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

async function api<T>(
  method: string,
  path: string,
  opts: {
    query?: Record<string, string | number | undefined>;
    body?: Json;
  } = {},
): Promise<T> {
  const response = await fetch(buildUrl(path, opts.query), {
    method,
    headers: {
      Authorization: authHeader,
      Accept: "application/json",
      ...(opts.body ? { "Content-Type": "application/json" } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  const raw = await response.text();
  const parsed = raw ? JSON.parse(raw) : null;

  if (!response.ok) {
    const errorText =
      parsed && typeof parsed === "object"
        ? JSON.stringify(parsed)
        : raw || response.statusText;
    const invalidToken =
      response.status === 403 &&
      typeof parsed?.error === "string" &&
      (parsed.error.includes("Invalid or expired token") ||
        parsed.error.includes("Invalid or expired proxy token"));
    if (invalidToken) {
      throw new Error(`Blocked credentials: ${errorText}`);
    }
    throw new Error(`${method} ${path} failed ${response.status}: ${errorText}`);
  }

  return parsed as T;
}

function gross(posting: Posting): number {
  const value = posting.amountGrossCurrency ?? posting.amountGross ?? posting.amount;
  if (typeof value !== "number") {
    throw new Error(`Posting ${posting.id} missing amount`);
  }
  return value;
}

function eq(a: number, b: number) {
  return Math.abs(a - b) < 0.005;
}

function accountNumber(posting: Posting): number {
  const number = posting.account?.number;
  if (typeof number !== "number") {
    throw new Error(`Posting ${posting.id} missing account number`);
  }
  return number;
}

function findPosting(voucher: Voucher, acct: number, amount: number) {
  return voucher.postings.find((posting) => {
    return accountNumber(posting) === acct && eq(Math.abs(gross(posting)), amount);
  });
}

function hasAccount(voucher: Voucher, acct: number) {
  return voucher.postings.some((posting) => accountNumber(posting) === acct);
}

function hasAnyRelevantPosting(voucher: Voucher) {
  return voucher.postings.some((posting) => {
    const acct = accountNumber(posting);
    const amount = Math.abs(gross(posting));
    return (
      acct === 7300 ||
      acct === 7000 ||
      acct === 6860 ||
      acct === 6500 ||
      acct === 2710 ||
      eq(amount, 7800) ||
      eq(amount, 3500) ||
      eq(amount, 18350) ||
      eq(amount, 15000) ||
      eq(amount, 10050)
    );
  });
}

function voucherSummary(voucher: Voucher) {
  return {
    id: voucher.id,
    date: voucher.date,
    description: voucher.description ?? null,
    postings: voucher.postings.map((posting) => ({
      account: accountNumber(posting),
      amount: posting.amount ?? null,
      amountGross: posting.amountGross ?? null,
      amountGrossCurrency: posting.amountGrossCurrency ?? null,
      vatTypeId: posting.vatType?.id ?? null,
      supplierId: posting.supplier?.id ?? null,
      description: posting.description ?? null,
    })),
  };
}

function findCounterpart(
  voucher: Voucher,
  excludedAccounts: number[],
  primaryPosting: Posting,
) {
  const excluded = new Set([...excludedAccounts, 2710]);
  const primarySign = Math.sign(gross(primaryPosting));
  const candidates = voucher.postings.filter((posting) => {
    return (
      Math.sign(gross(posting)) === -primarySign &&
      !excluded.has(accountNumber(posting))
    );
  });
  if (candidates.length !== 1) {
    throw new Error(
      `Expected 1 counterpart in voucher ${voucher.id}, got ${candidates.length}`,
    );
  }
  return candidates[0];
}

function findDuplicateVoucher(vouchers: Voucher[]) {
  const candidates = vouchers.filter((voucher) => findPosting(voucher, 6860, 3500));
  const explicitDuplicate = candidates.find((voucher) =>
    /duplikat|duplicate/i.test(voucher.description ?? ""),
  );
  if (explicitDuplicate) return explicitDuplicate;
  if (candidates.length === 1) return candidates[0];
  if (candidates.length > 1) {
    return candidates.sort((a, b) => b.id - a.id)[0];
  }
  throw new Error("Duplicate voucher not found");
}

function requireAccount(accounts: Map<number, AccountRef>, number: number) {
  const account = accounts.get(number);
  if (!account) throw new Error(`Missing account ${number}`);
  return account;
}

function postingSummary(posting: Posting) {
  return {
    account: accountNumber(posting),
    amountGross: gross(posting),
    vatTypeId: posting.vatType?.id ?? null,
    supplierId: posting.supplier?.id ?? null,
  };
}

async function main() {
  const accountsResponse = await api<ApiEnvelope>("GET", "ledger/account", {
    query: {
      number: ACCOUNT_NUMBERS.join(","),
      fields: "id,number",
    },
  });
  const accountRows = unwrap<AccountRef[]>(accountsResponse);
  const accounts = new Map<number, AccountRef>(
    accountRows.map((account) => [account.number, account]),
  );

  for (const number of ACCOUNT_NUMBERS) requireAccount(accounts, number);

  const vouchersResponse = await api<ApiEnvelope>("GET", "ledger/voucher", {
    query: {
      dateFrom: DATE_FROM,
      dateTo: DATE_TO,
      fields:
        "id,date,description,postings(id,account(id,number),amount,amountGross,amountGrossCurrency,vatType(id),supplier(id),description)",
      count: 1000,
    },
  });
  const vouchers = unwrap<Voucher[]>(vouchersResponse);

  if (DRY_RUN) {
    console.log(
      JSON.stringify(
        {
          relevantVouchers: vouchers.filter(hasAnyRelevantPosting).map(voucherSummary),
        },
        null,
        2,
      ),
    );
    return;
  }

  const wrongAccountVoucher = vouchers.find((voucher) => Boolean(findPosting(voucher, 7300, 7800)));
  if (!wrongAccountVoucher) {
    throw new Error("Missing wrong-account voucher for 7300/7800");
  }
  const wrongAccountExpense = findPosting(wrongAccountVoucher, 7300, 7800)!;
  const wrongAccountCounterpart = findCounterpart(
    wrongAccountVoucher,
    [7300],
    wrongAccountExpense,
  );

  const incorrectAmountVoucher = vouchers.find((voucher) => Boolean(findPosting(voucher, 7300, 15000)));
  if (!incorrectAmountVoucher) {
    throw new Error("Missing incorrect-amount voucher for 7300/15000");
  }
  const incorrectAmountExpense = findPosting(incorrectAmountVoucher, 7300, 15000)!;
  const incorrectAmountCounterpart = findCounterpart(
    incorrectAmountVoucher,
    [7300],
    incorrectAmountExpense,
  );

  const duplicateVoucher = findDuplicateVoucher(vouchers);
  const duplicateExpense = findPosting(duplicateVoucher, 6860, 3500);
  if (!duplicateExpense) {
    throw new Error("Duplicate voucher missing 6860/3500 posting");
  }
  const duplicateCounterpart = findCounterpart(duplicateVoucher, [6860], duplicateExpense);

  const missingVatVoucher = vouchers.find((voucher) => Boolean(findPosting(voucher, 6500, 18350)));
  if (!missingVatVoucher) {
    throw new Error("Missing VAT voucher not found");
  }
  const missingVatExpense = findPosting(missingVatVoucher, 6500, 18350)!;
  const missingVatCounterpart = findCounterpart(
    missingVatVoucher,
    [6500],
    missingVatExpense,
  );
  const missingVatAmount = 18350 * 0.25;

  const postings: any[] = [];
  let row = 1;

  const pushPosting = (args: {
    accountId: number;
    amountGross: number;
    description: string;
    vatTypeId?: number | null;
    supplierId?: number | null;
  }) => {
    const posting: Record<string, any> = {
      row,
      description: args.description,
      account: { id: args.accountId },
      amountGross: Number(args.amountGross.toFixed(2)),
      amountGrossCurrency: Number(args.amountGross.toFixed(2)),
    };
    if (args.vatTypeId) posting.vatType = { id: args.vatTypeId };
    if (args.supplierId) posting.supplier = { id: args.supplierId };
    postings.push(posting);
    row += 1;
  };

  const wrongVatTypeId = wrongAccountExpense.vatType?.id ?? null;
  const wrongAmount = gross(wrongAccountExpense);
  pushPosting({
    accountId: requireAccount(accounts, 7300).id,
    amountGross: -wrongAmount,
    description: "Korreksjon: ompostering fra 7300",
    vatTypeId: wrongVatTypeId,
  });
  pushPosting({
    accountId: requireAccount(accounts, 7000).id,
    amountGross: wrongAmount,
    description: "Korreksjon: ompostering til 7000",
    vatTypeId: wrongVatTypeId,
  });

  const duplicateVatTypeId = duplicateExpense.vatType?.id ?? null;
  pushPosting({
    accountId: requireAccount(accounts, 6860).id,
    amountGross: -gross(duplicateExpense),
    description: "Korreksjon: reversering duplikat",
    vatTypeId: duplicateVatTypeId,
  });
  pushPosting({
    accountId: duplicateCounterpart.account!.id,
    amountGross: -gross(duplicateCounterpart),
    description: "Korreksjon: reversering duplikat",
    supplierId: duplicateCounterpart.supplier?.id ?? null,
  });

  pushPosting({
    accountId: requireAccount(accounts, 6500).id,
    amountGross: missingVatAmount,
    description: "Korreksjon: manglende MVA",
    vatTypeId: missingVatExpense.vatType?.id ?? 1,
  });
  pushPosting({
    accountId: missingVatCounterpart.account!.id,
    amountGross: Math.sign(gross(missingVatCounterpart)) * missingVatAmount,
    description: "Korreksjon: manglende MVA",
    supplierId: missingVatCounterpart.supplier?.id ?? null,
  });

  const incorrectDifference = 15000 - 10050;
  const incorrectVatTypeId = incorrectAmountExpense.vatType?.id ?? null;
  const incorrectAmount = -Math.sign(gross(incorrectAmountExpense)) * incorrectDifference;
  pushPosting({
    accountId: requireAccount(accounts, 7300).id,
    amountGross: incorrectAmount,
    description: "Korreksjon: feil beløp 15000 til 10050",
    vatTypeId: incorrectVatTypeId,
  });
  pushPosting({
    accountId: incorrectAmountCounterpart.account!.id,
    amountGross: -incorrectAmount,
    description: "Korreksjon: feil beløp 15000 til 10050",
    supplierId: incorrectAmountCounterpart.supplier?.id ?? null,
  });

  console.log(
    JSON.stringify(
      {
        selected: {
          wrongAccountVoucher: {
            id: wrongAccountVoucher.id,
            date: wrongAccountVoucher.date,
            description: wrongAccountVoucher.description ?? null,
            expense: postingSummary(wrongAccountExpense),
            counterpart: postingSummary(wrongAccountCounterpart),
          },
          duplicateVoucher: {
            id: duplicateVoucher.id,
            date: duplicateVoucher.date,
            description: duplicateVoucher.description ?? null,
            expense: postingSummary(duplicateExpense),
            counterpart: postingSummary(duplicateCounterpart),
          },
          missingVatVoucher: {
            id: missingVatVoucher.id,
            date: missingVatVoucher.date,
            description: missingVatVoucher.description ?? null,
            counterpart: postingSummary(missingVatCounterpart),
          },
          incorrectAmountVoucher: {
            id: incorrectAmountVoucher.id,
            date: incorrectAmountVoucher.date,
            description: incorrectAmountVoucher.description ?? null,
            expense: postingSummary(incorrectAmountExpense),
            counterpart: postingSummary(incorrectAmountCounterpart),
          },
        },
        correctionDate: CORRECTION_DATE,
        correctionPostings: postings,
      },
      null,
      2,
    ),
  );

  const correctionResponse = await api<ApiEnvelope>("POST", "ledger/voucher", {
    query: { sendToLedger: "true" },
    body: {
      date: CORRECTION_DATE,
      description: "Korreksjonsbilag januar-februar 2026",
      postings,
    },
  });

  const correction = unwrap<any>(correctionResponse);
  console.log(
    JSON.stringify(
      {
        result: {
          id: correction.id,
          number: correction.number ?? null,
          date: correction.date ?? null,
          description: correction.description ?? null,
          postings:
            correction.postings?.map((posting: any) => ({
              accountId: posting.account?.id ?? null,
              accountNumber: posting.account?.number ?? null,
              amount: posting.amount ?? null,
              amountGross: posting.amountGross ?? null,
              amountGrossCurrency: posting.amountGrossCurrency ?? null,
              vatTypeId: posting.vatType?.id ?? null,
              supplierId: posting.supplier?.id ?? null,
            })) ?? null,
        },
      },
      null,
      2,
    ),
  );
}

await main();
