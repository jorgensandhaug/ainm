const BASE_URL = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const SESSION_TOKEN = "IfMxTEqyYpoNmJQ4XdEKdAd1AvMGRsjH5Fmtvg3FUdM";

const INVOICE_DATE = "2026-03-20";
const INVOICE_DUE_DATE = "2026-04-03";
const CUSTOMER_ORG_NO = "925760838";
const CUSTOMER_NAME = "Lumière SARL";
const BANK_ACCOUNT_REPAIR_NUMBER = "12345678903";

const LINE_SPECS = [
  { ref: "3644", description: "Maintenance", unitPriceExcludingVatCurrency: 1850, vatPercentage: 25 },
  { ref: "4934", description: "Licence logicielle", unitPriceExcludingVatCurrency: 14850, vatPercentage: 15 },
  { ref: "8806", description: "Service réseau", unitPriceExcludingVatCurrency: 17250, vatPercentage: 0 },
] as const;

type ApiResult<T = unknown> = {
  status: number;
  data: T;
  text: string;
};

let callCount = 0;

function authHeader() {
  return `Basic ${Buffer.from(`0:${SESSION_TOKEN}`).toString("base64")}`;
}

function buildUrl(path: string, query?: Record<string, string | string[] | number | boolean | undefined>) {
  const normalizedPath = path.replace(/^\/+/, "");
  const url = new URL(normalizedPath, `${BASE_URL.replace(/\/+$/, "")}/`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined) continue;
      if (Array.isArray(value)) {
        for (const item of value) url.searchParams.append(key, String(item));
      } else {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url;
}

async function api<T = unknown>(
  method: string,
  path: string,
  options: {
    query?: Record<string, string | string[] | number | boolean | undefined>;
    body?: unknown;
    expectedStatuses?: number[];
  } = {},
): Promise<ApiResult<T>> {
  callCount += 1;
  const response = await fetch(buildUrl(path, options.query), {
    method,
    headers: {
      Authorization: authHeader(),
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  const expected = new Set(options.expectedStatuses ?? [200]);

  if (!expected.has(response.status)) {
    const error = new Error(`${method} ${path} failed with ${response.status}: ${text}`);
    (error as Error & { status?: number; data?: unknown; path?: string }).status = response.status;
    (error as Error & { status?: number; data?: unknown; path?: string }).data = data;
    (error as Error & { status?: number; data?: unknown; path?: string }).path = path;
    throw error;
  }

  return { status: response.status, data: data as T, text };
}

function isInvalidTokenError(error: unknown) {
  const data = (error as { data?: { error?: string } })?.data;
  return (error as { status?: number })?.status === 403 && data?.error === "Invalid or expired token";
}

function isBankAccountValidationError(error: unknown) {
  const text = String((error as { message?: string })?.message ?? "");
  const data = (error as { data?: { message?: string; error?: string } })?.data;
  return (
    text.includes("Faktura kan ikke opprettes før selskapet har registrert et bankkontonummer") ||
    data?.message?.includes("Faktura kan ikke opprettes før selskapet har registrert et bankkontonummer") ||
    data?.error?.includes?.("Faktura kan ikke opprettes før selskapet har registrert et bankkontonummer")
  );
}

function getValues<T>(payload: unknown): T[] {
  return Array.isArray((payload as { values?: unknown[] })?.values)
    ? ((payload as { values: T[] }).values ?? [])
    : [];
}

function getValue<T>(payload: unknown): T {
  return (payload as { value: T }).value;
}

function matchesProductRef(product: Record<string, unknown>, ref: string) {
  const number = product.number;
  const productNumber = product.productNumber;
  const id = product.id;
  return String(number ?? "") === ref || String(productNumber ?? "") === ref || String(id ?? "") === ref;
}

function matchesProductName(product: Record<string, unknown>, name: string) {
  return String(product.name ?? "") === name || String(product.description ?? "") === name;
}

async function resolveCustomer() {
  const result = await api<{ values: Array<Record<string, unknown>> }>("GET", "/customer", {
    query: { organizationNumber: CUSTOMER_ORG_NO, fields: "*" },
  });
  const customers = getValues<Record<string, unknown>>(result.data);
  const exactOrgMatches = customers.filter((customer) => String(customer.organizationNumber ?? "") === CUSTOMER_ORG_NO);
  const exactNameMatches = exactOrgMatches.filter((customer) => String(customer.name ?? "") === CUSTOMER_NAME);
  const picked = exactNameMatches[0] ?? exactOrgMatches[0];
  if (!picked?.id) {
    throw new Error(`Customer not resolved for org ${CUSTOMER_ORG_NO}`);
  }
  return picked;
}

async function resolveProducts() {
  const refs = LINE_SPECS.map((line) => line.ref);
  const resolved = new Map<string, Record<string, unknown>>();

  const first = await api<{ values: Array<Record<string, unknown>> }>("GET", "/product", {
    query: { productNumber: refs, fields: "*" },
  });
  for (const product of getValues<Record<string, unknown>>(first.data)) {
    const match = LINE_SPECS.find((line) => matchesProductRef(product, line.ref));
    if (match) resolved.set(match.ref, product);
  }

  if (resolved.size < LINE_SPECS.length) {
    const second = await api<{ values: Array<Record<string, unknown>> }>("GET", "/product", {
      query: { ids: refs.join(","), fields: "*" },
    });
    for (const product of getValues<Record<string, unknown>>(second.data)) {
      const match = LINE_SPECS.find((line) => matchesProductRef(product, line.ref));
      if (match) resolved.set(match.ref, product);
    }
  }

  if (resolved.size < LINE_SPECS.length) {
    const third = await api<{ values: Array<Record<string, unknown>> }>("GET", "/product", {
      query: { count: 1000, fields: "*" },
    });
    for (const line of LINE_SPECS) {
      if (resolved.has(line.ref)) continue;
      const candidates = getValues<Record<string, unknown>>(third.data).filter(
        (product) => matchesProductRef(product, line.ref) || matchesProductName(product, line.description),
      );
      const exactRef = candidates.find((product) => matchesProductRef(product, line.ref));
      const exactName = candidates.find((product) => matchesProductName(product, line.description));
      const picked = exactRef ?? exactName;
      if (picked) resolved.set(line.ref, picked);
    }
  }

  if (resolved.size < LINE_SPECS.length) {
    const missing = LINE_SPECS.filter((line) => !resolved.has(line.ref)).map((line) => line.ref);
    throw new Error(`Products not resolved: ${missing.join(", ")}`);
  }

  return LINE_SPECS.map((line) => {
    const product = resolved.get(line.ref)!;
    if (!product.id) throw new Error(`Resolved product ${line.ref} missing id`);
    return { line, product };
  });
}

async function resolveVatTypes() {
  const result = await api<{ values: Array<Record<string, unknown>> }>("GET", "/ledger/vatType", {
    query: { typeOfVat: "OUTGOING", vatDate: INVOICE_DATE, fields: "*" },
  });
  const vatTypes = getValues<Record<string, unknown>>(result.data);
  const byId = new Map<string, Record<string, unknown>>();
  const byPercentage = new Map<number, Array<Record<string, unknown>>>();

  for (const vatType of vatTypes) {
    if (vatType.id !== undefined) byId.set(String(vatType.id), vatType);
    const percentage = Number(vatType.percentage);
    if (!Number.isNaN(percentage)) {
      const list = byPercentage.get(percentage) ?? [];
      list.push(vatType);
      byPercentage.set(percentage, list);
    }
  }

  return { byId, byPercentage };
}

function chooseVatTypeId(
  desiredPercentage: number,
  product: Record<string, unknown>,
  vats: Awaited<ReturnType<typeof resolveVatTypes>>,
) {
  const currentVatId = (product.vatType as { id?: number | string } | undefined)?.id;
  if (currentVatId !== undefined) {
    const currentVat = vats.byId.get(String(currentVatId));
    if (currentVat && Number(currentVat.percentage) === desiredPercentage) {
      return Number(currentVat.id);
    }
  }

  const candidates = vats.byPercentage.get(desiredPercentage) ?? [];
  if (candidates.length === 1) return Number(candidates[0].id);

  if (currentVatId !== undefined) {
    const sameId = candidates.find((vatType) => String(vatType.id) === String(currentVatId));
    if (sameId) return Number(sameId.id);
  }

  if (candidates.length > 1) {
    const scored = [...candidates].sort((a, b) => Number(a.id) - Number(b.id));
    return Number(scored[0].id);
  }

  throw new Error(`VAT type not resolved for ${desiredPercentage}%`);
}

function buildInvoicePayload(customerId: number, products: Awaited<ReturnType<typeof resolveProducts>>, vats: Awaited<ReturnType<typeof resolveVatTypes>>) {
  return {
    invoiceDate: INVOICE_DATE,
    invoiceDueDate: INVOICE_DUE_DATE,
    customer: { id: customerId },
    orders: [
      {
        customer: { id: customerId },
        orderDate: INVOICE_DATE,
        deliveryDate: INVOICE_DATE,
        orderLines: products.map(({ line, product }) => ({
          product: { id: Number(product.id) },
          description: line.description,
          count: 1,
          unitPriceExcludingVatCurrency: line.unitPriceExcludingVatCurrency,
          vatType: { id: chooseVatTypeId(line.vatPercentage, product, vats) },
        })),
      },
    ],
  };
}

async function repairBankAccount() {
  const result = await api<{ values: Array<Record<string, unknown>> }>("GET", "/ledger/account", {
    query: { isBankAccount: true, fields: "*" },
  });
  const accounts = getValues<Record<string, unknown>>(result.data);
  const picked =
    accounts.find((account) => account.isInvoiceAccount === true) ??
    accounts.find((account) => String(account.number ?? "") === "1920") ??
    accounts[0];

  if (!picked?.id) {
    throw new Error("No bank account available for repair");
  }

  await api("PUT", `/ledger/account/${picked.id}`, {
    body: { bankAccountNumber: BANK_ACCOUNT_REPAIR_NUMBER },
    expectedStatuses: [200],
  });
}

function getInvoiceTotals(invoice: Record<string, unknown>) {
  const exVat =
    invoice.amountExcludingVatCurrency ??
    invoice.amountExcludingVat ??
    invoice.amountExcludingVatInCurrency;
  const total = invoice.amountCurrency ?? invoice.amount;
  return {
    amountExcludingVatCurrency: exVat === undefined ? undefined : Number(exVat),
    amountCurrency: total === undefined ? undefined : Number(total),
  };
}

async function createInvoice(payload: ReturnType<typeof buildInvoicePayload>) {
  return api<{ value: Record<string, unknown> }>("POST", "/invoice", {
    query: { sendToCustomer: false },
    body: payload,
    expectedStatuses: [200, 201],
  });
}

async function main() {
  try {
    const customer = await resolveCustomer();
    const products = await resolveProducts();
    const vats = await resolveVatTypes();
    const payload = buildInvoicePayload(Number(customer.id), products, vats);

    let invoiceResponse;
    try {
      invoiceResponse = await createInvoice(payload);
    } catch (error) {
      if (!isBankAccountValidationError(error)) throw error;
      await repairBankAccount();
      invoiceResponse = await createInvoice(payload);
    }

    const invoice = getValue<Record<string, unknown>>(invoiceResponse.data);
    const { amountExcludingVatCurrency, amountCurrency } = getInvoiceTotals(invoice);

    if (
      amountExcludingVatCurrency !== undefined &&
      amountCurrency !== undefined &&
      (amountExcludingVatCurrency !== 33950 || amountCurrency !== 36640)
    ) {
      const verification = await api<{ value: Record<string, unknown> }>("GET", `/invoice/${invoice.id}`, {
        query: {
          fields: "*,customer(*),orders(*,orderLines(*,product(*),vatType(*))),orderLines(*,product(*),vatType(*))",
        },
      });
      const verifiedInvoice = getValue<Record<string, unknown>>(verification.data);
      const verifiedTotals = getInvoiceTotals(verifiedInvoice);
      if (verifiedTotals.amountExcludingVatCurrency !== 33950 || verifiedTotals.amountCurrency !== 36640) {
        throw new Error(`Invoice totals mismatch after verification: ${JSON.stringify(verifiedTotals)}`);
      }
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          callCount,
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          amountExcludingVatCurrency,
          amountCurrency,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    if (isInvalidTokenError(error)) {
      console.error(JSON.stringify({ ok: false, blocked: "invalid_or_expired_token", callCount }, null, 2));
      process.exit(2);
    }

    const message = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify({ ok: false, callCount, error: message }, null, 2));
    process.exit(1);
  }
}

await main();
