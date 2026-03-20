const BASE_URL = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const SESSION_TOKEN = "wigPQjdvaV7x7YGSZSHViwFDVVLkrPIXUEOY8bQMrlE";

const TODAY = "2026-03-20";
const ORDER_ID = 401956926;
const EXPECTED_AMOUNT_EX_VAT = 56265;
const BANK_ACCOUNT_NUMBER = "12345678903";

type ListResponse<T> = {
  values?: T[];
};

type Wrapper<T> = {
  value?: T;
};

type Account = {
  id: number;
  version?: number;
  number?: number;
  name?: string;
  isBankAccount?: boolean;
  isInvoiceAccount?: boolean;
  isInactive?: boolean;
  bankAccountNumber?: string;
};

type Invoice = {
  id: number;
  amountExcludingVatCurrency?: number;
  amountCurrency?: number;
  amountCurrencyOutstanding?: number;
  customer?: { id?: number };
};

function authHeader(): string {
  return `Basic ${Buffer.from(`0:${SESSION_TOKEN}`).toString("base64")}`;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", authHeader());
  headers.set("Accept", "application/json");
  if (init.body !== undefined) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers,
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : undefined;

  if (!response.ok) {
    throw new Error(
      JSON.stringify(
        {
          method: init.method ?? "GET",
          path,
          status: response.status,
          body,
        },
        null,
        2,
      ),
    );
  }

  return body as T;
}

function chooseAccount(accounts: Account[]): Account | undefined {
  const active = accounts.filter((account) => !account.isInactive && account.isBankAccount);

  return (
    active.find((account) => account.isInvoiceAccount && account.number === 1920) ??
    active.find((account) => account.isInvoiceAccount) ??
    active[0]
  );
}

async function main(): Promise<void> {
  const accountsRes = await request<ListResponse<Account>>(
    "/ledger/account?isBankAccount=true&fields=*",
  );
  const account = chooseAccount(accountsRes.values ?? []);

  if (!account?.id) {
    throw new Error("No bank account available to repair");
  }

  const updatedAccountRes = await request<Wrapper<Account>>(`/ledger/account/${account.id}`, {
    method: "PUT",
    body: JSON.stringify({
      id: account.id,
      ...(account.version !== undefined ? { version: account.version } : {}),
      bankAccountNumber: BANK_ACCOUNT_NUMBER,
    }),
  });

  const updatedAccount = updatedAccountRes.value;
  if (!updatedAccount?.id) {
    throw new Error("Bank account update did not return an id");
  }

  const invoiceRes = await request<Wrapper<Invoice>>(
    `/order/${ORDER_ID}/:invoice?invoiceDate=${TODAY}&sendToCustomer=false`,
    {
      method: "PUT",
    },
  );

  const invoice = invoiceRes.value;
  if (!invoice?.id) {
    throw new Error("Invoice retry did not return an id");
  }

  if (invoice.amountExcludingVatCurrency !== EXPECTED_AMOUNT_EX_VAT) {
    throw new Error(
      `Invoice amountExcludingVatCurrency mismatch: expected ${EXPECTED_AMOUNT_EX_VAT}, got ${invoice.amountExcludingVatCurrency}`,
    );
  }

  console.log(
    JSON.stringify(
      {
        repairedAccountId: updatedAccount.id,
        repairedAccountNumber: updatedAccount.number,
        bankAccountNumber: updatedAccount.bankAccountNumber,
        orderId: ORDER_ID,
        invoiceId: invoice.id,
        invoiceAmountExcludingVatCurrency: invoice.amountExcludingVatCurrency,
        invoiceAmountCurrency: invoice.amountCurrency,
        invoiceAmountCurrencyOutstanding: invoice.amountCurrencyOutstanding,
      },
      null,
      2,
    ),
  );
}

await main();
