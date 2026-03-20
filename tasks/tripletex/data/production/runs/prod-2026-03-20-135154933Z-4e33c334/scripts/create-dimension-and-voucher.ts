const BASE_URL = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "3ArfYXlqAc8D4ta_fE65Yf1a2W1yaewWnAW7mQ8ZcRU";
const AUTH = `Basic ${Buffer.from(`0:${TOKEN}`).toString("base64")}`;
const TODAY = "2026-03-20";

type TripletexResponse<T> = {
  value?: T;
  values?: T[];
  fullResultSize?: number;
};

async function request<T>(
  path: string,
  init?: RequestInit,
): Promise<TripletexResponse<T>> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: AUTH,
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(
      JSON.stringify(
        {
          status: response.status,
          path,
          body,
        },
        null,
        2,
      ),
    );
  }

  return body;
}

async function main() {
  const accounts = await request<{
    id: number;
    number: string | number;
    name?: string;
    isBankAccount?: boolean;
    isInvoiceAccount?: boolean;
  }>("/ledger/account?number=7000,1920&fields=*");

  const accountByNumber = new Map(
    (accounts.values ?? []).map((account) => [String(account.number), account]),
  );

  let bankAccount = accountByNumber.get("1920");
  if (!bankAccount) {
    const bankAccounts = await request<{
      id: number;
      number: string | number;
      name?: string;
      isBankAccount?: boolean;
      isInvoiceAccount?: boolean;
    }>("/ledger/account?isBankAccount=true&fields=*");

    bankAccount =
      (bankAccounts.values ?? []).find(
        (account) =>
          account.isInvoiceAccount === true || account.isBankAccount === true,
      ) ?? null;
  }

  const expenseAccount = accountByNumber.get("7000");
  if (!expenseAccount) {
    throw new Error("Account 7000 not found");
  }
  if (!bankAccount) {
    throw new Error("No bank account found");
  }

  const dimension = await request<{
    id: number;
    dimensionName: string;
    dimensionIndex: number;
    active: boolean;
  }>("/ledger/accountingDimensionName", {
    method: "POST",
    body: JSON.stringify({
      dimensionName: "Prosjekttype",
      active: true,
    }),
  });

  const dimensionIndex = dimension.value?.dimensionIndex;
  if (!dimensionIndex) {
    throw new Error("Missing dimensionIndex from create dimension response");
  }

  await request<{
    id: number;
    displayName: string;
    dimensionIndex: number;
  }>("/ledger/accountingDimensionValue", {
    method: "POST",
    body: JSON.stringify({
      dimensionIndex,
      displayName: "Utvikling",
      number: "1",
      position: 1,
      active: true,
      showInVoucherRegistration: true,
    }),
  });

  const internt = await request<{
    id: number;
    displayName: string;
    dimensionIndex: number;
  }>("/ledger/accountingDimensionValue", {
    method: "POST",
    body: JSON.stringify({
      dimensionIndex,
      displayName: "Internt",
      number: "2",
      position: 2,
      active: true,
      showInVoucherRegistration: true,
    }),
  });

  const freeDimensionKey = `freeAccountingDimension${dimensionIndex}`;
  const expensePosting: Record<string, unknown> = {
    row: 1,
    date: TODAY,
    description: 'Prosjekttype "Internt"',
    account: { id: expenseAccount.id },
    currency: { id: 1 },
    amount: 39700,
    amountCurrency: 39700,
    amountGross: 39700,
    amountGrossCurrency: 39700,
  };
  expensePosting[freeDimensionKey] = { id: internt.value?.id };

  const voucher = await request<{
    id: number;
    number: number;
    date: string;
    postings?: Array<{
      id: number;
      row: number;
      amount: number;
      account?: { id: number; number?: string | number };
      freeAccountingDimension1?: { id: number; displayName?: string };
      freeAccountingDimension2?: { id: number; displayName?: string };
      freeAccountingDimension3?: { id: number; displayName?: string };
    }>;
  }>("/ledger/voucher", {
    method: "POST",
    body: JSON.stringify({
      date: TODAY,
      description: 'Bilag konto 7000, Prosjekttype "Internt"',
      voucherType: null,
      postings: [
        expensePosting,
        {
          row: 2,
          date: TODAY,
          description: 'Prosjekttype "Internt"',
          account: { id: bankAccount.id },
          currency: { id: 1 },
          amount: -39700,
          amountCurrency: -39700,
          amountGross: -39700,
          amountGrossCurrency: -39700,
        },
      ],
    }),
  });

  console.log(
    JSON.stringify(
      {
        dimension: dimension.value,
        internt: internt.value,
        voucher: voucher.value,
      },
      null,
      2,
    ),
  );
}

await main();
