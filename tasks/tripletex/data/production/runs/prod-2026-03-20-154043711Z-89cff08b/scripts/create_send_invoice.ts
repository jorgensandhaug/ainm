const BASE_URL = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const SESSION_TOKEN = "YH7dO2LrOCS-eI4iTl57bef2H4cpbnceDbhKPgdT5is";

const CUSTOMER_NAME = "Ironbridge Ltd";
const ORGANIZATION_NUMBER = "841254546";
const INVOICE_DATE = "2026-03-20";
const INVOICE_DUE_DATE = "2026-04-03";
const LINE_DESCRIPTION = "System Development";
const LINE_AMOUNT_EX_VAT = 28500;

const authHeader =
  "Basic " + Buffer.from(`0:${SESSION_TOKEN}`, "utf8").toString("base64");

class ApiError extends Error {
  status: number;
  body: unknown;
  text: string;

  constructor(status: number, text: string, body: unknown) {
    super(`HTTP ${status}: ${text}`);
    this.status = status;
    this.text = text;
    this.body = body;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function errorText(body: unknown, fallback = ""): string {
  if (typeof body === "string") return body;
  if (!isObject(body)) return fallback;

  const pieces: string[] = [];
  for (const key of [
    "error",
    "message",
    "errorMessage",
    "developerMessage",
    "fullMessage",
    "fullMessages",
  ]) {
    const value = body[key];
    if (typeof value === "string") pieces.push(value);
    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === "string") pieces.push(item);
        else if (isObject(item)) {
          const text = errorText(item, "");
          if (text) pieces.push(text);
        }
      }
    }
  }

  if (Array.isArray(body.validationMessages)) {
    for (const item of body.validationMessages) {
      if (isObject(item)) {
        const field = typeof item.field === "string" ? item.field : "";
        const message =
          typeof item.message === "string"
            ? item.message
            : typeof item.description === "string"
              ? item.description
              : "";
        if (field || message) pieces.push(`${field}: ${message}`.trim());
      }
    }
  }

  return pieces.filter(Boolean).join(" | ") || fallback;
}

async function api<T>(
  path: string,
  init: RequestInit,
  expectedStatus: number | number[],
): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: authHeader,
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json; charset=utf-8" } : {}),
      ...(init.headers ?? {}),
    },
  });

  const text = await response.text();
  const body = text ? safeJsonParse(text) : null;
  const allowed = Array.isArray(expectedStatus)
    ? expectedStatus
    : [expectedStatus];

  if (!allowed.includes(response.status)) {
    throw new ApiError(response.status, text, body);
  }

  return body as T;
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function unwrapValue<T extends { value?: unknown }>(body: T): any {
  if (!isObject(body) || !("value" in body)) {
    throw new Error(`Unexpected response wrapper: ${JSON.stringify(body)}`);
  }
  return (body as { value: unknown }).value;
}

function unwrapValues<T extends { values?: unknown }>(body: T): any[] {
  if (!isObject(body) || !Array.isArray(body.values)) {
    throw new Error(`Unexpected list wrapper: ${JSON.stringify(body)}`);
  }
  return body.values;
}

function pickVatType(vatTypes: any[]): any {
  const exact25 = vatTypes.find(
    (vatType) => Number(vatType?.percentage) === 25,
  );
  if (exact25) return exact25;

  if (vatTypes.length === 1) return vatTypes[0];

  const positive = [...vatTypes]
    .filter((vatType) => Number(vatType?.percentage) > 0)
    .sort((a, b) => Number(b?.percentage) - Number(a?.percentage));
  if (positive.length > 0) return positive[0];

  if (vatTypes.length > 0) return vatTypes[0];

  throw new Error("No outgoing VAT types returned");
}

function computeNorwegianBankAccountCheckDigit(first10: string): string | null {
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const sum = first10
    .split("")
    .reduce((acc, digit, index) => acc + Number(digit) * weights[index], 0);
  const remainder = sum % 11;
  const check = 11 - remainder;
  if (check === 11) return "0";
  if (check === 10) return null;
  return String(check);
}

function generateUniqueBankAccountNumber(existing: Set<string>): string {
  for (let i = 1200000000; i <= 1299999999; i++) {
    const first10 = String(i);
    const checkDigit = computeNorwegianBankAccountCheckDigit(first10);
    if (!checkDigit) continue;
    const candidate = `${first10}${checkDigit}`;
    if (!existing.has(candidate)) return candidate;
  }
  throw new Error("Could not generate unique bank account number");
}

