const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const sessionToken =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const date = "2026-03-20";
const amount = 37250;
const targetAccountNumber = 7300;
const fallbackAccountNumber = 1920;
const probeDimensionName = "MK7300Proof20";
const probeValues = ["Offentlig", "Privat"] as const;

type WrappedValue<T> = { value: T };
type WrappedList<T> = { values: T[]; fullResultSize?: number };

type DimensionName = {
  id: number;
  dimensionIndex: number;
  dimensionName: string;
};

type DimensionValue = {
  id: number;
  dimensionIndex: number;
  displayName: string;
};

type LedgerAccount = {
  id: number;
  number: number;
  isBankAccount?: boolean;
  isInvoiceAccount?: boolean;
};

type ApiError = {
  status: number;
  body: unknown;
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
    const error: ApiError = { status: response.status, body };
    throw error;
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
  return (
    accounts.find((account) => account.isInvoiceAccount) ??
    accounts.find((account) => account.isBankAccount) ??
    (() => {
      throw new Error("Missing fallback bank account");
    })()
  );
}

async function resolveProbeDimensionValue(): Promise<{
  source: "created" | "existing";
  dimension?: DimensionName;
  createdValues?: DimensionValue[];
  linkedValue: DimensionValue;
}> {
  try {
    const createdDimension = await api<WrappedValue<DimensionName>>("ledger/accountingDimensionName", {
      method: "POST",
      body: JSON.stringify({
        dimensionName: probeDimensionName,
        active: true,
      }),
    });

    const createdValues: DimensionValue[] = [];
    for (const displayName of probeValues) {
      const createdValue = await api<WrappedValue<DimensionValue>>("ledger/accountingDimensionValue", {
        method: "POST",
        body: JSON.stringify({
          dimensionIndex: createdDimension.value.dimensionIndex,
          displayName,
          active: true,
          showInVoucherRegistration: true,
        }),
      });
      createdValues.push(createdValue.value);
    }

    const linkedValue = createdValues.find((value) => value.displayName === "Privat");
    if (!linkedValue) {
      throw new Error("Failed to create Privat value");
    }

    return {
      source: "created",
      dimension: createdDimension.value,
      createdValues,
      linkedValue,
    };
  } catch (error) {
    const apiError = error as ApiError;
    const maybeValidationMessages = Array.isArray((apiError.body as any)?.validationMessages)
      ? ((apiError.body as any).validationMessages as Array<{ message?: string }>)
      : [];
    const fullDimensions = maybeValidationMessages.some((message) =>
      String(message.message ?? "").includes("Maximum of 3 accounting dimensions allowed"),
    );

    if (!fullDimensions) {
      throw error;
    }

    const existingValues = await api<WrappedList<DimensionValue>>(
      "ledger/accountingDimensionValue/search?activeOnly=true&showInVoucherRegistration=true&count=1000&fields=*",
    );
    const linkedValue = existingValues.values.find((value) => value.displayName === "Privat") ?? existingValues.values[0];

    if (!linkedValue) {
      throw new Error("Sandbox is full on free dimensions and has no reusable dimension values");
    }

    return {
      source: "existing",
      linkedValue,
    };
  }
}

async function main(): Promise<void> {
  const dimensionProof = await resolveProbeDimensionValue();
  const dimensionField = `freeAccountingDimension${dimensionProof.linkedValue.dimensionIndex}` as
    | "freeAccountingDimension1"
    | "freeAccountingDimension2"
    | "freeAccountingDimension3";

  let shortcutFailure: ApiError | null = null;
  try {
    await api<WrappedValue<unknown>>("ledger/voucher", {
      method: "POST",
      body: JSON.stringify({
        date,
        description: `Shortcut probe ${targetAccountNumber}`,
        voucherType: null,
        postings: [
          {
            row: 1,
            date,
            description: "Shortcut probe",
            account: { number: targetAccountNumber },
            currency: { id: 1 },
            amount,
            amountCurrency: amount,
            amountGross: amount,
            amountGrossCurrency: amount,
            [dimensionField]: { id: dimensionProof.linkedValue.id },
          },
          {
            row: 2,
            date,
            description: "Shortcut probe",
            account: { number: fallbackAccountNumber },
            currency: { id: 1 },
            amount: -amount,
            amountCurrency: -amount,
            amountGross: -amount,
            amountGrossCurrency: -amount,
          },
        ],
      }),
    });
    throw new Error("Unexpected success for number-only voucher shortcut");
  } catch (error) {
    const apiError = error as ApiError;
    if (typeof apiError?.status !== "number") {
      throw error;
    }
    shortcutFailure = apiError;
  }

  const accountLookup = await api<WrappedList<LedgerAccount>>(
    `ledger/account?number=${targetAccountNumber},${fallbackAccountNumber}&fields=*`,
  );
  const targetAccount = requireAccount(accountLookup.values, targetAccountNumber);
  const fallbackAccount =
    accountLookup.values.find((account) => account.number === fallbackAccountNumber) ??
    selectFallbackBankAccount(
      (
        await api<WrappedList<LedgerAccount>>("ledger/account?isBankAccount=true&fields=*")
      ).values,
    );

  const voucher = await api<WrappedValue<{ id: number; number: number; postings: unknown[] }>>("ledger/voucher", {
    method: "POST",
    body: JSON.stringify({
      date,
      description: `Sandbox proof ${targetAccountNumber}`,
      voucherType: null,
      postings: [
        {
          row: 1,
          date,
          description: "Sandbox proof",
          account: { id: targetAccount.id },
          currency: { id: 1 },
          amount,
          amountCurrency: amount,
          amountGross: amount,
          amountGrossCurrency: amount,
          [dimensionField]: { id: dimensionProof.linkedValue.id },
        },
        {
          row: 2,
          date,
          description: "Sandbox proof",
          account: { id: fallbackAccount.id },
          currency: { id: 1 },
          amount: -amount,
          amountCurrency: -amount,
          amountGross: -amount,
          amountGrossCurrency: -amount,
        },
      ],
    }),
  });

  console.log(
    JSON.stringify(
      {
        dimensionProof,
        shortcutFailure,
        accountLookup: accountLookup.values,
        voucher: voucher.value,
      },
      null,
      2,
    ),
  );
}

await main();
