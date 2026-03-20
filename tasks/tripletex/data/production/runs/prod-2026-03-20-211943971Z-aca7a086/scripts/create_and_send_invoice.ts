const BASE_URL = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const SESSION_TOKEN = "_8GKl8er9If9_YOz0PCLwaPBgeCM9mTmHT3a8SIF_EU";

const CUSTOMER_NAME = "Porto Alegre Lda";
const ORGANIZATION_NUMBER = "842889154";
const INVOICE_DATE = "2026-03-20";
const INVOICE_DUE_DATE = "2026-04-03";
const DESCRIPTION = "Consultoria de dados";
const AMOUNT_EX_VAT = 11200;

type ApiErrorPayload = {
  error?: string;
  message?: string;
  validationMessages?: Array<{ field?: string; message?: string }>;
};

type Customer = {
  id: number;
};

type VatType = {
  id: number;
  percentage?: number;
  parentType?: { id?: number };
};

type Account = {
  id: number;
  number?: string;
  version?: number;
  isInvoiceAccount?: boolean;
  bankAccountNumber?: string;
};

class ApiError extends Error {
  status: number;
  payload: ApiErrorPayload | string | undefined;

  constructor(status: number, payload: ApiErrorPayload | string | undefined) {
    super(`${status}`);
    this.status = status;
    this.payload = payload;
  }
}

const AUTH_HEADER = `Basic ${Buffer.from(`0:${SESSION_TOKEN}`).toString("base64")}`;

await main();

async function main() {
  const customer = await createCustomer();
  const vatType = await resolveZeroVatType();
  const invoicePayload = {
    invoiceDate: INVOICE_DATE,
    invoiceDueDate: INVOICE_DUE_DATE,
    customer: { id: customer.id },
    orders: [
      {
        customer: { id: customer.id },
        orderDate: INVOICE_DATE,
        deliveryDate: INVOICE_DATE,
        orderLines: [
          {
            description: DESCRIPTION,
            count: 1,
            unitPriceExcludingVatCurrency: AMOUNT_EX_VAT,
            vatType: { id: vatType.id },
          },
        ],
      },
    ],
  };

  let invoiceResponse;
  try {
    invoiceResponse = await api("invoice", { method: "POST", body: invoicePayload });
  } catch (error) {
    if (!(error instanceof ApiError) || !isMissingBankAccountError(error)) {
      throw error;
    }

    await repairCompanyBankAccount();
    invoiceResponse = await api("invoice", { method: "POST", body: invoicePayload });
  }

  console.log(
    JSON.stringify(
      {
        customerId: customer.id,
        invoiceId: invoiceResponse?.value?.id,
        invoiceNumber: invoiceResponse?.value?.invoiceNumber,
        amountExcludingVatCurrency: invoiceResponse?.value?.amountExcludingVatCurrency,
        amountCurrency: invoiceResponse?.value?.amountCurrency,
      },
      null,
      2,
    ),
  );
}

async function createCustomer(): Promise<Customer> {
  const response = await api("customer", {
    method: "POST",
    body: {
      name: CUSTOMER_NAME,
      organizationNumber: ORGANIZATION_NUMBER,
      invoiceSendMethod: "MANUAL",
    },
  });

  return response.value;
}

async function resolveZeroVatType(): Promise<VatType> {
  const response = await api(
    `ledger/vatType?typeOfVat=OUTGOING&vatDate=${INVOICE_DATE}&fields=*`,
  );
  const values: VatType[] = response.values ?? [];
  const zeroVatTypes = values.filter((value) => Number(value.percentage) === 0);

  if (zeroVatTypes.length === 0) {
    throw new Error("No 0% outgoing VAT type available");
  }

  return (
    zeroVatTypes.find((value) => value.parentType?.id === 0 || value.parentType?.id === undefined) ??
    zeroVatTypes[0]
  );
}

async function repairCompanyBankAccount() {
  const response = await api("ledger/account?isBankAccount=true&fields=*");
  const values: Account[] = response.values ?? [];
  const target =
    values.find((value) => value.isInvoiceAccount && value.number === "1920") ??
    values.find((value) => value.isInvoiceAccount) ??
    values[0];

  if (!target) {
    throw new Error("No bank account available for repair");
  }

  if (target.bankAccountNumber && /^\d{11}$/.test(target.bankAccountNumber)) {
    return;
  }

  const existingNumbers = new Set(
    values
      .map((value) => value.bankAccountNumber)
      .filter((value): value is string => typeof value === "string" && /^\d{11}$/.test(value)),
  );

  await api(`ledger/account/${target.id}`, {
    method: "PUT",
    body: {
      id: target.id,
      version: target.version,
      bankAccountNumber: generateUniqueNorwegianBankAccountNumber(existingNumbers, target.id),
    },
  });
}

function isMissingBankAccountError(error: ApiError): boolean {
  return deepText(error.payload).includes(
    "Faktura kan ikke opprettes før selskapet har registrert et bankkontonummer",
  );
}

function generateUniqueNorwegianBankAccountNumber(
  existingNumbers: Set<string>,
  seed: number,
): string {
  for (let offset = 0; offset < 10000; offset += 1) {
    const candidate = buildValidNorwegianBankAccountNumber(seed + offset);
    if (!existingNumbers.has(candidate)) {
      return candidate;
    }
  }

  throw new Error("Unable to generate unique bank account number");
}

function buildValidNorwegianBankAccountNumber(seed: number): string {
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

  for (let offset = 0; offset < 100; offset += 1) {
    const digits = `1234${String((seed + offset) % 1_000_000).padStart(6, "0")}`;
    const sum = digits
      .split("")
      .reduce((total, digit, index) => total + Number(digit) * weights[index], 0);
    const remainder = sum % 11;
    const checkDigit = remainder === 0 ? 0 : 11 - remainder;

    if (checkDigit !== 10) {
      return `${digits}${checkDigit}`;
    }
  }

  throw new Error("Unable to build valid bank account number");
}

function deepText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => deepText(item)).join(" ");
  }
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>)
      .map((item) => deepText(item))
      .join(" ");
  }
  return String(value ?? "");
}

async function api(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<any> {
  const url = new URL(path, `${BASE_URL.endsWith("/") ? BASE_URL : `${BASE_URL}/`}`);
  const response = await fetch(url, {
    method: init.method ?? "GET",
    headers: {
      Authorization: AUTH_HEADER,
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json; charset=utf-8" } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });

  const text = await response.text();
  const payload = text ? safeJsonParse(text) : undefined;

  if (!response.ok) {
    throw new ApiError(response.status, payload);
  }

  return payload;
}

function safeJsonParse(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
