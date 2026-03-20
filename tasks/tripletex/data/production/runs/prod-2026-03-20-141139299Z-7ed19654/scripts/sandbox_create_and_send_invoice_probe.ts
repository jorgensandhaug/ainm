const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const CUSTOMER_NAME = "Ironbridge Ltd";
const ORG_NUMBER = "841254546";
const INVOICE_DATE = "2026-03-20";
const INVOICE_DUE_DATE = "2026-04-03";

type QueryValue = string | number | boolean | undefined;

class ApiError extends Error {
  status: number;
  data: unknown;

  constructor(message: string, status: number, data: unknown) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

function buildUrl(path: string, query?: Record<string, QueryValue>) {
  const url = new URL(`${BASE_URL}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url;
}

async function api<T>(
  method: string,
  path: string,
  opts: { query?: Record<string, QueryValue>; body?: unknown } = {},
): Promise<T> {
  const url = buildUrl(path, opts.query);
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Basic ${Buffer.from(`0:${TOKEN}`).toString("base64")}`,
      Accept: "application/json",
      ...(opts.body ? { "Content-Type": "application/json; charset=utf-8" } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await response.text();
  const data = text ? safeJsonParse(text) : null;

  if (!response.ok) {
    throw new ApiError(
      `${method} ${url.pathname}${url.search} failed`,
      response.status,
      data ?? text,
    );
  }

  return data as T;
}

function safeJsonParse(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function deepText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(deepText).join(" ");
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).map(deepText).join(" ");
  }
  return String(value ?? "");
}

function chooseVatType(values: any[]) {
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error("No outgoing VAT types returned");
  }
  return (
    values.find((vat) => Number(vat.percentage) === 25) ??
    [...values].sort((a, b) => Number(b.percentage ?? 0) - Number(a.percentage ?? 0))[0]
  );
}

function createValidBankAccountNumber(base10: string) {
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const digits = base10.split("").map(Number);
  const sum = digits.reduce((total, digit, index) => total + digit * weights[index], 0);
  const remainder = sum % 11;
  const controlDigit = remainder === 0 ? 0 : 11 - remainder;
  if (controlDigit === 10) return null;
  return `${base10}${controlDigit}`;
}

function generateUniqueBankAccountNumber(usedNumbers: Set<string>) {
  const seed = Date.now() % 10_000_000_000;
  for (let attempt = 0; attempt < 5000; attempt += 1) {
    const base10 = String((seed + attempt) % 10_000_000_000).padStart(10, "0");
    const candidate = createValidBankAccountNumber(base10);
    if (candidate && !usedNumbers.has(candidate)) return candidate;
  }
  throw new Error("Unable to generate unique checksum-valid bank account number");
}

async function repairBankAccount() {
  const accounts = await api<any>("GET", "/ledger/account", {
    query: { isBankAccount: true, fields: "*" },
  });
  const values = accounts?.values ?? [];
  const account =
    values.find((item: any) => item?.isBankAccount && item?.isInvoiceAccount) ??
    values.find((item: any) => Number(item?.number) === 1920) ??
    values[0];

  if (!account?.id) {
    throw new Error("No bank account available for repair");
  }

  const usedNumbers = new Set(
    values
      .map((item: any) => String(item?.bankAccountNumber ?? "").replace(/\D/g, ""))
      .filter((item: string) => item.length === 11),
  );
  const bankAccountNumber = generateUniqueBankAccountNumber(usedNumbers);

  return api<any>("PUT", `/ledger/account/${account.id}`, {
    body: { bankAccountNumber },
  });
}

async function createInvoice(customerId: number, vatTypeId: number, amount: number, description: string) {
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
            description,
            count: 1,
            unitPriceExcludingVatCurrency: amount,
            vatType: { id: vatTypeId },
          },
        ],
      },
    ],
  };

  try {
    return await api<any>("POST", "/invoice", {
      query: { sendToCustomer: false },
      body: payload,
    });
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    if (
      error.status === 422 &&
      deepText(error.data).includes("Faktura kan ikke opprettes før selskapet har registrert et bankkontonummer")
    ) {
      await repairBankAccount();
      return api<any>("POST", "/invoice", {
        query: { sendToCustomer: false },
        body: payload,
      });
    }
    throw error;
  }
}

async function main() {
  const customerSearch = await api<any>("GET", "/customer", {
    query: { organizationNumber: ORG_NUMBER, fields: "*" },
  });
  let customer = (customerSearch?.values ?? []).find(
    (item: any) => String(item?.organizationNumber ?? "") === ORG_NUMBER,
  );
  let customerCreated = false;

  if (!customer) {
    const created = await api<any>("POST", "/customer", {
      body: {
        name: CUSTOMER_NAME,
        organizationNumber: ORG_NUMBER,
        invoiceSendMethod: "MANUAL",
      },
    });
    customer = created?.value;
    customerCreated = true;
  }

  const vatTypeResponse = await api<any>("GET", "/ledger/vatType", {
    query: { typeOfVat: "OUTGOING", vatDate: INVOICE_DATE, fields: "*" },
  });
  const vatType = chooseVatType(vatTypeResponse?.values ?? []);

  const paperInvoice = await createInvoice(
    customer.id,
    Number(vatType.id),
    101,
    `Reflection paper send probe ${Date.now()}`,
  );

  const paperSend = await api<any>("PUT", `/invoice/${paperInvoice.value.id}/:send`, {
    query: { sendType: "PAPER" },
  }).then(
    (value) => ({ ok: true, value }),
    (error) => ({
      ok: false,
      status: error instanceof ApiError ? error.status : -1,
      data: error instanceof ApiError ? error.data : String(error),
    }),
  );

  const manualInvoice = await createInvoice(
    customer.id,
    Number(vatType.id),
    102,
    `Reflection manual send probe ${Date.now()}`,
  );

  const manualSend = await api<any>("PUT", `/invoice/${manualInvoice.value.id}/:send`, {
    query: { sendType: "MANUAL" },
  }).then(
    (value) => ({ ok: true, value }),
    (error) => ({
      ok: false,
      status: error instanceof ApiError ? error.status : -1,
      data: error instanceof ApiError ? error.data : String(error),
    }),
  );

  console.log(
    JSON.stringify(
      {
        customerCreated,
        customer: {
          id: customer?.id,
          invoiceSendMethod: customer?.invoiceSendMethod,
          email: customer?.email,
          invoiceEmail: customer?.invoiceEmail,
          postalAddress: customer?.postalAddress,
          physicalAddress: customer?.physicalAddress,
        },
        vatType: { id: vatType?.id, number: vatType?.number, percentage: vatType?.percentage },
        paperInvoiceId: paperInvoice?.value?.id,
        paperSend,
        manualInvoiceId: manualInvoice?.value?.id,
        manualSend,
      },
      null,
      2,
    ),
  );
}

await main();
