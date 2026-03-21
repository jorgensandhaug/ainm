const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const SESSION_TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const DATE_FROM = "2026-01-01";
const DATE_TO = "2026-03-01";
const CORRECTION_DATE = "2026-02-28";
const TAG = "RL82ff967a";

const authHeader = `Basic ${Buffer.from(`0:${SESSION_TOKEN}`).toString("base64")}`;

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

type Account = {
  id: number;
  number: number;
};

type Posting = {
  id?: number;
  amount?: number | null;
  amountGross?: number | null;
  amountGrossCurrency?: number | null;
  description?: string | null;
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
  opts: { query?: Record<string, string | number | undefined>; body?: Json } = {},
): Promise<T> {
  const response = await fetch(buildUrl(path, opts.query), {
    method,
    headers: {
      Authorization: authHeader,
      Accept: "application/json",
      ...(opts.body ? { "Content-Type": "application/json; charset=utf-8" } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(`${method} ${path} failed ${response.status}: ${JSON.stringify(body)}`);
  }

  return body as T;
}

function gross(posting: Posting) {
  return Number(posting.amountGrossCurrency ?? posting.amountGross ?? posting.amount ?? 0);
}

function accountNumber(posting: Posting) {
  return Number(posting.account?.number);
}

function eq(a: number, b: number) {
  return Math.abs(a - b) < 0.005;
}

function requireAccount(accounts: Map<number, Account>, number: number) {
  const account = accounts.get(number);
  if (!account) throw new Error(`Missing account ${number}`);
  return account;
}

function findPosting(voucher: Voucher, number: number, amountAbs: number) {
  return voucher.postings.find(
    (posting) => accountNumber(posting) === number && eq(Math.abs(gross(posting)), amountAbs),
  );
}

function findCounterpart(voucher: Voucher, primaryPosting: Posting, excluded: number[]) {
  const targetSign = Math.sign(gross(primaryPosting));
  const excludedSet = new Set([...excluded, 2710]);
  const candidates = voucher.postings.filter((posting) => {
    return (
      Math.sign(gross(posting)) === -targetSign &&
      !excludedSet.has(accountNumber(posting))
    );
  });
  if (candidates.length !== 1) {
    throw new Error(`Expected one counterpart in voucher ${voucher.id}, got ${candidates.length}`);
  }
  return candidates[0];
}

async function createVoucher(
  date: string,
  description: string,
  postings: Array<{ accountId: number; amountGross: number; row: number; vatTypeId?: number }>,
) {
  const response = await api<ApiEnvelope>("POST", "ledger/voucher", {
    query: { sendToLedger: "true" },
    body: {
      date,
      description,
      postings: postings.map((posting) => ({
        row: posting.row,
        account: { id: posting.accountId },
        amountGross: Number(posting.amountGross.toFixed(2)),
        amountGrossCurrency: Number(posting.amountGross.toFixed(2)),
        ...(posting.vatTypeId ? { vatType: { id: posting.vatTypeId } } : {}),
      })),
    },
  });
  return unwrap<any>(response);
}

async function main() {
  const setupAccountsResponse = await api<ApiEnvelope>("GET", "ledger/account", {
    query: {
      number: "1920,7000,7300,6860,6500,2710",
      fields: "id,number",
    },
  });
  const setupAccounts = new Map<number, Account>(
    unwrap<Account[]>(setupAccountsResponse).map((account) => [account.number, account]),
  );

  const acct1920 = requireAccount(setupAccounts, 1920);
  const acct7000 = requireAccount(setupAccounts, 7000);
  const acct7300 = requireAccount(setupAccounts, 7300);
  const acct6860 = requireAccount(setupAccounts, 6860);
  const acct6500 = requireAccount(setupAccounts, 6500);
  const acct2710 = requireAccount(setupAccounts, 2710);

  const setup = {
    wrongAccount: await createVoucher(`2026-01-12`, `${TAG} wrong-account`, [
      { row: 1, accountId: acct7300.id, amountGross: 7800 },
      { row: 2, accountId: acct1920.id, amountGross: -7800 },
    ]),
    duplicateOriginal: await createVoucher(`2026-01-20`, `${TAG} duplicate`, [
      { row: 1, accountId: acct6860.id, amountGross: 3500 },
      { row: 2, accountId: acct1920.id, amountGross: -3500 },
    ]),
    duplicateCopy: await createVoucher(`2026-01-21`, `${TAG} duplicate`, [
      { row: 1, accountId: acct6860.id, amountGross: 3500 },
      { row: 2, accountId: acct1920.id, amountGross: -3500 },
    ]),
    missingVat: await createVoucher(`2026-02-10`, `${TAG} missing-vat`, [
      { row: 1, accountId: acct6500.id, amountGross: 18350 },
      { row: 2, accountId: acct1920.id, amountGross: -18350 },
    ]),
    incorrectAmount: await createVoucher(`2026-02-18`, `${TAG} incorrect-amount`, [
      { row: 1, accountId: acct7300.id, amountGross: 15000 },
      { row: 2, accountId: acct1920.id, amountGross: -15000 },
    ]),
  };

  const correctionAccountsResponse = await api<ApiEnvelope>("GET", "ledger/account", {
    query: {
      number: "7300,7000,6860,6500,2710",
      fields: "id,number",
    },
  });
  const correctionAccounts = new Map<number, Account>(
    unwrap<Account[]>(correctionAccountsResponse).map((account) => [account.number, account]),
  );

  const voucherDiscoveryResponse = await api<ApiEnvelope>("GET", "ledger/voucher", {
    query: {
      dateFrom: DATE_FROM,
      dateTo: DATE_TO,
      fields:
        "id,date,description,postings(id,account(id,number),amount,amountGross,amountGrossCurrency,vatType(id),supplier(id),description)",
      count: 1000,
    },
  });
  const discovered = unwrap<Voucher[]>(voucherDiscoveryResponse).filter((voucher) =>
    String(voucher.description ?? "").includes(TAG),
  );

  const wrongVoucher = discovered.find((voucher) =>
    String(voucher.description ?? "").includes("wrong-account"),
  );
  if (!wrongVoucher) throw new Error("Missing sandbox wrong-account voucher");
  const wrongPosting = findPosting(wrongVoucher, 7300, 7800);
  if (!wrongPosting) throw new Error("Missing 7300/7800 posting");

  const duplicateGroups = new Map<string, Voucher[]>();
  for (const voucher of discovered.filter((row) => String(row.description ?? "").includes("duplicate"))) {
    const signature = voucher.postings
      .map((posting) => `${accountNumber(posting)}:${gross(posting).toFixed(2)}`)
      .sort()
      .join("|");
    const group = duplicateGroups.get(signature) ?? [];
    group.push(voucher);
    duplicateGroups.set(signature, group);
  }
  const duplicateGroup = [...duplicateGroups.values()].find((group) => group.length === 2);
  if (!duplicateGroup) throw new Error("Missing duplicate signature group");
  const duplicateVoucher = duplicateGroup.sort((a, b) => b.id - a.id)[0];
  const duplicatePosting = findPosting(duplicateVoucher, 6860, 3500);
  if (!duplicatePosting) throw new Error("Missing 6860/3500 duplicate posting");
  const duplicateCounterpart = findCounterpart(duplicateVoucher, duplicatePosting, [6860]);

  const missingVatVoucher = discovered.find((voucher) =>
    String(voucher.description ?? "").includes("missing-vat"),
  );
  if (!missingVatVoucher) throw new Error("Missing sandbox missing-vat voucher");
  const missingVatPosting = findPosting(missingVatVoucher, 6500, 18350);
  if (!missingVatPosting) throw new Error("Missing 6500/18350 posting");
  const missingVatCounterpart = findCounterpart(missingVatVoucher, missingVatPosting, [6500]);
  const missingVatAmount = 18350 * 0.25;

  const incorrectVoucher = discovered.find((voucher) =>
    String(voucher.description ?? "").includes("incorrect-amount"),
  );
  if (!incorrectVoucher) throw new Error("Missing sandbox incorrect-amount voucher");
  const incorrectPosting = findPosting(incorrectVoucher, 7300, 15000);
  if (!incorrectPosting) throw new Error("Missing 7300/15000 posting");
  const incorrectCounterpart = findCounterpart(incorrectVoucher, incorrectPosting, [7300]);

  const correctionResponse = await api<ApiEnvelope>("POST", "ledger/voucher", {
    query: { sendToLedger: "true" },
    body: {
      date: CORRECTION_DATE,
      description: `${TAG} correction`,
      postings: [
        {
          row: 1,
          description: "Correction wrong account from 7300",
          account: { id: requireAccount(correctionAccounts, 7300).id },
          amountGross: -gross(wrongPosting),
          amountGrossCurrency: -gross(wrongPosting),
        },
        {
          row: 2,
          description: "Correction wrong account to 7000",
          account: { id: requireAccount(correctionAccounts, 7000).id },
          amountGross: gross(wrongPosting),
          amountGrossCurrency: gross(wrongPosting),
        },
        {
          row: 3,
          description: "Correction reverse duplicate",
          account: { id: requireAccount(correctionAccounts, 6860).id },
          amountGross: -gross(duplicatePosting),
          amountGrossCurrency: -gross(duplicatePosting),
        },
        {
          row: 4,
          description: "Correction reverse duplicate",
          account: { id: duplicateCounterpart.account!.id },
          amountGross: -gross(duplicateCounterpart),
          amountGrossCurrency: -gross(duplicateCounterpart),
        },
        {
          row: 5,
          description: "Correction missing VAT on 2710",
          account: { id: requireAccount(correctionAccounts, 2710).id },
          amountGross: missingVatAmount,
          amountGrossCurrency: missingVatAmount,
        },
        {
          row: 6,
          description: "Correction missing VAT counterpart",
          account: { id: missingVatCounterpart.account!.id },
          amountGross: -missingVatAmount,
          amountGrossCurrency: -missingVatAmount,
        },
        {
          row: 7,
          description: "Correction incorrect amount 15000 to 10050",
          account: { id: requireAccount(correctionAccounts, 7300).id },
          amountGross: -(15000 - 10050),
          amountGrossCurrency: -(15000 - 10050),
        },
        {
          row: 8,
          description: "Correction incorrect amount 15000 to 10050",
          account: { id: incorrectCounterpart.account!.id },
          amountGross: 15000 - 10050,
          amountGrossCurrency: 15000 - 10050,
        },
      ],
    },
  });
  const correction = unwrap<any>(correctionResponse);

  const correctionRead = unwrap<Voucher>(
    await api<ApiEnvelope>("GET", `ledger/voucher/${correction.id}`, {
      query: {
        fields:
          "id,date,description,postings(id,account(id,number),amount,amountGross,amountGrossCurrency,vatType(id),description)",
      },
    }),
  );

  const altBase = await createVoucher(`2026-02-11`, `${TAG} alt-missing-vat-base`, [
    { row: 1, accountId: acct6500.id, amountGross: 18350 },
    { row: 2, accountId: acct1920.id, amountGross: -18350 },
  ]);

  const altCorrection = unwrap<any>(
    await api<ApiEnvelope>("POST", "ledger/voucher", {
      query: { sendToLedger: "true" },
      body: {
        date: CORRECTION_DATE,
        description: `${TAG} alt-missing-vat-correction`,
        postings: [
          {
            row: 1,
            description: "Alternative correction via 6500 + vatType 1",
            account: { id: acct6500.id },
            amountGross: missingVatAmount,
            amountGrossCurrency: missingVatAmount,
            vatType: { id: 1 },
          },
          {
            row: 2,
            description: "Alternative correction counterpart",
            account: { id: acct1920.id },
            amountGross: -missingVatAmount,
            amountGrossCurrency: -missingVatAmount,
          },
        ],
      },
    }),
  );

  const altCorrectionRead = unwrap<Voucher>(
    await api<ApiEnvelope>("GET", `ledger/voucher/${altCorrection.id}`, {
      query: {
        fields:
          "id,date,description,postings(id,account(id,number),amount,amountGross,amountGrossCurrency,vatType(id),description)",
      },
    }),
  );

  console.log(
    JSON.stringify(
      {
        setupIds: {
          wrongAccount: setup.wrongAccount.id,
          duplicateOriginal: setup.duplicateOriginal.id,
          duplicateCopy: setup.duplicateCopy.id,
          missingVat: setup.missingVat.id,
          incorrectAmount: setup.incorrectAmount.id,
          altMissingVatBase: altBase.id,
        },
        proofPath: [
          "GET /ledger/account?number=7300,7000,6860,6500,2710&fields=id,number",
          "GET /ledger/voucher?dateFrom=2026-01-01&dateTo=2026-03-01&fields=id,date,description,postings(id,account(id,number),amount,amountGross,amountGrossCurrency,vatType(id),supplier(id),description)&count=1000",
          "POST /ledger/voucher?sendToLedger=true",
        ],
        correctionVoucher: {
          id: correctionRead.id,
          description: correctionRead.description,
          postings: correctionRead.postings.map((posting) => ({
            accountNumber: accountNumber(posting),
            amount: posting.amount ?? null,
            amountGross: posting.amountGross ?? null,
            amountGrossCurrency: posting.amountGrossCurrency ?? null,
            vatTypeId: posting.vatType?.id ?? null,
          })),
        },
        altCorrectionVoucher: {
          id: altCorrectionRead.id,
          description: altCorrectionRead.description,
          postings: altCorrectionRead.postings.map((posting) => ({
            accountNumber: accountNumber(posting),
            amount: posting.amount ?? null,
            amountGross: posting.amountGross ?? null,
            amountGrossCurrency: posting.amountGrossCurrency ?? null,
            vatTypeId: posting.vatType?.id ?? null,
          })),
        },
      },
      null,
      2,
    ),
  );
}

await main();