async function createOrResolveCustomer(): Promise<any> {
  const payload = {
    name: CUSTOMER_NAME,
    organizationNumber: ORGANIZATION_NUMBER,
    invoiceSendMethod: "MANUAL",
  };

  try {
    const response = await api<{ value: unknown }>("/customer", {
      method: "POST",
      body: JSON.stringify(payload),
    }, 201);
    return unwrapValue(response);
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    if (error.status === 403 && errorText(error.body).includes("Invalid or expired token")) {
      throw error;
    }

    const lookup = await api<{ values: unknown[] }>(
      `/customer?organizationNumber=${encodeURIComponent(ORGANIZATION_NUMBER)}&fields=*`,
      { method: "GET" },
      200,
    );
    const matches = unwrapValues(lookup).filter(
      (customer) =>
        customer?.organizationNumber === ORGANIZATION_NUMBER &&
        customer?.name === CUSTOMER_NAME,
    );
    if (matches.length > 0) return matches[0];
    throw error;
  }
}

async function resolveVatType(): Promise<any> {
  const response = await api<{ values: unknown[] }>(
    `/ledger/vatType?typeOfVat=OUTGOING&vatDate=${INVOICE_DATE}&fields=*`,
    { method: "GET" },
    200,
  );
  return pickVatType(unwrapValues(response));
}

function buildInvoicePayload(customerId: number, vatTypeId: number) {
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
            description: LINE_DESCRIPTION,
            count: 1,
            unitPriceExcludingVatCurrency: LINE_AMOUNT_EX_VAT,
            vatType: { id: vatTypeId },
          },
        ],
      },
    ],
  };
}

function needsBankAccountRepair(error: ApiError): boolean {
  return errorText(error.body, error.text).includes(
    "Faktura kan ikke opprettes før selskapet har registrert et bankkontonummer.",
  );
}

async function repairMissingCompanyBankAccount(): Promise<any> {
  const response = await api<{ values: unknown[] }>(
    "/ledger/account?isBankAccount=true&fields=*",
    { method: "GET" },
    200,
  );
  const accounts = unwrapValues(response);
  const target =
    accounts.find(
      (account) =>
        account?.isInvoiceAccount === true && String(account?.number) === "1920",
    ) ??
    accounts.find((account) => account?.isInvoiceAccount === true) ??
    accounts[0];

  if (!target?.id) {
    throw new Error("No bank account found for repair");
  }

  const existingNumbers = new Set(
    accounts
      .map((account) =>
        typeof account?.bankAccountNumber === "string"
          ? account.bankAccountNumber
          : null,
      )
      .filter(Boolean),
  );
  const bankAccountNumber = generateUniqueBankAccountNumber(
    existingNumbers as Set<string>,
  );

  const updated = await api<{ value: unknown }>(
    `/ledger/account/${target.id}`,
    {
      method: "PUT",
      body: JSON.stringify({
        id: target.id,
        version: target.version,
        bankAccountNumber,
      }),
    },
    200,
  );

  return unwrapValue(updated);
}

async function createAndSendInvoice(payload: unknown): Promise<any> {
  const response = await api<{ value: unknown }>(
    "/invoice",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    201,
  );
  return unwrapValue(response);
}

async function main() {
  const customer = await createOrResolveCustomer();
  const vatType = await resolveVatType();
  const invoicePayload = buildInvoicePayload(customer.id, vatType.id);

  let invoice;
  try {
    invoice = await createAndSendInvoice(invoicePayload);
  } catch (error) {
    if (!(error instanceof ApiError) || !needsBankAccountRepair(error)) {
      throw error;
    }
    await repairMissingCompanyBankAccount();
    invoice = await createAndSendInvoice(invoicePayload);
  }

  console.log(
    JSON.stringify(
      {
        customerId: customer.id,
        customerName: customer.name,
        customerInvoiceSendMethod: customer.invoiceSendMethod,
        vatTypeId: vatType.id,
        vatPercentage: vatType.percentage,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        amountExcludingVatCurrency: invoice.amountExcludingVatCurrency,
        amountCurrency: invoice.amountCurrency,
        amountOutstanding: invoice.amountOutstanding,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  if (error instanceof ApiError) {
    console.error(
      JSON.stringify(
        {
          status: error.status,
          error: errorText(error.body, error.text),
          body: error.body,
        },
        null,
        2,
      ),
    );
    process.exit(1);
  }

  console.error(
    JSON.stringify(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    ),
  );
  process.exit(1);
});
