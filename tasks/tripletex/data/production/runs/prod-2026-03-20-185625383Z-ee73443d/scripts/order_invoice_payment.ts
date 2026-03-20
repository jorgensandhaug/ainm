const BASE_URL = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const SESSION_TOKEN = "jHEeYHf4jBqgggruYGjhvUrGD4tBUcLSa9XSjmJvcXE";
const RUN_DATE = "2026-03-20";

const CUSTOMER = {
  name: "Waldstein GmbH",
  organizationNumber: "975687821",
};

const TARGET_LINES = [
  {
    name: "Netzwerkdienst",
    ref: "4366",
    unitPriceExcludingVatCurrency: 32750,
  },
  {
    name: "Beratungsstunden",
    ref: "3402",
    unitPriceExcludingVatCurrency: 17450,
  },
];

const authHeader = `Basic ${Buffer.from(`0:${SESSION_TOKEN}`).toString("base64")}`;

function buildUrl(path: string): string {
  const normalizedBase = BASE_URL.endsWith("/") ? BASE_URL : `${BASE_URL}/`;
  return new URL(path, normalizedBase).toString();
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  if (path.startsWith("/")) {
    throw new Error(`Path must not start with '/': ${path}`);
  }

  const response = await fetch(buildUrl(path), {
    ...init,
    headers: {
      Authorization: authHeader,
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    if (
      response.status === 403 &&
      data &&
      typeof data === "object" &&
      "error" in data &&
      data.error === "Invalid or expired token"
    ) {
      throw new Error("Blocked: invalid or expired token");
    }
    const details =
      data && typeof data === "object" ? JSON.stringify(data) : text || "<empty>";
    throw new Error(`HTTP ${response.status} for ${path}: ${details}`);
  }

  return data as T;
}

function normalize(value: unknown): string {
  return String(value ?? "").trim();
}

function pickExactCustomer(values: any[]): any {
  const exact = values.filter(
    (customer) =>
      normalize(customer.organizationNumber) === CUSTOMER.organizationNumber &&
      normalize(customer.name) === CUSTOMER.name,
  );
  if (exact.length === 1) {
    return exact[0];
  }

  const orgOnly = values.filter(
    (customer) => normalize(customer.organizationNumber) === CUSTOMER.organizationNumber,
  );
  if (orgOnly.length === 1) {
    return orgOnly[0];
  }

  throw new Error(`Customer resolution failed: ${JSON.stringify(values)}`);
}

function mapProductsBy(
  products: any[],
  key: "productNumber" | "id",
): Map<string, any> {
  const map = new Map<string, any>();
  for (const product of products) {
    const value = normalize(product[key]);
    if (value) {
      map.set(value, product);
    }
  }
  return map;
}

function resolveExactLines(products: any[], key: "productNumber" | "id"): any[] | null {
  const productMap = mapProductsBy(products, key);
  const resolved = TARGET_LINES.map((line) => productMap.get(line.ref));
  if (resolved.every(Boolean)) {
    return resolved;
  }
  return null;
}

function resolveCatalogFallback(products: any[]): any[] | null {
  const resolved = TARGET_LINES.map((line) =>
    products.find(
      (product) =>
        normalize(product.productNumber) === line.ref &&
        normalize(product.name) === line.name,
    ) ??
    products.find(
      (product) =>
        normalize(product.productNumber) === line.ref || normalize(product.name) === line.name,
    ),
  );
  if (resolved.every(Boolean)) {
    return resolved;
  }
  return null;
}

function choosePaymentType(values: any[]): any {
  const normalized = values
    .map((paymentType) => {
      const accountNumber = normalize(paymentType?.debitAccount?.number).replace(/\s+/g, "");
      return { paymentType, accountNumber };
    })
    .filter(({ accountNumber }) => accountNumber.startsWith("19"));

  const preferred =
    normalized.find(
      ({ paymentType }) =>
        paymentType?.debitAccount?.isBankAccount === true ||
        paymentType?.debitAccount?.isInvoiceAccount === true,
    ) ??
    normalized.find(({ paymentType }) => normalize(paymentType?.name) === "Betalt til bank") ??
    normalized[0];

  if (!preferred) {
    throw new Error(`No usable payment type found: ${JSON.stringify(values)}`);
  }

  return preferred.paymentType;
}

async function main() {
  const customerResponse = await api<{ values?: any[] }>(
    `customer?organizationNumber=${encodeURIComponent(CUSTOMER.organizationNumber)}&fields=*`,
  );
  const customerValues = customerResponse.values ?? [];
  const customer = pickExactCustomer(customerValues);

  const refs = TARGET_LINES.map((line) => `productNumber=${encodeURIComponent(line.ref)}`).join("&");
  const productResponse = await api<{ values?: any[] }>(`product?${refs}&fields=*`);
  let resolvedProducts = resolveExactLines(productResponse.values ?? [], "productNumber");

  if (!resolvedProducts) {
    const idsQuery = TARGET_LINES.map((line) => line.ref).join(",");
    const idFallbackResponse = await api<{ values?: any[] }>(`product?ids=${encodeURIComponent(idsQuery)}&fields=*`);
    resolvedProducts = resolveExactLines(idFallbackResponse.values ?? [], "id");
  }

  if (!resolvedProducts) {
    const catalogResponse = await api<{ values?: any[] }>("product?count=1000&fields=*");
    resolvedProducts = resolveCatalogFallback(catalogResponse.values ?? []);
  }

  if (!resolvedProducts) {
    throw new Error("Product resolution failed");
  }

  const orderPayload = {
    customer: { id: customer.id },
    orderDate: RUN_DATE,
    deliveryDate: RUN_DATE,
    orderLines: TARGET_LINES.map((line, index) => ({
      product: { id: resolvedProducts![index].id },
      description: line.name,
      count: 1,
      unitPriceExcludingVatCurrency: line.unitPriceExcludingVatCurrency,
    })),
  };

  const orderResponse = await api<{ value?: any }>("order", {
    method: "POST",
    body: JSON.stringify(orderPayload),
  });
  const orderId = orderResponse.value?.id;
  if (!orderId) {
    throw new Error(`Order creation returned no id: ${JSON.stringify(orderResponse)}`);
  }

  let invoiceResponse: { value?: any };
  try {
    invoiceResponse = await api<{ value?: any }>(
      `order/${orderId}/:invoice?invoiceDate=${RUN_DATE}&sendToCustomer=false`,
      { method: "PUT" },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("Faktura kan ikke opprettes før selskapet har registrert et bankkontonummer.")) {
      throw error;
    }

    const accountResponse = await api<{ values?: any[] }>("ledger/account?isBankAccount=true&fields=*");
    const bankAccounts = accountResponse.values ?? [];
    const invoiceAccount =
      bankAccounts.find((account) => account?.isInvoiceAccount === true) ?? bankAccounts[0];
    if (!invoiceAccount?.id) {
      throw new Error(`No bank account available for repair: ${JSON.stringify(bankAccounts)}`);
    }

    const existingNumber = normalize(invoiceAccount.bankAccountNumber).replace(/\s+/g, "");
    const repairedNumber = existingNumber && /^\d{11}$/.test(existingNumber) ? existingNumber : "12345678901";

    await api(`ledger/account/${invoiceAccount.id}`, {
      method: "PUT",
      body: JSON.stringify({
        ...invoiceAccount,
        bankAccountNumber: repairedNumber,
      }),
    });

    invoiceResponse = await api<{ value?: any }>(
      `order/${orderId}/:invoice?invoiceDate=${RUN_DATE}&sendToCustomer=false`,
      { method: "PUT" },
    );
  }

  const invoice = invoiceResponse.value;
  const invoiceId = invoice?.id;
  const outstanding = invoice?.amountCurrencyOutstanding ?? invoice?.amountOutstanding;
  if (!invoiceId || outstanding == null) {
    throw new Error(`Invoice response missing id/outstanding: ${JSON.stringify(invoiceResponse)}`);
  }

  const paymentTypeResponse = await api<{ values?: any[] }>(
    "invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)",
  );
  const paymentType = choosePaymentType(paymentTypeResponse.values ?? []);

  const paymentResponse = await api<{ value?: any }>(
    `invoice/${invoiceId}/:payment?paymentDate=${RUN_DATE}&paymentTypeId=${paymentType.id}&paidAmount=${encodeURIComponent(
      String(outstanding),
    )}`,
    { method: "PUT" },
  );

  const remaining =
    paymentResponse.value?.amountCurrencyOutstanding ?? paymentResponse.value?.amountOutstanding;
  if (Number(remaining) !== 0) {
    throw new Error(`Invoice still outstanding: ${JSON.stringify(paymentResponse)}`);
  }

  console.log(
    JSON.stringify({
      customerId: customer.id,
      orderId,
      invoiceId,
      invoiceNumber: invoice.invoiceNumber,
      paymentTypeId: paymentType.id,
      paidAmount: outstanding,
      remainingOutstanding: remaining,
    }),
  );
}

await main();
