const BASE_URL = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "dZVCwOBIH5104n5HIbhoFCmE_bBf6wiN_qDlspT0c_g";
const DATE = "2026-03-20";
const TARGET_ACCOUNT_NUMBER = "6590";
const FALLBACK_BANK_ACCOUNT_NUMBER = "1920";
const AMOUNT = 34250;
const DIMENSION_NAME = "Kostsenter";
const DIMENSION_VALUES = ["Innkjøp", "Logistikk"] as const;
const VOUCHER_VALUE_NAME = "Innkjøp";

type WrappedValue<T> = { value: T };
type WrappedValues<T> = { values: T[]; fullResultSize?: number };

type DimensionName = {
  id: number;
  dimensionIndex: number;
  dimensionName: string;
};

type DimensionValue = {
  id: number;
  displayName: string;
  dimensionIndex: number;
};

type LedgerAccount = {
  id: number;
  number: string | number;
  name?: string;
  isBankAccount?: boolean;
  isInvoiceAccount?: boolean;
};

type VoucherResponse = {
  id: number;
  number: number;
  postings?: Array<{
    account?: { id: number; number?: string | number };
    amount?: number;
    amountCurrency?: number;
    freeAccountingDimension1?: { id: number };
    freeAccountingDimension2?: { id: number };
    freeAccountingDimension3?: { id: number };
  }>;
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

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T | null> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/json",
      Accept: "application/json",
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

function pickAccount(accounts: LedgerAccount[], accountNumber: string): LedgerAccount | undefined {
  return accounts.find((account) => String(account.number) === accountNumber);
}

function pickFallbackBankAccount(accounts: LedgerAccount[]): LedgerAccount | undefined {
  return (
    accounts.find((account) => String(account.number) === FALLBACK_BANK_ACCOUNT_NUMBER) ??
    accounts.find((account) => account.isInvoiceAccount) ??
    accounts.find((account) => account.isBankAccount) ??
    accounts[0]
  );
}

async function main() {
  if (DIMENSION_NAME.length > 20) {
    throw new Error("Blocked: dimensionName exceeds 20 characters.");
  }

  const dimensionResponse = await request<WrappedValue<DimensionName>>(
    "POST",
    "/ledger/accountingDimensionName",
    {
      dimensionName: DIMENSION_NAME,
      active: true,
    },
  );

  if (!dimensionResponse?.value) {
    throw new Error("Missing dimension create response.");
  }

  const dimension = dimensionResponse.value;

  const valueResponses: DimensionValue[] = [];
  for (const displayName of DIMENSION_VALUES) {
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

    if (!valueResponse?.value) {
      throw new Error(`Missing value create response for ${displayName}.`);
    }

    valueResponses.push(valueResponse.value);
  }

  const linkedValue = valueResponses.find((value) => value.displayName === VOUCHER_VALUE_NAME);
  if (!linkedValue) {
    throw new Error(`Missing created dimension value ${VOUCHER_VALUE_NAME}.`);
  }

  const accountSearch = await request<WrappedValues<LedgerAccount>>(
    "GET",
    `/ledger/account?number=${TARGET_ACCOUNT_NUMBER},${FALLBACK_BANK_ACCOUNT_NUMBER}&fields=*`,
  );

  const accounts = accountSearch?.values ?? [];
  const targetAccount = pickAccount(accounts, TARGET_ACCOUNT_NUMBER);
  let bankAccount = pickAccount(accounts, FALLBACK_BANK_ACCOUNT_NUMBER);

  if (!targetAccount) {
    throw new Error(`Blocked: account ${TARGET_ACCOUNT_NUMBER} not found.`);
  }

  if (!bankAccount) {
    const fallbackSearch = await request<WrappedValues<LedgerAccount>>(
      "GET",
      "/ledger/account?isBankAccount=true&fields=*",
    );
    bankAccount = pickFallbackBankAccount(fallbackSearch?.values ?? []);
  }

  if (!bankAccount) {
    throw new Error("Blocked: no bank or invoice account available for balancing line.");
  }

  const dimensionField = `freeAccountingDimension${dimension.dimensionIndex}` as
    | "freeAccountingDimension1"
    | "freeAccountingDimension2"
    | "freeAccountingDimension3";

  const voucherPayload = {
    date: DATE,
    description: `Bilag konto ${TARGET_ACCOUNT_NUMBER}, ${DIMENSION_NAME} "${VOUCHER_VALUE_NAME}"`,
    voucherType: null,
    postings: [
      {
        row: 1,
        date: DATE,
        description: `${DIMENSION_NAME} "${VOUCHER_VALUE_NAME}"`,
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
        description: `${DIMENSION_NAME} "${VOUCHER_VALUE_NAME}"`,
        account: { id: bankAccount.id },
        currency: { id: 1 },
        amount: -AMOUNT,
        amountCurrency: -AMOUNT,
        amountGross: -AMOUNT,
        amountGrossCurrency: -AMOUNT,
      },
    ],
  };

  const voucherResponse = await request<WrappedValue<VoucherResponse>>(
    "POST",
    "/ledger/voucher",
    voucherPayload,
  );

  const voucher = voucherResponse?.value;
  if (!voucher) {
    throw new Error("Missing voucher create response.");
  }

  console.log(
    JSON.stringify(
      {
        dimension: {
          id: dimension.id,
          name: dimension.dimensionName,
          dimensionIndex: dimension.dimensionIndex,
        },
        values: valueResponses.map((value) => ({
          id: value.id,
          displayName: value.displayName,
          dimensionIndex: value.dimensionIndex,
        })),
        voucher: {
          id: voucher.id,
          number: voucher.number,
          linkedDimensionField: dimensionField,
          postings: voucher.postings ?? [],
        },
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
