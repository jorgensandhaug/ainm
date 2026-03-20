const BASE_URL = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "HhLGewN4hhC1auP2F61TAD_k4uvN5uH3Jx1xnovoY50";
const DATE = "2026-03-20";
const DIMENSION_NAME = "Marked";
const VALUE_NAMES = ["Offentlig", "Privat"] as const;
const TARGET_VALUE_NAME = "Privat";
const TARGET_ACCOUNT_NUMBER = "7300";
const DEFAULT_BALANCING_ACCOUNT_NUMBER = "1920";
const AMOUNT = 37250;

type ApiResponse<T> = {
  value?: T;
  values?: T[];
  [key: string]: unknown;
};

type AccountingDimensionName = {
  id: number;
  dimensionIndex: number;
  dimensionName: string;
  active: boolean;
};

type AccountingDimensionValue = {
  id: number;
  dimensionIndex: number;
  displayName: string;
  active: boolean;
  showInVoucherRegistration: boolean;
};

type Account = {
  id: number;
  number?: number;
  name?: string;
  isBankAccount?: boolean;
  isInvoiceAccount?: boolean;
};

type Posting = {
  id?: number;
  account?: { id: number; number?: string };
  amount?: number;
  freeAccountingDimension1?: { id: number };
  freeAccountingDimension2?: { id: number };
  freeAccountingDimension3?: { id: number };
};

type Voucher = {
  id: number;
  number: number;
  postings?: Posting[];
};

const auth = `Basic ${Buffer.from(`0:${TOKEN}`).toString("base64")}`;

async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<ApiResponse<T>> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", auth);
  headers.set("Accept", "application/json");
  if (init.body !== undefined) {
    headers.set("Content-Type", "application/json; charset=utf-8");
  }

  const response = await fetch(`${BASE_URL}${path}`, { ...init, headers });
  const text = await response.text();
  const data = text ? JSON.parse(text) : undefined;

  if (!response.ok) {
    console.error(
      JSON.stringify(
        {
          path,
          status: response.status,
          statusText: response.statusText,
          body: data ?? text,
        },
        null,
        2,
      ),
    );
    process.exit(1);
  }

  return (data ?? {}) as ApiResponse<T>;
}

function expectValue<T>(data: ApiResponse<T>, label: string): T {
  if (!data.value) {
    throw new Error(`Missing value in ${label} response`);
  }
  return data.value;
}

function expectValues<T>(data: ApiResponse<T>, label: string): T[] {
  if (!Array.isArray(data.values)) {
    throw new Error(`Missing values in ${label} response`);
  }
  return data.values;
}

function findAccount(accounts: Account[], number: string): Account | undefined {
  const numericNumber = Number(number);
  return accounts.find((account) => account.number === numericNumber);
}

function pickFallbackBankAccount(accounts: Account[]): Account | undefined {
  return (
    accounts.find(
      (account) => account.number === Number(DEFAULT_BALANCING_ACCOUNT_NUMBER),
    ) ??
    accounts.find(
      (account) => account.isBankAccount && account.isInvoiceAccount,
    ) ??
    accounts.find((account) => account.isBankAccount) ??
    accounts[0]
  );
}

function dimensionFieldName(index: number): "freeAccountingDimension1" | "freeAccountingDimension2" | "freeAccountingDimension3" {
  if (index === 1) return "freeAccountingDimension1";
  if (index === 2) return "freeAccountingDimension2";
  if (index === 3) return "freeAccountingDimension3";
  throw new Error(`Unsupported dimension index ${index}`);
}

