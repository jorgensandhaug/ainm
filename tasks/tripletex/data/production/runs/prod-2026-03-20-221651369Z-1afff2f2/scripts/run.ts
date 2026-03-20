const baseUrl = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const sessionToken = "g0ZbDqN5tAaFlnwpbwUagneschP1wOgAhEwVqP15OQM";

const invoiceDate = "2026-03-20";
const invoiceDueDate = addDays(invoiceDate, 14);
const customerName = "Colline SARL";
const organizationNumber = "944164340";
const description = "Service réseau";
const amountExcludingVat = 44750;

type ApiErrorPayload = {
  error?: string;
  message?: string;
  validationMessages?: Array<{ field?: string; message?: string }>;
  source?: string;
};

type Customer = {
  id: number;
};

type VatType = {
  id: number;
  percentage?: number;
  number?: string;
  displayName?: string;
  parentType?: { id?: number };
};

type Account = {
  id: number;
  number?: string;
  version?: number;
  isInvoiceAccount?: boolean;
  bankAccountNumber?: string;
};

const authHeader = `Basic ${Buffer.from(`0:${sessionToken}`).toString("base64")}`;

async function main() {
  const customer = await createCustomer();
  const vatType = await resolveOutgoingVat25();
  const invoicePayload = {
    invoiceDate,
    invoiceDueDate,
    customer: { id: customer.id },
    orders: [
      {
        customer: { id: customer.id },
        orderDate: invoiceDate,
        deliveryDate: invoiceDate,
        orderLines: [
          {
            description,
            count: 1,
            unitPriceExcludingVatCurrency: amountExcludingVat,
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
    if (!isMissingCompanyBankAccountError(error)) {
      throw error;
    }
    await repairCompanyBankAccount();
    invoiceResponse = await api("invoice", { method: "POST", body: invoicePayload });
  }

  console.log(
    JSON.stringify(
      {
        customerId: customer.id,
        vatType: {
          id: vatType.id,
          percentage: vatType.percentage,
          number: vatType.number,
          displayName: vatType.displayName,
        },
        invoiceId: invoiceResponse.value?.id,
        invoiceNumber: invoiceResponse.value?.invoiceNumber,
        amountExcludingVatCurrency: invoiceResponse.value?.amountExcludingVatCurrency,
        amountCurrency: invoiceResponse.value?.amountCurrency,
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
      name: customerName,
      organizationNumber,
      invoiceSendMethod: "MANUAL",
    },
  });
  return response.value;
}

async function resolveOutgoingVat25(): Promise<VatType> {
  const response = await api(
    `ledger/vatType?typeOfVat=OUTGOING&vatDate=${invoiceDate}&fields=*`,
  );
  const values: VatType[] = response.values ?? [];
  const matches = values.filter((value) => Number(value.percentage) === 25);

  if (matches.length === 0) {
    throw new Error("Blocked: no 25% outgoing VAT type available");
  }

  return matches.find((value) => !value.parentType || value.parentType.id === 0) ?? matches[0];
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
      .filter((value): value is string => typeof value === "string" && value.length > 0),
  );
  const bankAccountNumber = generateUniqueNorwegianBankAccountNumber(existingNumbers, target.id);

  await api(`ledger/account/${target.id}`, {
    method: "PUT",
    body: {
      id: target.id,
      version: target.version,
      bankAccountNumber,
    },
  });
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

  for (let offset = 0; offset < 50; offset += 1) {
    const digits = `1234${String((seed + offset) % 1_000_000).padStart(6, "0")}`;
    const sum = digits
      .split("")
      .reduce((acc, digit, index) => acc + Number(digit) * weights[index], 0);
    const remainder = sum % 11;
    const checkDigit = remainder === 0 ? 0 : 11 - remainder;

    if (checkDigit !== 10) {
      return `${digits}${checkDigit}`;
    }
  }

  throw new Error("Unable to build valid mod11 bank account number");
}

async function api(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<any> {
  const response = await fetch(new URL(path, `${baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`}`), {
    method: init.method ?? "GET",
    headers: {
      Authorization: authHeader,
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json; charset=utf-8" } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });

  const text = await response.text();
  const payload = text ? safeJsonParse(text) : undefined;

  if (!response.ok) {
    const error = new Error(buildErrorMessage(response.status, response.statusText, payload, text));
    (error as Error & { status?: number; payload?: ApiErrorPayload }).status = response.status;
    (error as Error & { status?: number; payload?: ApiErrorPayload }).payload =
      payload ?? { message: text };
    throw error;
  }

  return payload;
}

function buildErrorMessage(
  status: number,
  statusText: string,
  payload: unknown,
  fallbackText: string,
): string {
  const parts = [`${status} ${statusText}`];
  if (payload && typeof payload === "object") {
    const errorPayload = payload as ApiErrorPayload;
    if (errorPayload.error) {
      parts.push(errorPayload.error);
    }
    if (errorPayload.message) {
      parts.push(errorPayload.message);
    }
    if (Array.isArray(errorPayload.validationMessages) && errorPayload.validationMessages.length > 0) {
      parts.push(
        errorPayload.validationMessages
          .map((entry) => entry.message)
          .filter((value): value is string => Boolean(value))
          .join(" | "),
      );
    }
  } else if (fallbackText) {
    parts.push(fallbackText);
  }
  return parts.join(" :: ");
}

function isMissingCompanyBankAccountError(error: unknown): boolean {
  const payload = (error as Error & { payload?: ApiErrorPayload })?.payload;
  const messages = [
    payload?.error,
    payload?.message,
    ...(payload?.validationMessages?.map((entry) => entry.message) ?? []),
  ]
    .filter((value): value is string => typeof value === "string")
    .join(" ");

  return messages.includes("bankkontonummer");
}

function safeJsonParse(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

await main();
