const BASE_URL = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "c-gcWojyTqlVgt_3UX2MXCs6fX8i2ZIB3bYyEXwQqmA";
const DATE = "2026-03-20";

const auth = `Basic ${Buffer.from(`0:${TOKEN}`).toString("base64")}`;
let callCount = 0;

type ApiResult = {
  status: number;
  data: any;
};

function makeUrl(path: string, query?: Record<string, string>) {
  const base = BASE_URL.endsWith("/") ? BASE_URL : `${BASE_URL}/`;
  const url = new URL(path, base);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, value);
    }
  }
  return url;
}

async function api(
  method: string,
  path: string,
  body?: unknown,
  query?: Record<string, string>,
): Promise<ApiResult> {
  callCount += 1;
  const response = await fetch(makeUrl(path, query), {
    method,
    headers: {
      Authorization: auth,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    if (
      callCount === 1 &&
      response.status === 403 &&
      data &&
      data.error === "Invalid or expired token"
    ) {
      throw new Error("Blocked: invalid or expired token");
    }

    const message =
      typeof data?.message === "string"
        ? data.message
        : typeof data?.error === "string"
          ? data.error
          : text || `HTTP ${response.status}`;
    const detail = Array.isArray(data?.validationMessages)
      ? ` ${JSON.stringify(data.validationMessages)}`
      : "";
    throw new Error(`${method} ${path} failed ${response.status}: ${message}${detail}`);
  }

  return { status: response.status, data };
}

function pickAccount(values: any[], number: number) {
  return values.find((account) => Number(account?.number) === number);
}

async function main() {
  const dimensionName = "Marked";
  if (dimensionName.length > 20) {
    throw new Error("Blocked: dimension name exceeds 20 chars");
  }

  const createdDimension = (
    await api("POST", "ledger/accountingDimensionName", {
      dimensionName,
      active: true,
    })
  ).data.value;

  const dimensionIndex = createdDimension.dimensionIndex;

  const offentlig = (
    await api("POST", "ledger/accountingDimensionValue", {
      dimensionIndex,
      displayName: "Offentlig",
      active: true,
      showInVoucherRegistration: true,
    })
  ).data.value;

  await api("POST", "ledger/accountingDimensionValue", {
    dimensionIndex,
    displayName: "Privat",
    active: true,
    showInVoucherRegistration: true,
  });

  const accountLookup = (
    await api("GET", "ledger/account", undefined, {
      number: "7300,1920",
      fields: "*",
    })
  ).data.values;

  const expenseAccount = pickAccount(accountLookup, 7300);
  if (!expenseAccount) {
    throw new Error("Blocked: account 7300 missing");
  }

  let balancingAccount = pickAccount(accountLookup, 1920);
  if (!balancingAccount) {
    const bankAccounts = (
      await api("GET", "ledger/account", undefined, {
        isBankAccount: "true",
        fields: "*",
      })
    ).data.values;
    balancingAccount =
      bankAccounts.find((account: any) => account?.isInvoiceAccount) ??
      bankAccounts.find((account: any) => account?.isBankAccount);
  }

  if (!balancingAccount) {
    throw new Error("Blocked: no balancing bank account found");
  }

  const freeField = `freeAccountingDimension${dimensionIndex}`;
  const lineDescription = 'Marked "Offentlig"';

  const voucher = (
    await api("POST", "ledger/voucher", {
      date: DATE,
      description: 'Bilag konto 7300, Marked "Offentlig"',
      voucherType: null,
      postings: [
        {
          row: 1,
          date: DATE,
          description: lineDescription,
          account: { id: expenseAccount.id },
          currency: { id: 1 },
          amount: 49300,
          amountCurrency: 49300,
          amountGross: 49300,
          amountGrossCurrency: 49300,
          [freeField]: { id: offentlig.id },
        },
        {
          row: 2,
          date: DATE,
          description: lineDescription,
          account: { id: balancingAccount.id },
          currency: { id: 1 },
          amount: -49300,
          amountCurrency: -49300,
          amountGross: -49300,
          amountGrossCurrency: -49300,
        },
      ],
    })
  ).data.value;

  console.log(
    JSON.stringify(
      {
        callCount,
        dimensionId: createdDimension.id,
        dimensionIndex,
        offentligId: offentlig.id,
        voucherId: voucher.id,
        voucherNumber: voucher.number,
      },
      null,
      2,
    ),
  );
}

await main();
