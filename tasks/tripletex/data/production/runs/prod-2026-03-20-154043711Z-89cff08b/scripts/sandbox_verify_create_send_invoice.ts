const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const SESSION_TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const RUN_DATE = "2026-03-20";
const DUE_DATE = "2026-04-03";
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

function isObject(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null;
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
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
          const nested = errorText(item, "");
          if (nested) pieces.push(nested);
        }
      }
    }
  }

  if (Array.isArray(body.validationMessages)) {
    for (const item of body.validationMessages) {
      if (!isObject(item)) continue;
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

function unwrapValue(body: unknown): any {
  if (!isObject(body) || !("value" in body)) {
    throw new Error(`Unexpected wrapper: ${JSON.stringify(body)}`);
  }
  return body.value;
}

function unwrapValues(body: unknown): any[] {
  if (!isObject(body) || !Array.isArray(body.values)) {
    throw new Error(`Unexpected list wrapper: ${JSON.stringify(body)}`);
  }
  return body.values;
}

function computeCheckDigit(first10: string): string | null {
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const sum = first10
    .split("")
    .reduce((acc, digit, idx) => acc + Number(digit) * weights[idx], 0);
  const remainder = sum % 11;
  const check = 11 - remainder;
  if (check === 11) return "0";
  if (check === 10) return null;
  return String(check);
}

function generateBankAccount(existing: Set<string>): string {
  for (let i = 1300000000; i <= 1399999999; i++) {
    const first10 = String(i);
    const checkDigit = computeCheckDigit(first10);
    if (!checkDigit) continue;
    const candidate = `${first10}${checkDigit}`;
    if (!existing.has(candidate)) return candidate;
  }
  throw new Error("Could not generate unique bank account number");
}

function needsBankRepair(error: ApiError): boolean {
  return errorText(error.body, error.text).includes(
    "Faktura kan ikke opprettes før selskapet har registrert et bankkontonummer.",
  );
}

function makeUniqueOrgNo(): string {
  const tail = String(Date.now() % 1_000_000).padStart(6, "0");
  return `999${tail}`;
}

async function createCustomer() {
  const organizationNumber = makeUniqueOrgNo();
  const name = `Sandbox Reflection ${organizationNumber} AS`;
  const response = await api(
    "/customer",
    {
      method: "POST",
      body: JSON.stringify({
        name,
        organizationNumber,
        invoiceSendMethod: "MANUAL",
      }),
    },
    201,
  );
  return unwrapValue(response);
}

function buildInvoice(customerId: number, vatTypeId?: number) {
  const line: Record<string, any> = {
    description: LINE_DESCRIPTION,
    count: 1,
    unitPriceExcludingVatCurrency: LINE_AMOUNT_EX_VAT,
  };
  if (vatTypeId) line.vatType = { id: vatTypeId };

  return {
    invoiceDate: RUN_DATE,
    invoiceDueDate: DUE_DATE,
    customer: { id: customerId },
    orders: [
      {
        customer: { id: customerId },
        orderDate: RUN_DATE,
        deliveryDate: RUN_DATE,
        orderLines: [line],
      },
    ],
  };
}

async function createInvoice(payload: unknown) {
  const response = await api(
    "/invoice",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    201,
  );
  return unwrapValue(response);
}

async function repairBankAccountIfNeeded() {
  const accounts = unwrapValues(
    await api("/ledger/account?isBankAccount=true&fields=*", { method: "GET" }, 200),
  );
  const target =
    accounts.find(
      (account) =>
        account?.isInvoiceAccount === true && String(account?.number) === "1920",
    ) ??
    accounts.find((account) => account?.isInvoiceAccount === true) ??
    accounts[0];
  if (!target?.id) throw new Error("No bank account found");

  const existing = new Set(
    accounts
      .map((account) =>
        typeof account?.bankAccountNumber === "string"
          ? account.bankAccountNumber
          : null,
      )
      .filter(Boolean),
  ) as Set<string>;

  return unwrapValue(
    await api(
      `/ledger/account/${target.id}`,
      {
        method: "PUT",
        body: JSON.stringify({
          id: target.id,
          version: target.version,
          bankAccountNumber: generateBankAccount(existing),
        }),
      },
      200,
    ),
  );
}

async function resolveVatType() {
  const vatTypes = unwrapValues(
    await api(
      `/ledger/vatType?typeOfVat=OUTGOING&vatDate=${RUN_DATE}&fields=*`,
      { method: "GET" },
      200,
    ),
  );
  return (
    vatTypes.find((vatType) => Number(vatType?.percentage) === 25) ??
    vatTypes[0]
  );
}

async function tryCreateInvoice(customerId: number, vatTypeId?: number) {
  try {
    return {
      ok: true as const,
      invoice: await createInvoice(buildInvoice(customerId, vatTypeId)),
      repairedBankAccount: false,
    };
  } catch (error) {
    if (!(error instanceof ApiError) || !needsBankRepair(error)) throw error;
    await repairBankAccountIfNeeded();
    return {
      ok: true as const,
      invoice: await createInvoice(buildInvoice(customerId, vatTypeId)),
      repairedBankAccount: true,
    };
  }
}

async function main() {
  const noVatCustomer = await createCustomer();

  let noVatTypeAttempt:
    | {
        ok: true;
        invoice: any;
        repairedBankAccount: boolean;
      }
    | {
        ok: false;
        status: number;
        error: string;
        body: unknown;
      };

  try {
    noVatTypeAttempt = await tryCreateInvoice(noVatCustomer.id);
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    noVatTypeAttempt = {
      ok: false,
      status: error.status,
      error: errorText(error.body, error.text),
      body: error.body,
    };
  }

  const vatCustomer = await createCustomer();
  const vatType = await resolveVatType();
  const withVat = await tryCreateInvoice(vatCustomer.id, vatType.id);

  const hardcodedVatCustomer = await createCustomer();
  let hardcodedVat3Attempt:
    | {
        success: true;
        invoiceId: number;
        invoiceNumber: number;
        amountExcludingVatCurrency: number;
        amountCurrency: number;
        repairedBankAccount: boolean;
      }
    | {
        success: false;
        status: number;
        error: string;
      };
  try {
    const hardcoded = await tryCreateInvoice(hardcodedVatCustomer.id, 3);
    hardcodedVat3Attempt = {
      success: true,
      invoiceId: hardcoded.invoice.id,
      invoiceNumber: hardcoded.invoice.invoiceNumber,
      amountExcludingVatCurrency: hardcoded.invoice.amountExcludingVatCurrency,
      amountCurrency: hardcoded.invoice.amountCurrency,
      repairedBankAccount: hardcoded.repairedBankAccount,
    };
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    hardcodedVat3Attempt = {
      success: false,
      status: error.status,
      error: errorText(error.body, error.text),
    };
  }

  console.log(
    JSON.stringify(
      {
        noVatCustomerId: noVatCustomer.id,
        noVatCustomerInvoiceSendMethod: noVatCustomer.invoiceSendMethod,
        noVatTypeAttempt: noVatTypeAttempt.ok
          ? {
              success: true,
              invoiceId: noVatTypeAttempt.invoice.id,
              invoiceNumber: noVatTypeAttempt.invoice.invoiceNumber,
              amountExcludingVatCurrency:
                noVatTypeAttempt.invoice.amountExcludingVatCurrency,
              amountCurrency: noVatTypeAttempt.invoice.amountCurrency,
              repairedBankAccount: noVatTypeAttempt.repairedBankAccount,
            }
          : {
              success: false,
              status: noVatTypeAttempt.status,
              error: noVatTypeAttempt.error,
            },
        explicitVatCustomerId: vatCustomer.id,
        explicitVatCustomerInvoiceSendMethod: vatCustomer.invoiceSendMethod,
        explicitVatAttempt: {
          vatTypeId: vatType.id,
          vatPercentage: vatType.percentage,
          invoiceId: withVat.invoice.id,
          invoiceNumber: withVat.invoice.invoiceNumber,
          amountExcludingVatCurrency: withVat.invoice.amountExcludingVatCurrency,
          amountCurrency: withVat.invoice.amountCurrency,
          repairedBankAccount: withVat.repairedBankAccount,
        },
        hardcodedVat3CustomerId: hardcodedVatCustomer.id,
        hardcodedVat3CustomerInvoiceSendMethod:
          hardcodedVatCustomer.invoiceSendMethod,
        hardcodedVat3Attempt,
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
      { error: error instanceof Error ? error.message : String(error) },
      null,
      2,
    ),
  );
  process.exit(1);
});
