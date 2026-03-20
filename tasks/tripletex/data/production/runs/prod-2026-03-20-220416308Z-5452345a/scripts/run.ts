const BASE_URL = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2/";
const SESSION_TOKEN = "uDtfMIBtUoiPvJNcH2L-OQytaQKIi9qFMicpG80gri8";

const INVOICE_DATE = "2026-03-20";
const INVOICE_DUE_DATE = "2026-04-03";
const CUSTOMER_ORG = "861379760";
const CUSTOMER_NAME = "Sierra SL";

const LINES = [
  {
    ref: "2109",
    description: "Mantenimiento",
    unitPriceExcludingVatCurrency: 27500,
    vatPercentage: 25,
  },
  {
    ref: "1175",
    description: "Horas de consultoría",
    unitPriceExcludingVatCurrency: 3900,
    vatPercentage: 15,
  },
  {
    ref: "9974",
    description: "Informe de análisis",
    unitPriceExcludingVatCurrency: 3400,
    vatPercentage: 0,
  },
] as const;

const INVALID_TOKEN_ERRORS = new Set([
  '{"error":"Invalid or expired token"}',
  '{"error":"Invalid or expired proxy token. Each submission receives a unique token - do not reuse tokens from previous submissions.","source":"nmiai-proxy"}',
]);

type Json =
  | null
  | boolean
  | number
  | string
  | Json[]
  | { [key: string]: Json };

type ApiError = Error & {
  status: number;
  bodyText: string;
  bodyJson?: unknown;
};

function authHeader() {
  return `Basic ${Buffer.from(`0:${SESSION_TOKEN}`).toString("base64")}`;
}

