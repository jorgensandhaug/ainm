const BASE_URL = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const SESSION_TOKEN = "C-QB1MpRfrM1VivNmsIuPr64jATLnvhHRJ_GldDG4Ns";

const INVOICE_DATE = "2026-03-20";
const INVOICE_DUE_DATE = addDays(INVOICE_DATE, 14);

const CUSTOMER_TARGET = {
  name: "Havbris AS",
  organizationNumber: "977448239",
};

const LINE_TARGETS = [
  {
    name: "Konsulenttimer",
    ref: "6390",
    unitPriceExcludingVatCurrency: 2850,
    vatPercentage: 25,
  },
  {
    name: "Systemutvikling",
    ref: "1652",
    unitPriceExcludingVatCurrency: 2650,
    vatPercentage: 15,
  },
  {
    name: "Webdesign",
    ref: "3273",
    unitPriceExcludingVatCurrency: 7400,
    vatPercentage: 0,
  },
] as const;

const EXPECTED_EX_VAT = LINE_TARGETS.reduce(
  (sum, line) => sum + line.unitPriceExcludingVatCurrency,
  0,
);
const EXPECTED_TOTAL = LINE_TARGETS.reduce(
  (sum, line) =>
    sum +
    line.unitPriceExcludingVatCurrency * (1 + line.vatPercentage / 100),
  0,
);

