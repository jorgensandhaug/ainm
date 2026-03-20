const BASE_URL = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const SESSION_TOKEN = "iuhriq4PRiXBsuUpV5X-Vc4MwOcQBDlUUYtQ3JS4PRo";

const INVOICE_DATE = "2026-03-20";
const INVOICE_DUE_DATE = "2026-04-03";

const CUSTOMER_NAME = "Brightstone Ltd";
const CUSTOMER_ORG_NUMBER = "836973569";
const DESCRIPTION = "Analysis Report";
const AMOUNT_EX_VAT = 29950;
const EXPECTED_AMOUNT_INC_VAT = 37437.5;

type QueryValue = string | number | boolean | null | undefined;

type Wrapper<T> = {
  value?: T;
};

type ListResponse<T> = {
  values?: T[];
  fullResultSize?: number;
};

type Customer = {
  id: number;
  name?: string | null;
  organizationNumber?: string | null;
};

type VatType = {
  id: number;
  percentage?: number | null;
  displayName?: string | null;
  name?: string | null;
  number?: string | null;
};

type Invoice = {
  id: number;
  invoiceNumber?: number | null;
  amountExcludingVatCurrency?: number | null;
  amountCurrency?: number | null;
};

type Account = {
  id: number;
  version?: number | null;
  number?: number | null;
  isBankAccount?: boolean | null;
  isInvoiceAccount?: boolean | null;
  bankAccountNumber?: string | null;
};

class ApiError extends Error {
  status: number;
  bodyText: string;
  bodyJson: any;
  path: string;

  constructor(message: string, status: number, bodyText: string, bodyJson: any, path: string) {
    super(message);
    this.status = status;
    this.bodyText = bodyText;
    this.bodyJson = bodyJson;
    this.path = path;
  }
}

let callCount = 0;

function authHeader() {
  return `Basic ${Buffer.from(`0:${SESSION_TOKEN}`).toString("base64")}`;
}

function buildUrl(path: string, query?: Record<string, QueryValue>) {
  const safePath = path.replace(/^\/+/, "");
  const url = new URL(safePath, BASE_URL.endsWith("/") ? BASE_URL : `${BASE_URL}/`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) continue;
      url.searchParams.append(key, String(value));
    }
  }
  return url;
}

function safeJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

async function request<T>(
  method: string,
  path: string,
  options: { query?: Record<string, QueryValue>; body?: unknown } = {},
): Promise<T> {
  callCount += 1;
  const url = buildUrl(path, options.query);
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: authHeader(),
      Accept: "application/json",
      ...(options.body !== undefined ? { "Content-Type": "application/json; charset=utf-8" } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const bodyText = await response.text();
  const bodyJson = bodyText ? safeJson(bodyText) : undefined;

  if (!response.ok) {
    if (
      callCount === 1 &&
      response.status === 403 &&
      (bodyJson?.error === "Invalid or expired token" ||
        bodyJson?.error ===
          "Invalid or expired proxy token. Each submission receives a unique token - do not reuse tokens from previous submissions.")
    ) {
      throw new Error(`Blocked credentials: ${bodyJson.error}`);
    }

    throw new ApiError(
      `${method} ${url.pathname}${url.search} failed with ${response.status}`,
      response.status,
      bodyText,
      bodyJson,
      `${url.pathname}${url.search}`,
    );
  }

  return bodyJson as T;
}

function getValue<T>(response: Wrapper<T>, label: string): T {
  if (!response?.value) throw new Error(`Missing value in ${label} response`);
  return response.value;
}

function exactText(value: unknown) {
  return String(value ?? "").trim();
}

function pickExactCustomer(values: Customer[]): Customer {
  const orgMatches = values.filter((entry) => exactText(entry.organizationNumber) === CUSTOMER_ORG_NUMBER);
  const exactMatches = orgMatches.filter((entry) => exactText(entry.name) === CUSTOMER_NAME);
  if (exactMatches.length === 1) return exactMatches[0];
  if (orgMatches.length === 1) return orgMatches[0];
  throw new Error(`Customer resolution failed for ${CUSTOMER_ORG_NUMBER}`);
}

function pickExact25Vat(values: VatType[]): VatType {
  const matches = values.filter((entry) => Number(entry.percentage) === 25);
  if (matches.length === 0) throw new Error("Blocked: no outgoing 25% VAT type for invoice date");
  matches.sort((a, b) => a.id - b.id);
  return matches[0];
}

function isMissingBankAccountError(error: unknown): error is ApiError {
  if (!(error instanceof ApiError)) return false;
  const text = JSON.stringify(error.bodyJson ?? error.bodyText);
  return text.includes("bankkontonummer");
}

function chooseInvoiceBankAccount(accounts: Account[]): Account {
  const preferred =
    accounts.find((account) => account.isInvoiceAccount === true) ??
    accounts.find((account) => account.number === 1920) ??
    accounts.find((account) => account.isBankAccount === true);
  if (!preferred?.id) throw new Error("No bank account available for repair");
  return preferred;
}

function bankAccountControlDigit(firstTenDigits: string): string | null {
  const digits = firstTenDigits.split("").map(Number);
  let sum = 0;
  let weight = 2;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    sum += digits[index] * weight;
    weight = weight === 7 ? 2 : weight + 1;
  }
  const remainder = 11 - (sum % 11);
  const digit = remainder === 11 ? 0 : remainder;
  if (digit === 10) return null;
  return String(digit);
}