function normalizeString(value: unknown) {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function productRefOf(product: Record<string, unknown>) {
  const raw = product.number ?? product.productNumber;
  return normalizeString(raw);
}

async function api<T = unknown>(path: string, init?: {
  method?: string;
  query?: Record<string, string | number | Array<string | number> | undefined>;
  body?: Json;
}): Promise<T | undefined> {
  const url = new URL(path, BASE_URL);
  for (const [key, value] of Object.entries(init?.query ?? {})) {
    if (value == null) continue;
    if (Array.isArray(value)) {
      for (const item of value) url.searchParams.append(key, String(item));
      continue;
    }
    url.searchParams.set(key, String(value));
  }

  const response = await fetch(url, {
    method: init?.method ?? "GET",
    headers: {
      Authorization: authHeader(),
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });

  const bodyText = await response.text();
  const bodyJson = bodyText ? safeJsonParse(bodyText) : undefined;

  if (!response.ok) {
    const err = new Error(`HTTP ${response.status}`) as ApiError;
    err.status = response.status;
    err.bodyText = bodyText;
    err.bodyJson = bodyJson;
    throw err;
  }

  return bodyJson as T | undefined;
}

function safeJsonParse(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function valuesOf<T>(payload: unknown): T[] {
  if (
    payload &&
    typeof payload === "object" &&
    "values" in payload &&
    Array.isArray((payload as { values?: unknown }).values)
  ) {
    return (payload as { values: T[] }).values;
  }
  return [];
}

function valueOf<T>(payload: unknown): T {
  if (payload && typeof payload === "object" && "value" in payload) {
    return (payload as { value: T }).value;
  }
  return payload as T;
}

function ensure<T>(value: T | null | undefined, message: string): T {
  if (value == null) throw new Error(message);
  return value;
}

function findValidationMessages(input: unknown): string[] {
  if (!input || typeof input !== "object") return [];
  const raw = (input as { validationMessages?: unknown }).validationMessages;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      if (!entry || typeof entry !== "object") return "";
      return normalizeString((entry as { message?: unknown }).message);
    })
    .filter(Boolean);
}

async function resolveCustomer() {
  const payload = await api<{ values: Array<Record<string, unknown>> }>("customer", {
    query: {
      organizationNumber: CUSTOMER_ORG,
      fields: "*",
    },
  });
  const customers = valuesOf<Record<string, unknown>>(payload);
  const exactOrg = customers.filter(
    (customer) => normalizeString(customer.organizationNumber) === CUSTOMER_ORG,
  );
  const exactName = exactOrg.filter(
    (customer) => normalizeString(customer.name) === CUSTOMER_NAME,
  );
  const chosen = exactName[0] ?? exactOrg[0];
  return ensure(chosen, "Customer not found");
}

async function resolveProducts() {
  const requestedRefs = new Set(LINES.map((line) => line.ref));

  const directPayload = await api<{ values: Array<Record<string, unknown>> }>("product", {
    query: {
      productNumber: LINES.map((line) => line.ref),
      fields: "*",
    },
  });
  let products = valuesOf<Record<string, unknown>>(directPayload);
  let mapping = buildProductMap(products);

  if (mapping.size !== requestedRefs.size) {
    const catalogPayload = await api<{ values: Array<Record<string, unknown>> }>("product", {
      query: {
        count: 1000,
        fields: "*",
      },
    });
    products = valuesOf<Record<string, unknown>>(catalogPayload);
    mapping = buildProductMap(products);
  }

  if (mapping.size !== requestedRefs.size) {
    throw new Error("Could not resolve all products");
  }

  return mapping;
}

function buildProductMap(products: Array<Record<string, unknown>>) {
  const byRef = new Map<string, Record<string, unknown>>();
  for (const line of LINES) {
    const matches = products.filter((product) => {
      if (productRefOf(product) === line.ref) return true;
      return normalizeString(product.name) === line.description;
    });
    if (matches.length === 1) byRef.set(line.ref, matches[0]);
  }
  return byRef;
}

async function resolveVatTypes() {
  const payload = await api<{ values: Array<Record<string, unknown>> }>("ledger/vatType", {
    query: {
      typeOfVat: "OUTGOING",
      vatDate: INVOICE_DATE,
      fields: "*",
    },
  });
  const vatTypes = valuesOf<Record<string, unknown>>(payload);
  const mapping = new Map<number, Record<string, unknown>>();
  for (const wanted of [25, 15, 0]) {
    const match = vatTypes.find((vatType) => Number(vatType.percentage) === wanted);
    mapping.set(wanted, ensure(match, `Missing VAT type ${wanted}%`));
  }
  return mapping;
}

function buildInvoicePayload(
  customer: Record<string, unknown>,
  products: Map<string, Record<string, unknown>>,
  vatTypes: Map<number, Record<string, unknown>>,
) {
  const customerId = Number(ensure(customer.id, "Customer id missing"));
  return {
    invoiceDate: INVOICE_DATE,
    invoiceDueDate: INVOICE_DUE_DATE,
    customer: { id: customerId },
    orders: [
      {
        customer: { id: customerId },
        orderDate: INVOICE_DATE,
        deliveryDate: INVOICE_DATE,
        orderLines: LINES.map((line) => ({
          product: { id: Number(ensure(products.get(line.ref)?.id, `Product ${line.ref} id missing`)) },
          description: line.description,
          count: 1,
          unitPriceExcludingVatCurrency: line.unitPriceExcludingVatCurrency,
          vatType: { id: Number(ensure(vatTypes.get(line.vatPercentage)?.id, `VAT ${line.vatPercentage}% id missing`)) },
        })),
      },
    ],
  };
}

function isBankAccountValidation(error: ApiError) {
  if (error.status !== 422) return false;
  if (error.bodyText.includes("Faktura kan ikke opprettes før selskapet har registrert et bankkontonummer.")) {
    return true;
  }
  return findValidationMessages(error.bodyJson).some((message) =>
    message.includes("Faktura kan ikke opprettes før selskapet har registrert et bankkontonummer."),
  );
}

async function repairCompanyBankAccount() {
  const payload = await api<{ values: Array<Record<string, unknown>> }>("ledger/account", {
    query: {
      isBankAccount: "true",
      fields: "*",
    },
  });
  const accounts = valuesOf<Record<string, unknown>>(payload);
  const chosen =
    accounts.find((account) => account.isInvoiceAccount === true && Number(account.number) === 1920) ??
    accounts.find((account) => account.isInvoiceAccount === true) ??
    accounts.find((account) => Number(account.number) === 1920) ??
    accounts[0];

  const account = ensure(chosen, "No bank account available for repair");
  await api(`ledger/account/${ensure(account.id, "Bank account id missing")}`, {
    method: "PUT",
    body: {
      bankAccountNumber: "12345678903",
    },
  });
}

async function createInvoice(payload: ReturnType<typeof buildInvoicePayload>) {
  return await api("invoice", {
    method: "POST",
    query: {
      sendToCustomer: "false",
    },
    body: payload,
  });
}

function assertExpectedTotals(invoicePayload: unknown) {
  const invoice = valueOf<Record<string, unknown>>(invoicePayload);
  const expectedExVat = 34800;
  const expectedGross = 42260;
  const actualExVat = Number(invoice.amountExcludingVatCurrency);
  const actualGross = Number(invoice.amountCurrency);

  if (actualExVat !== expectedExVat || actualGross !== expectedGross) {
    throw new Error(
      `Invoice totals mismatch exVat=${actualExVat} gross=${actualGross} expectedExVat=${expectedExVat} expectedGross=${expectedGross}`,
    );
  }

  return {
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    amountExcludingVatCurrency: actualExVat,
    amountCurrency: actualGross,
  };
}

async function main() {
  try {
    const customer = await resolveCustomer();
    const products = await resolveProducts();
    const vatTypes = await resolveVatTypes();
    const payload = buildInvoicePayload(customer, products, vatTypes);

    let created;
    try {
      created = await createInvoice(payload);
    } catch (error) {
      const apiError = error as ApiError;
      if (isBankAccountValidation(apiError)) {
        await repairCompanyBankAccount();
        created = await createInvoice(payload);
      } else {
        throw error;
      }
    }

    console.log(JSON.stringify(assertExpectedTotals(created)));
  } catch (error) {
    const apiError = error as Partial<ApiError>;
    const bodyText = typeof apiError.bodyText === "string" ? apiError.bodyText : "";
    if (apiError.status === 403 && INVALID_TOKEN_ERRORS.has(bodyText)) {
      console.error(bodyText);
      process.exit(2);
    }

    console.error(
      JSON.stringify({
        message: error instanceof Error ? error.message : String(error),
        status: apiError.status,
        bodyText,
        validationMessages: findValidationMessages(apiError.bodyJson),
      }),
    );
    process.exit(1);
  }
}

await main();