async function main() {
  if (DIMENSION_NAME.length > 20) {
    throw new Error("Dimension name exceeds 20 characters");
  }

  const existingDimensions = expectValues(
    await request<AccountingDimensionName>(
      "/ledger/accountingDimensionName?activeOnly=true&fields=*&count=1000",
    ),
    "dimension list",
  );
  let dimension =
    existingDimensions.find((item) => item.dimensionName === DIMENSION_NAME) ??
    null;
  if (!dimension) {
    dimension = expectValue(
      await request<AccountingDimensionName>("/ledger/accountingDimensionName", {
        method: "POST",
        body: JSON.stringify({
          dimensionName: DIMENSION_NAME,
          active: true,
        }),
      }),
      "dimension create",
    );
  }

  const existingDimensionValues = expectValues(
    await request<AccountingDimensionValue>(
      `/ledger/accountingDimensionValue/search?dimensionIndex=${dimension.dimensionIndex}&activeOnly=true&showInVoucherRegistration=true&fields=*&count=1000`,
    ),
    "dimension value search",
  );
  const createdValues: AccountingDimensionValue[] = [];
  for (const displayName of VALUE_NAMES) {
    let value =
      existingDimensionValues.find((item) => item.displayName === displayName) ??
      null;
    if (!value) {
      value = expectValue(
        await request<AccountingDimensionValue>("/ledger/accountingDimensionValue", {
          method: "POST",
          body: JSON.stringify({
            dimensionIndex: dimension.dimensionIndex,
            displayName,
            active: true,
            showInVoucherRegistration: true,
          }),
        }),
        `dimension value create ${displayName}`,
      );
    }
    createdValues.push(value);
  }

  const targetDimensionValue = createdValues.find(
    (value) => value.displayName === TARGET_VALUE_NAME,
  );
  if (!targetDimensionValue) {
    throw new Error(`Missing created target value ${TARGET_VALUE_NAME}`);
  }

  let accounts = expectValues(
    await request<Account>(
      `/ledger/account?number=${encodeURIComponent(
        `${TARGET_ACCOUNT_NUMBER},${DEFAULT_BALANCING_ACCOUNT_NUMBER}`,
      )}&fields=*`,
    ),
    "account lookup",
  );

  let targetAccount = findAccount(accounts, TARGET_ACCOUNT_NUMBER);
  let balancingAccount = findAccount(accounts, DEFAULT_BALANCING_ACCOUNT_NUMBER);

  if (!balancingAccount) {
    accounts = expectValues(
      await request<Account>("/ledger/account?isBankAccount=true&fields=*"),
      "bank account fallback lookup",
    );
    balancingAccount = pickFallbackBankAccount(accounts);
  }

  if (!targetAccount) {
    throw new Error(`Could not resolve account ${TARGET_ACCOUNT_NUMBER}`);
  }
  if (!balancingAccount) {
    throw new Error("Could not resolve balancing bank account");
  }

  const dimensionField = dimensionFieldName(dimension.dimensionIndex);
  const voucherPayload: Record<string, unknown> = {
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
        [dimensionField]: { id: targetDimensionValue.id },
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
  };

  const voucher = expectValue(
    await request<Voucher>("/ledger/voucher", {
      method: "POST",
      body: JSON.stringify(voucherPayload),
    }),
    "voucher create",
  );

  const targetPosting = voucher.postings?.find(
    (posting) =>
      posting.account?.id === targetAccount.id && posting.amount === AMOUNT,
  );

  const linkedValueId =
    targetPosting?.freeAccountingDimension1?.id ??
    targetPosting?.freeAccountingDimension2?.id ??
    targetPosting?.freeAccountingDimension3?.id;

  console.log(
    JSON.stringify(
      {
        dimension: {
          id: dimension.id,
          name: dimension.dimensionName,
          dimensionIndex: dimension.dimensionIndex,
        },
        values: createdValues.map((value) => ({
          id: value.id,
          displayName: value.displayName,
        })),
        voucher: {
          id: voucher.id,
          number: voucher.number,
          targetAccountId: targetAccount.id,
          targetAccountNumber: TARGET_ACCOUNT_NUMBER,
          amount: AMOUNT,
          linkedDimensionValueId: linkedValueId,
          expectedLinkedDimensionValueId: targetDimensionValue.id,
          balancingAccountId: balancingAccount.id,
          balancingAccountNumber: balancingAccount.number,
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