class HttpError extends Error {
  status: number;
  body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

class BlockedCredentialsError extends Error {}

type ApiOptions = {
  query?: Record<string, string | number | Array<string | number>>;
  body?: unknown;
  expectedStatuses?: number[];
};

type Customer = {
  id: number;
  name?: string;
  organizationNumber?: string;
};

type Product = {
  id: number;
  name?: string;
  number?: string | number;
  productNumber?: string | number;
  priceExcludingVatCurrency?: number;
  priceIncludingVatCurrency?: number;
  vatType?: {
    id?: number;
    percentage?: number;
  };
};

type VatType = {
  id: number;
  percentage?: number;
  name?: string;
};

type LedgerAccount = {
  id: number;
  number?: string | number;
  isBankAccount?: boolean;
  isInvoiceAccount?: boolean;
  bankAccountNumber?: string;
};

type ResolvedLine = (typeof LINE_TARGETS)[number] & {
  product: Product;
};

let apiCallCount = 0;

async function api<T = unknown>(
  method: string,
  path: string,
  options: ApiOptions = {},
): Promise<T> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (Array.isArray(value)) {
      for (const item of value) {
        query.append(key, String(item));
      }
      continue;
    }
    query.set(key, String(value));
  }

  const base = BASE_URL.endsWith("/") ? BASE_URL : `${BASE_URL}/`;
  const url = new URL(path, base);
  if ([...query.keys()].length > 0) {
    url.search = query.toString();
  }

  apiCallCount += 1;

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Basic ${btoa(`0:${SESSION_TOKEN}`)}`,
      Accept: "application/json",
      ...(options.body === undefined
        ? {}
        : { "Content-Type": "application/json" }),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  const text = await response.text();
  const parsed = text ? safeJsonParse(text) : undefined;

  if (response.status === 403 && isBlockedTokenBody(parsed)) {
    throw new BlockedCredentialsError(JSON.stringify(parsed));
  }

  const expectedStatuses = options.expectedStatuses ?? [200];
  if (!expectedStatuses.includes(response.status)) {
    throw new HttpError(
      `${method} ${url.pathname}${url.search} failed`,
      response.status,
      parsed ?? text,
    );
  }

  return parsed as T;
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function isBlockedTokenBody(body: unknown): boolean {
  if (!body || typeof body !== "object") {
    return false;
  }
  const error = (body as Record<string, unknown>).error;
  return (
    error === "Invalid or expired token" ||
    error ===
      "Invalid or expired proxy token. Each submission receives a unique token - do not reuse tokens from previous submissions."
  );
}

function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function normalizeNumber(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return String(value).trim();
}

function approxEqual(a: number, b: number, tolerance = 0.01): boolean {
  return Math.abs(a - b) <= tolerance;
}

function inferVatPercentage(product: Product): number | null {
  if (typeof product.vatType?.percentage === "number") {
    return product.vatType.percentage;
  }

  const ex = product.priceExcludingVatCurrency;
  const inc = product.priceIncludingVatCurrency;
  if (
    typeof ex === "number" &&
    typeof inc === "number" &&
    ex > 0 &&
    inc >= ex
  ) {
    return Number((((inc - ex) / ex) * 100).toFixed(2));
  }

  return null;
}

function unwrapValues<T>(payload: unknown): T[] {
  if (
    payload &&
    typeof payload === "object" &&
    Array.isArray((payload as Record<string, unknown>).values)
  ) {
    return (payload as { values: T[] }).values;
  }
  return [];
}

function unwrapValue<T>(payload: unknown): T | null {
  if (
    payload &&
    typeof payload === "object" &&
    (payload as Record<string, unknown>).value
  ) {
    return (payload as { value: T }).value;
  }
  return null;
}

async function resolveCustomer(): Promise<Customer> {
  const payload = await api("GET", "customer", {
    query: {
      organizationNumber: CUSTOMER_TARGET.organizationNumber,
      fields: "*",
    },
  });

  const customers = unwrapValues<Customer>(payload).filter(
    (customer) =>
      customer.organizationNumber === CUSTOMER_TARGET.organizationNumber,
  );

  const exactName = customers.filter(
    (customer) => customer.name === CUSTOMER_TARGET.name,
  );

  if (exactName.length === 1) {
    return exactName[0];
  }
  if (customers.length === 1) {
    return customers[0];
  }

  throw new Error("Could not uniquely resolve customer");
}

async function resolveProducts(): Promise<ResolvedLine[]> {
  const directPayload = await api("GET", "product", {
    query: {
      productNumber: LINE_TARGETS.map((line) => line.ref),
      fields: "*",
    },
  });

  const directProducts = unwrapValues<Product>(directPayload);
  const directResolved = resolveLinesFromProducts(directProducts);
  if (directResolved) {
    return directResolved;
  }

  const catalogPayload = await api("GET", "product", {
    query: {
      count: 1000,
      fields: "*",
    },
  });
  const catalogProducts = unwrapValues<Product>(catalogPayload);
  const catalogResolved = resolveLinesFromProducts(catalogProducts);
  if (catalogResolved) {
    return catalogResolved;
  }

  throw new Error("Could not uniquely resolve products");
}

function resolveLinesFromProducts(products: Product[]): ResolvedLine[] | null {
  const resolved: ResolvedLine[] = [];

  for (const target of LINE_TARGETS) {
    const candidates = products.filter((product) => {
      const number =
        normalizeNumber(product.number) ??
        normalizeNumber(product.productNumber);
      return number === target.ref || product.name === target.name;
    });

    const exactBoth = candidates.filter((product) => {
      const number =
        normalizeNumber(product.number) ??
        normalizeNumber(product.productNumber);
      return number === target.ref && product.name === target.name;
    });
    const exactNumber = candidates.filter((product) => {
      const number =
        normalizeNumber(product.number) ??
        normalizeNumber(product.productNumber);
      return number === target.ref;
    });
    const exactName = candidates.filter((product) => product.name === target.name);

    const chosenSet =
      exactBoth.length === 1
        ? exactBoth
        : exactNumber.length === 1
          ? exactNumber
          : exactName.length === 1
            ? exactName
            : [];

    if (chosenSet.length !== 1) {
      return null;
    }

    const product = chosenSet[0];
    if (typeof product.id !== "number") {
      return null;
    }

    resolved.push({ ...target, product });
  }

  const uniqueIds = new Set(resolved.map((line) => line.product.id));
  if (uniqueIds.size !== LINE_TARGETS.length) {
    return null;
  }

  return resolved;
}

async function resolveVatTypesIfNeeded(
  lines: ResolvedLine[],
): Promise<Map<number, number> | null> {
  let mismatchDetected = false;
  let allKnown = true;

  for (const line of lines) {
    const inferred = inferVatPercentage(line.product);
    if (inferred === null) {
      allKnown = false;
      continue;
    }
    if (!approxEqual(inferred, line.vatPercentage)) {
      mismatchDetected = true;
    }
  }

  if (allKnown && !mismatchDetected) {
    return null;
  }

  const payload = await api("GET", "ledger/vatType", {
    query: {
      typeOfVat: "OUTGOING",
      vatDate: INVOICE_DATE,
      fields: "*",
    },
  });

  const vatTypes = unwrapValues<VatType>(payload);
  const byPercentage = new Map<number, number>();
  for (const vatType of vatTypes) {
    if (typeof vatType.id === "number" && typeof vatType.percentage === "number") {
      byPercentage.set(vatType.percentage, vatType.id);
    }
  }

  const result = new Map<number, number>();
  for (const line of lines) {
    const vatId = byPercentage.get(line.vatPercentage);
    if (typeof vatId === "number") {
      result.set(line.product.id, vatId);
    }
  }

  const haveAllExplicit = lines.every((line) => result.has(line.product.id));
  if (haveAllExplicit) {
    return result;
  }

  if (mismatchDetected) {
    throw new Error("Could not resolve required VAT types for explicit override");
  }

  const fallback = new Map<number, number>();
  for (const line of lines) {
    const vatId = line.product.vatType?.id;
    if (typeof vatId !== "number") {
      return result.size > 0 ? result : null;
    }
    fallback.set(line.product.id, vatId);
  }

  return fallback;
}

function buildInvoiceBody(
  customerId: number,
  lines: ResolvedLine[],
  vatTypeIdsByProductId: Map<number, number> | null,
): Record<string, unknown> {
  return {
    invoiceDate: INVOICE_DATE,
    invoiceDueDate: INVOICE_DUE_DATE,
    customer: { id: customerId },
    orders: [
      {
        customer: { id: customerId },
        orderDate: INVOICE_DATE,
        deliveryDate: INVOICE_DATE,
        orderLines: lines.map((line) => {
          const explicitVatId = vatTypeIdsByProductId?.get(line.product.id);
          return {
            product: { id: line.product.id },
            description: line.name,
            count: 1,
            unitPriceExcludingVatCurrency: line.unitPriceExcludingVatCurrency,
            ...(typeof explicitVatId === "number"
              ? { vatType: { id: explicitVatId } }
              : {}),
          };
        }),
      },
    ],
  };
}

function validationMessages(body: unknown): string[] {
  if (!body || typeof body !== "object") {
    return [];
  }
  const messages = (body as Record<string, unknown>).validationMessages;
  if (!Array.isArray(messages)) {
    return [];
  }
  return messages
    .map((message) => {
      if (message && typeof message === "object") {
        const record = message as Record<string, unknown>;
        if (typeof record.message === "string") {
          return record.message;
        }
      }
      return null;
    })
    .filter((message): message is string => Boolean(message));
}

function bodyContainsBankAccountError(body: unknown): boolean {
  const serialized = JSON.stringify(body);
  if (
    serialized.includes(
      "Faktura kan ikke opprettes før selskapet har registrert et bankkontonummer.",
    )
  ) {
    return true;
  }
  return validationMessages(body).some((message) =>
    message.includes("bankkontonummer"),
  );
}

function chooseInvoiceBankAccount(accounts: LedgerAccount[]): LedgerAccount | null {
  return (
    accounts.find((account) => account.isInvoiceAccount && account.isBankAccount) ??
    accounts.find((account) => normalizeNumber(account.number) === "1920") ??
    accounts.find((account) => account.isBankAccount) ??
    null
  );
}

function generateBankAccountNumber(): string {
  const digits = `${Date.now()}12345678903`.replace(/\D/g, "");
  return digits.slice(-11);
}

async function repairCompanyBankAccount(): Promise<void> {
  const payload = await api("GET", "ledger/account", {
    query: {
      isBankAccount: "true",
      fields: "*",
    },
  });

  const accounts = unwrapValues<LedgerAccount>(payload);
  const account = chooseInvoiceBankAccount(accounts);
  if (!account) {
    throw new Error("Could not resolve invoice bank account");
  }

  await api("PUT", `ledger/account/${account.id}`, {
    body: {
      bankAccountNumber: generateBankAccountNumber(),
    },
    expectedStatuses: [200],
  });
}

async function createInvoice(
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  return await api<Record<string, unknown>>("POST", "invoice", {
    query: {
      sendToCustomer: "false",
    },
    body,
    expectedStatuses: [200, 201],
  });
}

function assertInvoiceTotals(invoice: Record<string, unknown>): void {
  const exVat = Number(invoice.amountExcludingVatCurrency);
  const total = Number(invoice.amountCurrency);
  if (!approxEqual(exVat, EXPECTED_EX_VAT) || !approxEqual(total, EXPECTED_TOTAL)) {
    throw new Error(
      `Unexpected invoice totals: exVat=${exVat}, total=${total}, expectedExVat=${EXPECTED_EX_VAT}, expectedTotal=${EXPECTED_TOTAL}`,
    );
  }
}

async function main(): Promise<void> {
  const customer = await resolveCustomer();
  const lines = await resolveProducts();
  const vatTypeIdsByProductId = await resolveVatTypesIfNeeded(lines);
  const invoiceBody = buildInvoiceBody(customer.id, lines, vatTypeIdsByProductId);

  let invoicePayload: Record<string, unknown>;
  try {
    invoicePayload = await createInvoice(invoiceBody);
  } catch (error) {
    if (
      error instanceof HttpError &&
      error.status === 422 &&
      bodyContainsBankAccountError(error.body)
    ) {
      await repairCompanyBankAccount();
      invoicePayload = await createInvoice(invoiceBody);
    } else {
      throw error;
    }
  }

  const invoice = unwrapValue<Record<string, unknown>>(invoicePayload);
  if (!invoice || typeof invoice.id !== "number") {
    throw new Error("Invoice create response missing invoice id");
  }
  assertInvoiceTotals(invoice);

  console.log(
    JSON.stringify(
      {
        ok: true,
        apiCallCount,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber ?? null,
        amountExcludingVatCurrency: invoice.amountExcludingVatCurrency ?? null,
        amountCurrency: invoice.amountCurrency ?? null,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  if (error instanceof BlockedCredentialsError) {
    console.error(
      JSON.stringify(
        {
          ok: false,
          blocked: "credentials",
          apiCallCount,
          error: error.message,
        },
        null,
        2,
      ),
    );
    process.exit(2);
  }

  if (error instanceof HttpError) {
    console.error(
      JSON.stringify(
        {
          ok: false,
          apiCallCount,
          status: error.status,
          error: error.message,
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
        ok: false,
        apiCallCount,
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    ),
  );
  process.exit(1);
});
