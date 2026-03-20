const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const DATE = "2026-03-20";
const DIMENSION_NAME = "Marked203020A";
const VALUE_NAMES = ["Offentlig", "Privat"] as const;
const TARGET_VALUE_NAME = "Privat";
const TARGET_ACCOUNT_NUMBER = 7300;
const BALANCING_ACCOUNT_NUMBER = 1920;
const AMOUNT = 37250;

type ApiResponse<T> = {
  value?: T;
  values?: T[];
};

type AccountingDimensionName = {
  id: number;
  dimensionIndex: number;
  dimensionName: string;
};

type AccountingDimensionValue = {
  id: number;
  dimensionIndex: number;
  displayName: string;
};

type Account = {
  id: number;
  number?: number;
};

type Voucher = {
  id: number;
  number: number;
  postings?: Array<{
    account?: { id: number; number?: number };
    amount?: number;
    freeAccountingDimension1?: { id: number };
    freeAccountingDimension2?: { id: number };
    freeAccountingDimension3?: { id: number };
  }>;
};

const auth = `Basic ${Buffer.from(`0:${TOKEN}`).toString("base64")}`;
const calls: Array<{ method: string; path: string; status: number }> = [];

async function request<T>(path: string, init: RequestInit = {}): Promise<ApiResponse<T>> {
  const method = init.method ?? "GET";
  const headers = new Headers(init.headers);
  headers.set("Authorization", auth);
  headers.set("Accept", "application/json");
  if (init.body !== undefined) {
    headers.set("Content-Type", "application/json; charset=utf-8");
  }

  const response = await fetch(`${BASE_URL}${path}`, { ...init, headers });
  calls.push({ method, path, status: response.status });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};

  if (!response.ok) {
    console.error(JSON.stringify({ method, path, status: response.status, body: data }, null, 2));
    process.exit(1);
  }

  return data as ApiResponse<T>;
}

function expectValue<T>(data: ApiResponse<T>, label: string): T {
  if (!data.value) throw new Error(`Missing value in ${label}`);
  return data.value;
}

function expectValues<T>(data: ApiResponse<T>, label: string): T[] {
  if (!Array.isArray(data.values)) throw new Error(`Missing values in ${label}`);
  return data.values;
}

function dimensionFieldName(index: number) {
  if (index === 1) return "freeAccountingDimension1";
  if (index === 2) return "freeAccountingDimension2";
  if (index === 3) return "freeAccountingDimension3";
  throw new Error(`Unsupported dimension index ${index}`);
}

async function main() {
  const dimension = expectValue(
    await request<AccountingDimensionName>("/ledger/accountingDimensionName", {
      method: "POST",
      body: JSON.stringify({ dimensionName: DIMENSION_NAME, active: true }),
    }),
    "dimension create",
  );

  const createdValues: AccountingDimensionValue[] = [];
  for (const displayName of VALUE_NAMES) {
    createdValues.push(
      expectValue(
        await request<AccountingDimensionValue>("/ledger/accountingDimensionValue", {
          method: "POST",
          body: JSON.stringify({
            dimensionIndex: dimension.dimensionIndex,
            displayName,
            active: true,
            showInVoucherRegistration: true,
          }),
        }),
        `dimension value ${displayName}`,
      ),
    );
  }

  const accounts = expectValues(
    await request<Account>(
      `/ledger/account?number=${TARGET_ACCOUNT_NUMBER},${BALANCING_ACCOUNT_NUMBER}&fields=*`,
    ),
    "account lookup",
  );
  const targetAccount = accounts.find((account) => account.number === TARGET_ACCOUNT_NUMBER);
  const balancingAccount = accounts.find((account) => account.number === BALANCING_ACCOUNT_NUMBER);
  if (!targetAccount || !balancingAccount) {
    throw new Error(
      `Account lookup incomplete. target=${targetAccount?.id ?? null} balancing=${balancingAccount?.id ?? null}`,
    );
  }

  const targetValue = createdValues.find((value) => value.displayName === TARGET_VALUE_NAME);
  if (!targetValue) throw new Error("Missing target value");

  const dimensionField = dimensionFieldName(dimension.dimensionIndex);
  const voucher = expectValue(
    await request<Voucher>("/ledger/voucher", {
      method: "POST",
      body: JSON.stringify({
        date: DATE,
        description: `Bilag konto ${TARGET_ACCOUNT_NUMBER}, ${DIMENSION_NAME} "${TARGET_VALUE_NAME}"`,
        voucherType: null,
        postings: [
          {
            row: 1,
            date: DATE,
            description: `${DIMENSION_NAME} "${TARGET_VALUE_NAME}"`,
            account: { id: targetAccount.id },
            currency: { id: 1 },
            amount: AMOUNT,
            amountCurrency: AMOUNT,
            amountGross: AMOUNT,
            amountGrossCurrency: AMOUNT,
            [dimensionField]: { id: targetValue.id },
          },
          {
            row: 2,
            date: DATE,
            description: `${DIMENSION_NAME} "${TARGET_VALUE_NAME}"`,
            account: { id: balancingAccount.id },
            currency: { id: 1 },
            amount: -AMOUNT,
            amountCurrency: -AMOUNT,
            amountGross: -AMOUNT,
            amountGrossCurrency: -AMOUNT,
          },
        ],
      }),
    }),
    "voucher create",
  );

  const targetPosting = voucher.postings?.find(
    (posting) => posting.account?.id === targetAccount.id && posting.amount === AMOUNT,
  );
  const linkedDimensionValueId =
    targetPosting?.freeAccountingDimension1?.id ??
    targetPosting?.freeAccountingDimension2?.id ??
    targetPosting?.freeAccountingDimension3?.id ??
    null;

  console.log(
    JSON.stringify(
      {
        calls,
        callCount: calls.length,
        dimension: {
          id: dimension.id,
          name: dimension.dimensionName,
          dimensionIndex: dimension.dimensionIndex,
        },
        values: createdValues,
        accounts,
        voucher: {
          id: voucher.id,
          number: voucher.number,
          linkedDimensionValueId,
          expectedLinkedDimensionValueId: targetValue.id,
        },
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