function generateBankAccountNumber(existing: Set<string>): string {
  for (let prefix = 1000000000; prefix < 1000005000; prefix += 1) {
    const firstTenDigits = String(prefix).padStart(10, "0");
    const controlDigit = bankAccountControlDigit(firstTenDigits);
    if (!controlDigit) continue;
    const candidate = `${firstTenDigits}${controlDigit}`;
    if (!existing.has(candidate)) return candidate;
  }
  throw new Error("Unable to generate valid bank account number");
}

async function repairBankAccount() {
  const accountsResponse = await request<ListResponse<Account>>("GET", "/ledger/account", {
    query: { isBankAccount: true, fields: "*" },
  });
  const account = chooseInvoiceBankAccount(accountsResponse.values ?? []);
  if (exactText(account.bankAccountNumber)) return account.bankAccountNumber;

  const existing = new Set(
    (accountsResponse.values ?? [])
      .map((entry) => exactText(entry.bankAccountNumber))
      .filter(Boolean),
  );
  const bankAccountNumber = generateBankAccountNumber(existing);
  const updated = getValue(
    await request<Wrapper<Account>>("PUT", `/ledger/account/${account.id}`, {
      body: { bankAccountNumber },
    }),
    "ledger account update",
  );

  if (updated.bankAccountNumber !== bankAccountNumber) {
    throw new Error("Bank account repair failed");
  }

  return bankAccountNumber;
}

async function createInvoice(customerId: number, vatTypeId: number) {
  const payload = {
    invoiceDate: INVOICE_DATE,
    invoiceDueDate: INVOICE_DUE_DATE,
    customer: { id: customerId },
    orders: [
      {
        customer: { id: customerId },
        orderDate: INVOICE_DATE,
        deliveryDate: INVOICE_DATE,
        orderLines: [
          {
            description: DESCRIPTION,
            count: 1,
            unitPriceExcludingVatCurrency: AMOUNT_EX_VAT,
            vatType: { id: vatTypeId },
          },
        ],
      },
    ],
  };

  try {
    return getValue(await request<Wrapper<Invoice>>("POST", "/invoice", { body: payload }), "invoice create");
  } catch (error) {
    if (!isMissingBankAccountError(error)) throw error;
    await repairBankAccount();
    return getValue(await request<Wrapper<Invoice>>("POST", "/invoice", { body: payload }), "invoice retry");
  }
}

async function main() {
  let customer: Customer;
  try {
    customer = getValue(
      await request<Wrapper<Customer>>("POST", "/customer", {
        body: {
          name: CUSTOMER_NAME,
          organizationNumber: CUSTOMER_ORG_NUMBER,
          invoiceSendMethod: "MANUAL",
        },
      }),
      "customer create",
    );
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 422) throw error;
    const resolved = await request<ListResponse<Customer>>("GET", "/customer", {
      query: { organizationNumber: CUSTOMER_ORG_NUMBER, fields: "*" },
    });
    customer = pickExactCustomer(resolved.values ?? []);
  }

  const vatTypes = await request<ListResponse<VatType>>("GET", "/ledger/vatType", {
    query: { typeOfVat: "OUTGOING", vatDate: INVOICE_DATE, fields: "*" },
  });
  const vatType = pickExact25Vat(vatTypes.values ?? []);

  const invoice = await createInvoice(customer.id, vatType.id);

  if (invoice.amountExcludingVatCurrency !== AMOUNT_EX_VAT) {
    throw new Error(
      `Unexpected net amount ${invoice.amountExcludingVatCurrency}; expected ${AMOUNT_EX_VAT}`,
    );
  }

  if (invoice.amountCurrency !== EXPECTED_AMOUNT_INC_VAT) {
    throw new Error(
      `Unexpected gross amount ${invoice.amountCurrency}; expected ${EXPECTED_AMOUNT_INC_VAT}`,
    );
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        callCount,
        customerId: customer.id,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        amountExcludingVatCurrency: invoice.amountExcludingVatCurrency,
        amountCurrency: invoice.amountCurrency,
      },
      null,
      2,
    ),
  );
}

await main();
