const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const DATE = "2026-03-20";
const TARGET_ACCOUNT_NUMBER = "6590";
const BALANCING_ACCOUNT_NUMBER = "1920";
const AMOUNT = 34250;
const DIMENSION_NAME = "KS154433946";
const VALUE_NAMES = ["Innkjøp", "Logistikk"] as const;
const LINKED_VALUE_NAME = "Innkjøp";

type WrappedValue<T> = { value: T };
type WrappedValues<T> = { values: T[]; fullResultSize?: number };

type DimensionName = {
  id: number;
  dimensionName: string;
  dimensionIndex: number;
  active: boolean;
};

type DimensionValue = {
  id: number;
  displayName: string;
  dimensionIndex: number;
  showInVoucherRegistration: boolean;
};

type LedgerAccount = {
  id: number;
  number: string | number;
  name?: string;
};

type VoucherPosting = {
  account?: { id: number; number?: string | number };
  amount?: number;
  amountCurrency?: number;
  freeAccountingDimension1?: { id: number };
  freeAccountingDimension2?: { id: number };
  freeAccountingDimension3?: { id: number };
};

type Voucher = {
  id: number;
  number: number;
  description?: string;
  postings?: VoucherPosting[];
};

class ApiError extends Error {
  status: number;
  body: string;

  constructor(status: number, body: string) {
    super(`HTTP ${status}: ${body}`);
    this.status = status;
    this.body = body;
  }
}

const authHeader = `Basic ${Buffer.from(`0:${TOKEN}`).toString("base64")}`;

async function request<T>(method: string, path: string, body?: unknown): Promise<T | null> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: authHeader,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (response.status === 204) {
    return null;
  }

  const text = await response.text();
  if (!response.ok) {
    throw new ApiError(response.status, text);
  }

  return text ? (JSON.parse(text) as T) : null;
}

function findAccount(accounts: LedgerAccount[], number: string) {
  return accounts.find((account) => String(account.number) === number);
}

async function main() {
  const dimensionResponse = await request<WrappedValue<DimensionName>>(
    "POST",
    "/ledger/accountingDimensionName",
    {
      dimensionName: DIMENSION_NAME,
      active: true,
    },
  );
  const dimension = dimensionResponse?.value;
  if (!dimension) {
    throw new Error("Missing dimension response.");
  }

  const createdValues: DimensionValue[] = [];
  for (const displayName of VALUE_NAMES) {
    const valueResponse = await request<WrappedValue<DimensionValue>>(
      "POST",
      "/ledger/accountingDimensionValue",
      {
        dimensionIndex: dimension.dimensionIndex,
        displayName,
        active: true,
        showInVoucherRegistration: true,
      },
    );
    const value = valueResponse?.value;
    if (!value) {
      throw new Error(`Missing value response for ${displayName}.`);
    }
    createdValues.push(value);
  }

  const linkedValue = createdValues.find((value) => value.displayName === LINKED_VALUE_NAME);
  if (!linkedValue) {
    throw new Error(`Missing linked value ${LINKED_VALUE_NAME}.`);
  }

  const accountsResponse = await request<WrappedValues<LedgerAccount>>(
    "GET",
    `/ledger/account?number=${TARGET_ACCOUNT_NUMBER},${BALANCING_ACCOUNT_NUMBER}&fields=*`,
  );
  const accounts = accountsResponse?.values ?? [];
  const targetAccount = findAccount(accounts, TARGET_ACCOUNT_NUMBER);
  const balancingAccount = findAccount(accounts, BALANCING_ACCOUNT_NUMBER);
  if (!targetAccount || !balancingAccount) {
    throw new Error("Missing target or balancing account.");
  }

  const dimensionField = `freeAccountingDimension${dimension.dimensionIndex}` as
    | "freeAccountingDimension1"
    | "freeAccountingDimension2"
    | "freeAccountingDimension3";

  const voucherResponse = await request<WrappedValue<Voucher>>("POST", "/ledger/voucher", {
    date: DATE,
    description: `Bilag konto ${TARGET_ACCOUNT_NUMBER}, ${DIMENSION_NAME} "${LINKED_VALUE_NAME}"`,
    voucherType: null,
    postings: [
      {
        row: 1,
        date: DATE,
        description: `${DIMENSION_NAME} "${LINKED_VALUE_NAME}"`,
        account: { id: targetAccount.id },
        currency: { id: 1 },
        amount: AMOUNT,
        amountCurrency: AMOUNT,
        amountGross: AMOUNT,
        amountGrossCurrency: AMOUNT,
        [dimensionField]: { id: linkedValue.id },
      },
      {
        row: 2,
        date: DATE,
        description: `${DIMENSION_NAME} "${LINKED_VALUE_NAME}"`,
        account: { id: balancingAccount.id },
        currency: { id: 1 },
        amount: -AMOUNT,
        amountCurrency: -AMOUNT,
        amountGross: -AMOUNT,
        amountGrossCurrency: -AMOUNT,
      },
    ],
  });

  const voucher = voucherResponse?.value;
  if (!voucher) {
    throw new Error("Missing voucher response.");
  }

  console.log(
    JSON.stringify(
      {
        dimension,
        values: createdValues,
        voucher: {
          id: voucher.id,
          number: voucher.number,
          description: voucher.description,
          postings: voucher.postings ?? [],
        },
        linkedDimensionField: dimensionField,
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  if (error instanceof ApiError) {
    console.error(error.message);
  } else if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error(String(error));
  }
  process.exit(1);
});
