const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const sessionToken =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const invoiceDate = "2026-03-20";
const invoiceDueDate = addDays(invoiceDate, 14);
const customerName = process.env.CUSTOMER_NAME ?? "Porto Alegre Lda";
const organizationNumber = process.env.ORG_NUMBER ?? "826870192";
const description = process.env.LINE_DESCRIPTION ?? "Design web";
const amountExcludingVat = Number(process.env.AMOUNT_EX_VAT ?? "22700");
const directCreate = process.env.DIRECT_CREATE === "1";

type ApiErrorPayload = {
  error?: string;
  message?: string;
  validationMessages?: Array<{ field?: string; message?: string }>;
};

type Customer = {
  id: number;
  name?: string;
  organizationNumber?: string;
  version?: number;
};

type VatType = {
  id: number;
  percentage?: number;
  number?: string;
  name?: string;
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
  let customer: Customer | null = null;
  let customerSource: "existing" | "created" = "existing";

  if (directCreate) {
    customer = await createCustomer();
    customerSource = "created";
  } else {
    customer = await resolveCustomer();
    if (!customer) {
      customer = await createCustomer();
      customerSource = "created";
    }
  }

  const vatType = await resolveZeroVatType();

  const payload = {
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
  let repairedBankAccount = false;
  try {
    invoiceResponse = await api("invoice", { method: "POST", body: payload });
  } catch (error) {
    if (!isMissingCompanyBankAccountError(error)) {
      throw error;
    }

    repairedBankAccount = true;
    await repairCompanyBankAccount();
    invoiceResponse = await api("invoice", { method: "POST", body: payload });
  }

  console.log(
    JSON.stringify(
      {
        customerSource,
        customerId: customer.id,
        vatType: {
          id: vatType.id,
          percentage: vatType.percentage,
          number: vatType.number,
          displayName: vatType.displayName,
        },
        repairedBankAccount,
        invoice: invoiceResponse.value
          ? {
              id: invoiceResponse.value.id,
              invoiceNumber: invoiceResponse.value.invoiceNumber,
              amountExcludingVatCurrency: invoiceResponse.value.amountExcludingVatCurrency,
              amountCurrency: invoiceResponse.value.amountCurrency,
            }
          : null,
      },
      null,
      2,
    ),
  );
}

async function resolveCustomer(): Promise<Customer | null> {
  const response = await api(
    `customer?organizationNumber=${encodeURIComponent(organizationNumber)}&fields=*`,
  );
  const values: Customer[] = response.values ?? [];
  const exact = values.filter((value) => value.organizationNumber === organizationNumber);
  if (exact.length === 0) {
    return null;
  }
  if (exact.length === 1) {
    return exact[0];
  }

  const exactName = exact.filter((value) => value.name === customerName);
  if (exactName.length === 1) {
    return exactName[0];
  }

  throw new Error("Ambiguous customer match in sandbox");
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

async function resolveZeroVatType(): Promise<VatType> {
  const response = await api(
    `ledger/vatType?typeOfVat=OUTGOING&vatDate=${invoiceDate}&fields=*`,
  );
  const values: VatType[] = response.values ?? [];
  const zeroVatTypes = values.filter((value) => Number(value.percentage) === 0);

  if (zeroVatTypes.length === 0) {
    throw new Error("Sandbox has no 0% outgoing VAT type");
  }

  return (
    zeroVatTypes.find((value) => !value.parentType || value.parentType.id === 0) ??
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
    throw new Error("No bank account found in sandbox");
  }

  if (target.bankAccountNumber && /^\d{11}$/.test(target.bankAccountNumber)) {
    return;
  }

  const existing = new Set(
    values
      .map((value) => value.bankAccountNumber)
      .filter((value): value is string => typeof value === "string" && value.length > 0),
  );

  const bankAccountNumber = generateUniqueNorwegianBankAccountNumber(existing, target.id);
  await api(`ledger/account/${target.id}`, {
    method: "PUT",
    body: {
      id: target.id,
      version: target.version,
      bankAccountNumber,
    },
  });
}

function generateUniqueNorwegianBankAccountNumber(existing: Set<string>, seed: number): string {
  for (let offset = 0; offset < 10000; offset += 1) {
    const candidate = buildValidNorwegianBankAccountNumber(seed + offset);
    if (!existing.has(candidate)) {
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

  throw new Error("Unable to build valid bank account number");
}

async function api(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<any> {
  const normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const response = await fetch(new URL(path, normalizedBaseUrl), {
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
    const error = new Error(`${response.status} ${response.statusText}`);
    (error as Error & { status?: number; payload?: ApiErrorPayload }).status = response.status;
    (error as Error & { status?: number; payload?: ApiErrorPayload }).payload =
      payload ?? { message: text };
    throw error;
  }

  return payload;
}

function isMissingCompanyBankAccountError(error: unknown): boolean {
  const payload = (error as Error & { payload?: ApiErrorPayload })?.payload;
  const text = [
    payload?.error,
    payload?.message,
    ...(payload?.validationMessages?.map((entry) => entry.message) ?? []),
  ]
    .filter((value): value is string => typeof value === "string")
    .join(" ");
  return text.includes("registrert et bankkontonummer");
}

function safeJsonParse(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

main().catch((error) => {
  const payload = (error as Error & { payload?: ApiErrorPayload })?.payload;
  if (payload) {
    console.error(JSON.stringify(payload, null, 2));
  } else {
    console.error(error);
  }
  process.exit(1);
});
