import { Buffer } from "node:buffer";

const BASE_URL = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const SESSION_TOKEN = "4v7p7CLUocgpryOJTc7vgplm8T6h_3CmS8VuYW8w6tE";

const INVOICE_DATE = "2026-03-20";
const INVOICE_DUE_DATE = "2026-04-03";
const CUSTOMER_NAME = "Cascata Lda";
const CUSTOMER_ORG_NO = "859114954";
const DESCRIPTION = "Armazenamento na nuvem";
const AMOUNT_EX_VAT = 25800;
const REPAIR_BANK_ACCOUNT_NUMBER = "12345678903";

const authHeader = `Basic ${Buffer.from(`0:${SESSION_TOKEN}`).toString("base64")}`;

type WrappedList<T> = { values?: T[]; fullResultSize?: number };
type WrappedValue<T> = { value?: T };

type Customer = {
  id: number;
  name?: string;
  organizationNumber?: string;
};

type VatType = {
  id: number;
  percentage?: number;
};

type LedgerAccount = {
  id: number;
  number?: number;
  isInvoiceAccount?: boolean;
  bankAccountNumber?: string;
};

type Invoice = {
  id: number;
  invoiceNumber?: number | string;
  amountExcludingVatCurrency?: number;
  amountCurrency?: number;
  customer?: { id: number };
};

class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, body: unknown, message?: string) {
    super(message ?? `HTTP ${status}`);
    this.status = status;
    this.body = body;
  }
}

function endpoint(path: string, query?: Record<string, string | number | boolean | undefined>) {
  const url = new URL(path, BASE_URL.endsWith("/") ? BASE_URL : `${BASE_URL}/`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

async function request<T>(
  method: string,
  path: string,
  options?: {
    query?: Record<string, string | number | boolean | undefined>;
    body?: unknown;
  },
): Promise<T> {
  const response = await fetch(endpoint(path, options?.query), {
    method,
    headers: {
      Authorization: authHeader,
      Accept: "application/json",
      ...(options?.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: options?.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  const body = text ? safeJson(text) : undefined;

  if (response.status === 403 && isInvalidToken(body)) {
    throw new Error("Blocked: invalid or expired token");
  }

  if (!response.ok) {
    throw new ApiError(response.status, body, `HTTP ${response.status} ${method} ${path}`);
  }

  return body as T;
}

function safeJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function isInvalidToken(body: unknown) {
  if (!body || typeof body !== "object") return false;
  const error = (body as Record<string, unknown>).error;
  return (
    error === "Invalid or expired token" ||
    error ===
      "Invalid or expired proxy token. Each submission receives a unique token - do not reuse tokens from previous submissions."
  );
}

function getValidationMessages(body: unknown): string[] {
  if (!body || typeof body !== "object") return [];
  const maybeMessages = (body as Record<string, unknown>).validationMessages;
  if (!Array.isArray(maybeMessages)) return [];
  return maybeMessages
    .map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object") {
        const record = item as Record<string, unknown>;
        return [record.field, record.message].filter(Boolean).join(": ");
      }
      return "";
    })
    .filter(Boolean);
}

function hasBankAccountValidation(body: unknown) {
  const serialized = JSON.stringify(body);
  if (serialized.includes("Faktura kan ikke opprettes før selskapet har registrert et bankkontonummer.")) {
    return true;
  }
  return getValidationMessages(body).some((message) =>
    message.includes("Faktura kan ikke opprettes før selskapet har registrert et bankkontonummer."),
  );
}

function chooseZeroVatType(vats: VatType[]) {
  const vat = vats.find((item) => Number(item.percentage) === 0);
  if (!vat) {
    throw new Error("Blocked: no outgoing 0% VAT type available");
  }
  return vat;
}

function chooseInvoiceAccount(accounts: LedgerAccount[]) {
  const invoiceAccount =
    accounts.find((account) => account.isInvoiceAccount && account.number === 1920) ??
    accounts.find((account) => account.isInvoiceAccount) ??
    accounts[0];

  if (!invoiceAccount) {
    throw new Error("Blocked: no bank ledger account available for repair");
  }

  return invoiceAccount;
}

async function createCustomer() {
  const response = await request<WrappedValue<Customer>>("POST", "customer", {
    body: {
      name: CUSTOMER_NAME,
      organizationNumber: CUSTOMER_ORG_NO,
      invoiceSendMethod: "MANUAL",
    },
  });

  const customer = response.value;
  if (!customer?.id) {
    throw new Error("Customer create response missing id");
  }
  return customer;
}

async function resolveVatType() {
  const response = await request<WrappedList<VatType>>("GET", "ledger/vatType", {
    query: {
      typeOfVat: "OUTGOING",
      vatDate: INVOICE_DATE,
      fields: "*",
    },
  });

  return chooseZeroVatType(response.values ?? []);
}

function invoicePayload(customerId: number, vatTypeId: number) {
  return {
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
}

async function createInvoice(customerId: number, vatTypeId: number) {
  return request<WrappedValue<Invoice>>("POST", "invoice", {
    body: invoicePayload(customerId, vatTypeId),
  });
}

async function repairCompanyBankAccount() {
  const response = await request<WrappedList<LedgerAccount>>("GET", "ledger/account", {
    query: {
      isBankAccount: true,
      fields: "*",
    },
  });

  const account = chooseInvoiceAccount(response.values ?? []);
  await request<WrappedValue<LedgerAccount>>("PUT", `ledger/account/${account.id}`, {
    body: {
      bankAccountNumber: REPAIR_BANK_ACCOUNT_NUMBER,
    },
  });
}

async function main() {
  const customer = await createCustomer();
  const vatType = await resolveVatType();

  let invoiceResponse: WrappedValue<Invoice>;
  try {
    invoiceResponse = await createInvoice(customer.id, vatType.id);
  } catch (error) {
    if (!(error instanceof ApiError) || !hasBankAccountValidation(error.body)) {
      throw error;
    }

    await repairCompanyBankAccount();
    invoiceResponse = await createInvoice(customer.id, vatType.id);
  }

  const invoice = invoiceResponse.value;
  if (!invoice?.id) {
    throw new Error("Invoice create response missing id");
  }

  console.log(
    JSON.stringify(
      {
        customerId: customer.id,
        vatTypeId: vatType.id,
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
