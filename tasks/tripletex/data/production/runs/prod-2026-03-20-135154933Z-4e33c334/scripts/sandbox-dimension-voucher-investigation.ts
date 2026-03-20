const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = `Basic ${Buffer.from(`0:${TOKEN}`).toString("base64")}`;
const TODAY = "2026-03-20";

type WrappedValue<T> = { value?: T; values?: T[]; fullResultSize?: number };

async function request<T>(
  path: string,
  init?: RequestInit,
): Promise<WrappedValue<T>> {
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
  const timestamp = Date.now().toString().slice(-6);
  const dimensionName = `Post Run Dim ${timestamp}`;
  const valueAName = `Alpha ${timestamp}`;
  const valueBName = `Beta ${timestamp}`;

  const existingDimensions = await request<{
    id: number;
    dimensionName: string;
    dimensionIndex: number;
    active: boolean;
  }>("/ledger/accountingDimensionName?fields=*");

  const beforeDimensions = existingDimensions.values ?? [];
  if (beforeDimensions.length >= 3) {
    throw new Error(
      `No free accounting dimension slots available. Existing count: ${beforeDimensions.length}`,
    );
  }

  const dimension = await request<{
    id: number;
    dimensionName: string;
    dimensionIndex: number;
    active: boolean;
  }>("/ledger/accountingDimensionName", {
    method: "POST",
    body: JSON.stringify({
      dimensionName,
      active: true,
    }),
  });

  const dimensionIndex = dimension.value?.dimensionIndex;
  if (!dimensionIndex) {
    throw new Error("Create dimension response did not return dimensionIndex");
  }

  const alpha = await request<{
    id: number;
    displayName: string;
    dimensionIndex: number;
    active: boolean;
    showInVoucherRegistration: boolean;
  }>("/ledger/accountingDimensionValue", {
    method: "POST",
    body: JSON.stringify({
      dimensionIndex,
      displayName: valueAName,
      active: true,
      showInVoucherRegistration: true,
    }),
  });

  const beta = await request<{
    id: number;
    displayName: string;
    dimensionIndex: number;
    active: boolean;
    showInVoucherRegistration: boolean;
  }>("/ledger/accountingDimensionValue", {
    method: "POST",
    body: JSON.stringify({
      dimensionIndex,
      displayName: valueBName,
      active: true,
      showInVoucherRegistration: true,
    }),
  });

  const freeDimensionKey = `freeAccountingDimension${dimensionIndex}`;
  const expensePosting: Record<string, unknown> = {
    row: 1,
    date: TODAY,
    description: `Post-run dimension proof ${timestamp}`,
    account: { number: "7000" },
    currency: { id: 1 },
    amount: 1234,
    amountCurrency: 1234,
    amountGross: 1234,
    amountGrossCurrency: 1234,
  };
  expensePosting[freeDimensionKey] = { id: beta.value?.id };

  let voucherByNumberResult: unknown = null;
  let voucherByIdResult: unknown = null;
  let fallbackAccountLookupUsed = false;

  try {
    const voucher = await request<{
      id: number;
      number: number;
      postings?: Array<{
        id: number;
        amount: number;
        account?: { id?: number; number?: string | number };
        freeAccountingDimension1?: { id: number };
        freeAccountingDimension2?: { id: number };
        freeAccountingDimension3?: { id: number };
      }>;
    }>("/ledger/voucher", {
      method: "POST",
      body: JSON.stringify({
        date: TODAY,
        description: `Dimension proof by account number ${timestamp}`,
        voucherType: null,
        postings: [
          expensePosting,
          {
            row: 2,
            date: TODAY,
            description: `Dimension proof by account number ${timestamp}`,
            account: { number: "1920" },
            currency: { id: 1 },
            amount: -1234,
            amountCurrency: -1234,
            amountGross: -1234,
            amountGrossCurrency: -1234,
          },
        ],
      }),
    });
    voucherByNumberResult = voucher.value;
  } catch (error) {
    voucherByNumberResult = {
      error: JSON.parse((error as Error).message),
    };
  }

  if (
    !voucherByNumberResult ||
    (typeof voucherByNumberResult === "object" &&
      voucherByNumberResult !== null &&
      "error" in voucherByNumberResult)
  ) {
    fallbackAccountLookupUsed = true;
    const accounts = await request<{
      id: number;
      number: string | number;
      name?: string;
    }>("/ledger/account?number=7000,1920&fields=*");

    const byNumber = new Map(
      (accounts.values ?? []).map((account) => [String(account.number), account]),
    );
    const account7000 = byNumber.get("7000");
    const account1920 = byNumber.get("1920");
    if (!account7000 || !account1920) {
      throw new Error("Could not resolve account 7000 and 1920 in fallback");
    }

    const voucher = await request<{
      id: number;
      number: number;
      postings?: Array<{
        id: number;
        amount: number;
        account?: { id?: number; number?: string | number };
        freeAccountingDimension1?: { id: number };
        freeAccountingDimension2?: { id: number };
        freeAccountingDimension3?: { id: number };
      }>;
    }>("/ledger/voucher", {
      method: "POST",
      body: JSON.stringify({
        date: TODAY,
        description: `Dimension proof by account id ${timestamp}`,
        voucherType: null,
        postings: [
          {
            row: 1,
            date: TODAY,
            description: `Dimension proof by account id ${timestamp}`,
            account: { id: account7000.id },
            currency: { id: 1 },
            amount: 1234,
            amountCurrency: 1234,
            amountGross: 1234,
            amountGrossCurrency: 1234,
            [freeDimensionKey]: { id: beta.value?.id },
          },
          {
            row: 2,
            date: TODAY,
            description: `Dimension proof by account id ${timestamp}`,
            account: { id: account1920.id },
            currency: { id: 1 },
            amount: -1234,
            amountCurrency: -1234,
            amountGross: -1234,
            amountGrossCurrency: -1234,
          },
        ],
      }),
    });
    voucherByIdResult = voucher.value;
  }

  console.log(
    JSON.stringify(
      {
        beforeDimensions: beforeDimensions.map((dimension) => ({
          id: dimension.id,
          dimensionName: dimension.dimensionName,
          dimensionIndex: dimension.dimensionIndex,
        })),
        createdDimension: dimension.value,
        createdValues: [alpha.value, beta.value],
        voucherByNumberResult,
        fallbackAccountLookupUsed,
        voucherByIdResult,
      },
      null,
      2,
    ),
  );
}

await main();
