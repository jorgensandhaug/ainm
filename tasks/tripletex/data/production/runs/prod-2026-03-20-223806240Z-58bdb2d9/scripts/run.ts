const baseUrl = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const sessionToken = "h96AXB7uShASwAUmOw8AEokZZguPOxRhr08monjLrqw";

const voucherDate = "2026-03-20";
const dimensionName = "Marked";
const valueNames = ["Offentlig", "Privat"] as const;
const linkedValueName = "Privat";
const targetAccountNumber = 7300;
const fallbackAccountNumber = 1920;
const amount = 37250;

type WrappedValue<T> = { value: T };
type WrappedList<T> = { values: T[]; fullResultSize?: number };

type DimensionName = {
  id: number;
  dimensionIndex: number;
  dimensionName: string;
  active: boolean;
};

type DimensionValue = {
  id: number;
  dimensionIndex: number;
  displayName: string;
};

type LedgerAccount = {
  id: number;
  number: number;
  name?: string | null;
  isBankAccount?: boolean;
  isInvoiceAccount?: boolean;
};

type VoucherPosting = {
  account?: { id: number; number?: number };
  amount?: number;
  freeAccountingDimension1?: { id: number };
  freeAccountingDimension2?: { id: number };
  freeAccountingDimension3?: { id: number };
};

type Voucher = {
  id: number;
  number: number;
  postings?: VoucherPosting[];
};

function buildUrl(path: string): string {
  return new URL(path, `${baseUrl}/`).toString();
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(buildUrl(path), {
    ...init,
    headers: {
      Authorization: `Basic ${Buffer.from(`0:${sessionToken}`).toString("base64")}`,
      "Content-Type": "application/json",
      Accept: "application/json",
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

  return body as T;
}

function requireAccount(accounts: LedgerAccount[], number: number): LedgerAccount {
  const account = accounts.find((candidate) => candidate.number === number);
  if (!account) {
    throw new Error(`Missing ledger account ${number}`);
  }
  return account;
}

function selectFallbackBankAccount(accounts: LedgerAccount[]): LedgerAccount {
  const invoiceAccount = accounts.find((account) => account.isInvoiceAccount);
  if (invoiceAccount) {
    return invoiceAccount;
  }

  const bankAccount = accounts.find((account) => account.isBankAccount);
  if (bankAccount) {
    return bankAccount;
  }

  throw new Error("No bank account available for voucher balancing line");
}

async function main(): Promise<void> {
  const createdDimension = await api<WrappedValue<DimensionName>>("ledger/accountingDimensionName", {
    method: "POST",
    body: JSON.stringify({
      dimensionName,
      active: true,
    }),
  });

  const dimensionIndex = createdDimension.value.dimensionIndex;

  const createdValues: DimensionValue[] = [];
  for (const displayName of valueNames) {
    const createdValue = await api<WrappedValue<DimensionValue>>("ledger/accountingDimensionValue", {
      method: "POST",
      body: JSON.stringify({
        dimensionIndex,
        displayName,
        active: true,
        showInVoucherRegistration: true,
      }),
    });
    createdValues.push(createdValue.value);
  }

  const linkedValue = createdValues.find((value) => value.displayName === linkedValueName);
  if (!linkedValue) {
    throw new Error(`Missing created dimension value ${linkedValueName}`);
  }

  const accountLookup = await api<WrappedList<LedgerAccount>>(
    `ledger/account?number=${targetAccountNumber},${fallbackAccountNumber}&fields=*`,
  );

  const targetAccount = requireAccount(accountLookup.values, targetAccountNumber);
  let balancingAccount = accountLookup.values.find((account) => account.number === fallbackAccountNumber);

  if (!balancingAccount) {
    const fallbackLookup = await api<WrappedList<LedgerAccount>>("ledger/account?isBankAccount=true&fields=*");
    balancingAccount = selectFallbackBankAccount(fallbackLookup.values);
  }

  const dimensionField = `freeAccountingDimension${dimensionIndex}` as
    | "freeAccountingDimension1"
    | "freeAccountingDimension2"
    | "freeAccountingDimension3";
  const lineDescription = `${dimensionName} "${linkedValueName}"`;

  const voucherPayload = {
    date: voucherDate,
    description: `Bilag konto ${targetAccountNumber}, ${lineDescription}`,
    voucherType: null,
    postings: [
      {
        row: 1,
        date: voucherDate,
        description: lineDescription,
        account: { id: targetAccount.id },
        currency: { id: 1 },
        amount,
        amountCurrency: amount,
        amountGross: amount,
        amountGrossCurrency: amount,
        [dimensionField]: { id: linkedValue.id },
      },
      {
        row: 2,
        date: voucherDate,
        description: lineDescription,
        account: { id: balancingAccount.id },
        currency: { id: 1 },
        amount: -amount,
        amountCurrency: -amount,
        amountGross: -amount,
        amountGrossCurrency: -amount,
      },
    ],
  };

  const createdVoucher = await api<WrappedValue<Voucher>>("ledger/voucher", {
    method: "POST",
    body: JSON.stringify(voucherPayload),
  });

  console.log(
    JSON.stringify(
      {
        dimension: createdDimension.value,
        values: createdValues,
        voucher: createdVoucher.value,
      },
      null,
      2,
    ),
  );
}

await main();
