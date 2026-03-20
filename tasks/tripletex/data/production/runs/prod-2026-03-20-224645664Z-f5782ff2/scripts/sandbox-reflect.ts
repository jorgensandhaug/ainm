const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const sessionToken =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const auth = `Basic ${Buffer.from(`0:${sessionToken}`).toString("base64")}`;
const voucherDate = "2026-03-20";

type ApiEnvelope<T> = {
  value?: T;
  values?: T[];
  message?: string;
  error?: string;
  validationMessages?: Array<{ field?: string; message?: string }>;
};

type DimensionName = {
  id: number;
  dimensionIndex: 1 | 2 | 3;
  dimensionName: string;
};

type DimensionValue = {
  id: number;
  dimensionIndex: 1 | 2 | 3;
  displayName: string;
};

type Account = {
  id: number;
  number: number;
  isBankAccount?: boolean;
  isInvoiceAccount?: boolean;
};

type ApiError = Error & {
  status?: number;
  body?: ApiEnvelope<unknown> | null;
};

function endpoint(path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

async function api<T>(path: string, init?: RequestInit): Promise<ApiEnvelope<T> | null> {
  const response = await fetch(endpoint(path), {
    ...init,
    headers: {
      Authorization: auth,
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const text = await response.text();
  const body = text ? (JSON.parse(text) as ApiEnvelope<T>) : null;
  if (!response.ok) {
    const error = new Error(`HTTP ${response.status} ${path}`) as ApiError;
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body;
}

function findAccount(accounts: Account[], number: number): Account {
  const account = accounts.find((item) => item.number === number);
  if (!account) throw new Error(`Missing account ${number}`);
  return account;
}

async function exactCreateProof() {
  const dimensionName = `MRK${Date.now().toString().slice(-8)}`;
  const dimension = (await api<DimensionName>("ledger/accountingDimensionName", {
    method: "POST",
    body: JSON.stringify({ dimensionName, active: true }),
  }))?.value;
  if (!dimension) throw new Error("Missing exact proof dimension");

  const valueA = (
    await api<DimensionValue>("ledger/accountingDimensionValue", {
      method: "POST",
      body: JSON.stringify({
        dimensionIndex: dimension.dimensionIndex,
        displayName: "Offentlig",
        active: true,
        showInVoucherRegistration: true,
      }),
    })
  )?.value;
  const valueB = (
    await api<DimensionValue>("ledger/accountingDimensionValue", {
      method: "POST",
      body: JSON.stringify({
        dimensionIndex: dimension.dimensionIndex,
        displayName: "Privat",
        active: true,
        showInVoucherRegistration: true,
      }),
    })
  )?.value;
  if (!valueA || !valueB) throw new Error("Missing exact proof values");

  const accounts = (await api<Account>("ledger/account?number=6340,1920&fields=*"))?.values ?? [];
  const account6340 = findAccount(accounts, 6340);
  const account1920 = findAccount(accounts, 1920);
  const dimensionField = `freeAccountingDimension${dimension.dimensionIndex}`;

  const voucher = (
    await api<any>("ledger/voucher", {
      method: "POST",
      body: JSON.stringify({
        date: voucherDate,
        description: `Bilag konto 6340, ${dimensionName} "Offentlig"`,
        voucherType: null,
        postings: [
          {
            row: 1,
            date: voucherDate,
            description: `${dimensionName} "Offentlig"`,
            account: { id: account6340.id },
            currency: { id: 1 },
            amount: 25200,
            amountCurrency: 25200,
            amountGross: 25200,
            amountGrossCurrency: 25200,
            [dimensionField]: { id: valueA.id },
          },
          {
            row: 2,
            date: voucherDate,
            description: `${dimensionName} "Offentlig"`,
            account: { id: account1920.id },
            currency: { id: 1 },
            amount: -25200,
            amountCurrency: -25200,
            amountGross: -25200,
            amountGrossCurrency: -25200,
          },
        ],
      }),
    })
  )?.value;

  return {
    mode: "exact-create-proof",
    dimension,
    values: [valueA, valueB],
    voucher,
  };
}

async function fullDimensionFallbackProof() {
  const existingValue = (await api<DimensionValue>("ledger/accountingDimensionValue/15253?fields=*"))?.value;
  if (!existingValue) throw new Error("Missing fallback dimension value 15253");

  const dimensionField = `freeAccountingDimension${existingValue.dimensionIndex}`;
  let numberOnlyError: ApiEnvelope<unknown> | null = null;
  try {
    await api("ledger/voucher", {
      method: "POST",
      body: JSON.stringify({
        date: voucherDate,
        description: 'Fallback proof 6340 "Offentlig"',
        voucherType: null,
        postings: [
          {
            row: 1,
            date: voucherDate,
            description: 'Fallback proof "Offentlig"',
            account: { number: 6340 },
            currency: { id: 1 },
            amount: 25200,
            amountCurrency: 25200,
            amountGross: 25200,
            amountGrossCurrency: 25200,
            [dimensionField]: { id: existingValue.id },
          },
          {
            row: 2,
            date: voucherDate,
            description: 'Fallback proof "Offentlig"',
            account: { number: 1920 },
            currency: { id: 1 },
            amount: -25200,
            amountCurrency: -25200,
            amountGross: -25200,
            amountGrossCurrency: -25200,
          },
        ],
      }),
    });
    throw new Error("Unexpected number-only voucher success");
  } catch (error) {
    const apiError = error as ApiError;
    if (apiError.status !== 422) throw error;
    numberOnlyError = apiError.body;
  }

  const accounts = (await api<Account>("ledger/account?number=6340,1920&fields=*"))?.values ?? [];
  const voucher = (
    await api<any>("ledger/voucher", {
      method: "POST",
      body: JSON.stringify({
        date: voucherDate,
        description: 'Fallback proof 6340 "Offentlig"',
        voucherType: null,
        postings: [
          {
            row: 1,
            date: voucherDate,
            description: 'Fallback proof "Offentlig"',
            account: { id: findAccount(accounts, 6340).id },
            currency: { id: 1 },
            amount: 25200,
            amountCurrency: 25200,
            amountGross: 25200,
            amountGrossCurrency: 25200,
            [dimensionField]: { id: existingValue.id },
          },
          {
            row: 2,
            date: voucherDate,
            description: 'Fallback proof "Offentlig"',
            account: { id: findAccount(accounts, 1920).id },
            currency: { id: 1 },
            amount: -25200,
            amountCurrency: -25200,
            amountGross: -25200,
            amountGrossCurrency: -25200,
          },
        ],
      }),
    })
  )?.value;

  return {
    mode: "full-dimension-fallback-proof",
    existingValue,
    numberOnlyError,
    voucher,
  };
}

async function main() {
  try {
    const exact = await exactCreateProof();
    console.log(JSON.stringify(exact, null, 2));
  } catch (error) {
    const apiError = error as ApiError;
    const validationMessages = apiError.body?.validationMessages ?? [];
    const fullDimension =
      apiError.status === 422 &&
      validationMessages.some((item) => item.message?.includes("Maximum of 3 accounting dimensions allowed"));
    if (!fullDimension) throw error;

    const fallback = await fullDimensionFallbackProof();
    console.log(
      JSON.stringify(
        {
          mode: "dimension-slots-full",
          createError: apiError.body,
          fallback,
        },
        null,
        2,
      ),
    );
  }
}

await main();
