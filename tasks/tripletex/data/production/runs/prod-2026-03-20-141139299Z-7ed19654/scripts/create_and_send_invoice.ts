const BASE_URL = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "uctBwIM0SEpWII1QvTCHzv33cDUBuut3VdDGMvetQno";

const CUSTOMER_NAME = "Ironbridge Ltd";
const ORG_NUMBER = "841254546";
const INVOICE_DATE = "2026-03-20";
const INVOICE_DUE_DATE = "2026-04-03";
const DESCRIPTION = "System Development";
const AMOUNT_EX_VAT = 28500;

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
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(deepText).join(" ");
  }
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

function chooseSendType(customer: any): string {
  if (customer?.invoiceSendMethod === "EMAIL" && (customer?.invoiceEmail || customer?.email)) {
    return "EMAIL";
  }
  if (customer?.invoiceSendMethod === "EHF" && customer?.organizationNumber) {
    return "EHF";
  }
  if (customer?.invoiceSendMethod === "PAPER" && customer?.postalAddress) {
    return "PAPER";
  }
  if (customer?.invoiceSendMethod === "MANUAL") {
    return "MANUAL";
  }
  if (customer?.invoiceEmail || customer?.email) {
    return "EMAIL";
  }
  return "MANUAL";
}

function createValidBankAccountNumber(base10: string) {
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const digits = base10.split("").map(Number);
  const sum = digits.reduce((total, digit, index) => total + digit * weights[index], 0);
  const remainder = sum % 11;
  const controlDigit = remainder === 0 ? 0 : 11 - remainder;
  if (controlDigit === 10) {
    return null;
  }
  return `${base10}${controlDigit}`;
}

function generateUniqueBankAccountNumber(usedNumbers: Set<string>) {
  const seed = Date.now() % 10_000_000_000;
  for (let attempt = 0; attempt < 5000; attempt += 1) {
    const base10 = String((seed + attempt) % 10_000_000_000).padStart(10, "0");
    const candidate = createValidBankAccountNumber(base10);
    if (candidate && !usedNumbers.has(candidate)) {
      return candidate;
    }
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
    return await api<any>("POST", "/invoice", {
      query: { sendToCustomer: false },
      body: payload,
    });
  } catch (error) {
    if (!(error instanceof ApiError)) {
      throw error;
    }
    const message = deepText(error.data);
    if (
      error.status === 422 &&
      message.includes("Faktura kan ikke opprettes før selskapet har registrert et bankkontonummer")
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

  if (!customer?.id) {
    throw new Error("Customer resolution failed");
  }

  const vatTypeResponse = await api<any>("GET", "/ledger/vatType", {
    query: { typeOfVat: "OUTGOING", vatDate: INVOICE_DATE, fields: "*" },
  });
  const vatType = chooseVatType(vatTypeResponse?.values ?? []);

  const invoice = await createInvoice(customer.id, Number(vatType.id));
  const invoiceValue = invoice?.value;

  if (!invoiceValue?.id) {
    throw new Error("Invoice creation failed");
  }

  const sendType = chooseSendType(customer);
  await api<any>("PUT", `/invoice/${invoiceValue.id}/:send`, {
    query: { sendType },
  });

  console.log(
    JSON.stringify(
      {
        customerId: customer.id,
        customerCreated,
        invoiceId: invoiceValue.id,
        invoiceNumber: invoiceValue.invoiceNumber,
        sendType,
        amountExcludingVatCurrency: invoiceValue.amountExcludingVatCurrency,
        vatTypeId: vatType.id,
      },
      null,
      2,
    ),
  );
}

await main();
