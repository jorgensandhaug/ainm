const baseUrl = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const sessionToken = "Ysq7qPSNir1oqgR7ZkoV4l4-RTHWE1ZUi4s4DfMcwiY";

const invoiceDate = "2026-03-20";
const invoiceDueDate = addDays(invoiceDate, 14);
const customerName = "Porto Alegre Lda";
const organizationNumber = "826870192";
const lineDescription = "Design web";
const amountExVat = 22700;

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
  isBankAccount?: boolean;
  isInvoiceAccount?: boolean;
  bankAccountNumber?: string;
};

const authHeader = `Basic ${Buffer.from(`0:${sessionToken}`).toString("base64")}`;

async function main() {
  let customer = await resolveCustomer();
  if (!customer) {
    customer = await createCustomer();
  }

  const vatType = await resolveZeroVatType();
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
            description: lineDescription,
            count: 1,
            unitPriceExcludingVatCurrency: amountExVat,
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

  const invoice = invoiceResponse.value;
  console.log(
    JSON.stringify(
      {
        customerId: customer.id,
        invoiceId: invoice?.id,
        invoiceNumber: invoice?.invoiceNumber,
        amountExcludingVatCurrency: invoice?.amountExcludingVatCurrency,
        amountCurrency: invoice?.amountCurrency,
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
  const exactOrg = values.filter((value) => value.organizationNumber === organizationNumber);

  if (exactOrg.length === 0) {
    return null;
  }

  if (exactOrg.length === 1) {
    return exactOrg[0];
  }

  const exactName = exactOrg.filter((value) => value.name === customerName);
  if (exactName.length === 1) {
    return exactName[0];
  }

  throw new Error(`Ambiguous customer match for org ${organizationNumber}`);
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
    throw new Error("No 0% outgoing VAT type available");
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
  const url = new URL(path, `${baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`}`);
  const response = await fetch(url, {
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
  const messages = [
    payload?.error,
    payload?.message,
    ...(payload?.validationMessages?.map((entry) => entry.message) ?? []),
  ]
    .filter((value): value is string => typeof value === "string")
    .join(" ");

  return messages.includes("registrert et bankkontonummer");
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
