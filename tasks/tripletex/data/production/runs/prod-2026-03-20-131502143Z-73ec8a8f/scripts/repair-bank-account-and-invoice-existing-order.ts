import { Buffer } from "node:buffer";

const BASE_URL = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "fYqFTMm2cJ3OOAMyx3JRqVhc7OxN0KPdwlMXsP8yO04";

const TODAY = "2026-03-20";
const ORDER_ID = 401956935;

const auth = `Basic ${Buffer.from(`0:${TOKEN}`).toString("base64")}`;

type Json = Record<string, any>;

async function api<T = any>(
  method: string,
  path: string,
  options: {
    query?: Record<string, string | number | boolean | undefined>;
    body?: unknown;
  } = {},
): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: auth,
      Accept: "application/json",
      ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const error = new Error(`${method} ${url.pathname}${url.search} -> ${response.status}`);
    (error as any).details = data;
    throw error;
  }

  return data as T;
}

function controlDigit(firstTen: string): string | null {
  const digits = firstTen.split("").map(Number);
  let sum = 0;
  let weight = 2;
  for (let i = digits.length - 1; i >= 0; i--) {
    sum += digits[i] * weight;
    weight = weight === 7 ? 2 : weight + 1;
  }
  const remainder = 11 - (sum % 11);
  const digit = remainder === 11 ? 0 : remainder;
  if (digit === 10) return null;
  return String(digit);
}

function generateBankAccountNumber(existing: Set<string>): string {
  for (let prefix = 1000000000; prefix < 1000005000; prefix++) {
    const firstTen = String(prefix).padStart(10, "0");
    const digit = controlDigit(firstTen);
    if (!digit) continue;
    const candidate = `${firstTen}${digit}`;
    if (!existing.has(candidate)) return candidate;
  }
  throw new Error("Could not generate unique bank account number");
}

function pickInvoiceBankAccount(values: any[]): any | undefined {
  return (
    values.find((account) => account?.isInvoiceAccount && Number(account?.number) === 1920) ??
    values.find((account) => account?.isInvoiceAccount) ??
    values[0]
  );
}

async function main() {
  const accounts = await api<Json>("GET", "/ledger/account", {
    query: {
      isBankAccount: true,
      fields: "*",
    },
  });

  const bankAccounts = accounts.values ?? [];
  const invoiceAccount = pickInvoiceBankAccount(bankAccounts);
  if (!invoiceAccount?.id) {
    throw new Error("No bank account ledger account found");
  }

  let repairedAccount = invoiceAccount;
  if (!invoiceAccount.bankAccountNumber) {
    const existingNumbers = new Set(
      bankAccounts
        .map((account: any) => String(account?.bankAccountNumber ?? "").trim())
        .filter(Boolean),
    );
    const bankAccountNumber = generateBankAccountNumber(existingNumbers);
    const update = await api<Json>("PUT", `/ledger/account/${invoiceAccount.id}`, {
      body: { bankAccountNumber },
    });
    repairedAccount = update.value;
  }

  const invoiceCreate = await api<Json>("PUT", `/order/${ORDER_ID}/:invoice`, {
    query: {
      invoiceDate: TODAY,
      sendToCustomer: false,
    },
  });

  let invoice = invoiceCreate.value;
  if (!invoice?.orders?.[0]?.project?.id) {
    const invoiceVerify = await api<Json>("GET", `/invoice/${invoice.id}`, {
      query: {
        fields: "*,orders(*,project(*),orderLines(*)),orderLines(*)",
      },
    });
    invoice = invoiceVerify.value;
  }

  console.log(
    JSON.stringify(
      {
        repairedAccountId: repairedAccount.id,
        repairedAccountNumber: repairedAccount.number,
        bankAccountNumber: repairedAccount.bankAccountNumber,
        invoiceId: invoice.id,
        customerId: invoice.customer?.id,
        amountExcludingVatCurrency: invoice.amountExcludingVatCurrency,
        amountCurrencyOutstanding: invoice.amountCurrencyOutstanding,
        linkedProjectId: invoice.orders?.[0]?.project?.id,
      },
      null,
      2,
    ),
  );
}

await main().catch((error: any) => {
  console.error(error?.message ?? error);
  if (error?.details) {
    console.error(JSON.stringify(error.details, null, 2));
  }
  process.exit(1);
});
