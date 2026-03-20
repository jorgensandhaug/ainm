const baseUrl = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const sessionToken = "Jlp2225tLmWL7pd2sJ7tQf4r9XHh9PIUd7Ftcwkn0jA";

const voucherDate = "2026-03-20";
const dimensionName = "Marked";
const dimensionValues = ["Offentlig", "Privat"];
const linkedValueName = "Offentlig";
const targetAccountNumber = 6340;
const balancingAccountNumber = 1920;
const amount = 25200;

const auth = `Basic ${Buffer.from(`0:${sessionToken}`).toString("base64")}`;

type ApiEnvelope<T> = {
  value?: T;
  values?: T[];
  message?: string;
  error?: string;
  source?: string;
  validationMessages?: Array<{ field?: string; message?: string }>;
};

type DimensionNameResponse = {
  id: number;
  dimensionIndex: 1 | 2 | 3;
  dimensionName: string;
  active: boolean;
};

type DimensionValueResponse = {
  id: number;
  dimensionIndex: 1 | 2 | 3;
  displayName: string;
  active: boolean;
  showInVoucherRegistration: boolean;
};

type AccountResponse = {
  id: number;
  number: number;
  name?: string;
  isBankAccount?: boolean;
  isInvoiceAccount?: boolean;
};

function endpoint(path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

async function api<T>(path: string, init?: RequestInit): Promise<{ status: number; body: ApiEnvelope<T> | null }> {
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
    const blockedByToken =
      response.status === 403 &&
      (body?.error === "Invalid or expired token" ||
        body?.error === "Invalid or expired proxy token. Each submission receives a unique token - do not reuse tokens from previous submissions.");

    if (blockedByToken) {
      throw new Error(`Blocked credentials: ${body?.error}`);
    }

    const details = body?.validationMessages
      ?.map((item) => `${item.field ?? "?"}: ${item.message ?? "?"}`)
      .join(" | ");
    throw new Error(
      `HTTP ${response.status} ${path}: ${body?.message ?? body?.error ?? "Request failed"}${details ? ` :: ${details}` : ""}`,
    );
  }

  return { status: response.status, body };
}

function pickAccount(accounts: AccountResponse[], number: number): AccountResponse {
  const account = accounts.find((item) => item.number === number);
  if (!account) {
    throw new Error(`Missing required account ${number}`);
  }
  return account;
}

async function main() {
  const dimensionCreate = await api<DimensionNameResponse>("ledger/accountingDimensionName", {
    method: "POST",
    body: JSON.stringify({
      dimensionName,
      active: true,
    }),
  });
  const dimension = dimensionCreate.body?.value;
  if (!dimension) throw new Error("Missing dimension create response");

  const createdValues = new Map<string, DimensionValueResponse>();
  for (const displayName of dimensionValues) {
    const valueCreate = await api<DimensionValueResponse>("ledger/accountingDimensionValue", {
      method: "POST",
      body: JSON.stringify({
        dimensionIndex: dimension.dimensionIndex,
        displayName,
        active: true,
        showInVoucherRegistration: true,
      }),
    });
    const value = valueCreate.body?.value;
    if (!value) throw new Error(`Missing value create response for ${displayName}`);
    createdValues.set(displayName, value);
  }

  const accountLookup = await api<AccountResponse>(`ledger/account?number=${targetAccountNumber},${balancingAccountNumber}&fields=*`);
  let accounts = accountLookup.body?.values ?? [];
  let balancingAccount: AccountResponse | undefined = accounts.find((item) => item.number === balancingAccountNumber);

  if (!balancingAccount) {
    const bankFallback = await api<AccountResponse>("ledger/account?isBankAccount=true&fields=*");
    const fallbackAccount =
      (bankFallback.body?.values ?? []).find((item) => item.isInvoiceAccount) ??
      (bankFallback.body?.values ?? []).find((item) => item.isBankAccount);
    if (!fallbackAccount) {
      throw new Error("Missing fallback bank account");
    }
    balancingAccount = fallbackAccount;
  }

  const targetAccount = pickAccount(accounts, targetAccountNumber);
  if (!balancingAccount) throw new Error("Missing balancing account");
  const linkedValue = createdValues.get(linkedValueName);
  if (!linkedValue) throw new Error(`Missing linked dimension value ${linkedValueName}`);

  const dimensionField = `freeAccountingDimension${dimension.dimensionIndex}`;
  const postingDescription = `${dimensionName} "${linkedValueName}"`;

  const voucherCreate = await api<any>("ledger/voucher", {
    method: "POST",
    body: JSON.stringify({
      date: voucherDate,
      description: `Bilag konto ${targetAccountNumber}, ${postingDescription}`,
      voucherType: null,
      postings: [
        {
          row: 1,
          date: voucherDate,
          description: postingDescription,
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
          description: postingDescription,
          account: { id: balancingAccount.id },
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
        dimension,
        values: Array.from(createdValues.values()),
        voucher: voucherCreate.body?.value ?? null,
      },
      null,
      2,
    ),
  );
}

await main();
