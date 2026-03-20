const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const SESSION_TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const RUN_DATE = "2026-03-20";

const TARGET = {
  customer: {
    name: "Sandbox Waldstein GmbH",
    organizationNumber: "975687821",
  },
  lines: [
    { name: "Netzwerkdienst", ref: "4366", unitPriceExcludingVatCurrency: 32750 },
    { name: "Beratungsstunden", ref: "3402", unitPriceExcludingVatCurrency: 17450 },
  ],
};

const authHeader = `Basic ${Buffer.from(`0:${SESSION_TOKEN}`).toString("base64")}`;
const setupCalls: string[] = [];
const pathCalls: string[] = [];

function buildUrl(path: string): string {
  const normalizedBase = BASE_URL.endsWith("/") ? BASE_URL : `${BASE_URL}/`;
  return new URL(path, normalizedBase).toString();
}

async function api<T>(
  bucket: "setup" | "path",
  path: string,
  init?: RequestInit,
): Promise<T> {
  if (path.startsWith("/")) throw new Error(`Leading slash not allowed: ${path}`);
  (bucket === "setup" ? setupCalls : pathCalls).push(`${init?.method ?? "GET"} ${path}`);
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
    throw new Error(`HTTP ${response.status} ${path}: ${text}`);
  }
  return data as T;
}

function normalize(value: unknown): string {
  return String(value ?? "").trim();
}

async function ensureCustomer(): Promise<any> {
  const response = await api<{ values?: any[] }>(
    "setup",
    `customer?organizationNumber=${encodeURIComponent(TARGET.customer.organizationNumber)}&fields=*`,
  );
  const existing =
    (response.values ?? []).find(
      (customer) =>
        normalize(customer.organizationNumber) === TARGET.customer.organizationNumber,
    ) ?? null;
  if (existing) return existing;

  const created = await api<{ value?: any }>("setup", "customer", {
    method: "POST",
    body: JSON.stringify({
      name: TARGET.customer.name,
      organizationNumber: TARGET.customer.organizationNumber,
    }),
  });
  if (!created.value?.id) throw new Error(`Customer create failed: ${JSON.stringify(created)}`);
  return created.value;
}

async function ensureProducts(): Promise<any[]> {
  const refs = TARGET.lines.map((line) => `productNumber=${encodeURIComponent(line.ref)}`).join("&");
  const response = await api<{ values?: any[] }>("setup", `product?${refs}&fields=*`);
  const byNumber = new Map<string, any>();
  for (const product of response.values ?? []) {
    const keys = [normalize(product.number), normalize(product.productNumber)].filter(Boolean);
    for (const key of keys) byNumber.set(key, product);
  }

  const results: any[] = [];
  for (const line of TARGET.lines) {
    const existing = byNumber.get(line.ref);
    if (existing) {
      results.push(existing);
      continue;
    }

    const created = await api<{ value?: any }>("setup", "product", {
      method: "POST",
      body: JSON.stringify({
        name: line.name,
        number: line.ref,
        priceExcludingVatCurrency: line.unitPriceExcludingVatCurrency,
      }),
    });
    if (!created.value?.id) throw new Error(`Product create failed: ${JSON.stringify(created)}`);
    results.push(created.value);
  }

  return results;
}

function choosePaymentType(values: any[]): any {
  const bankish = values
    .map((paymentType) => ({
      paymentType,
      debitNumber: normalize(paymentType?.debitAccount?.number).replace(/\s+/g, ""),
    }))
    .filter(({ debitNumber }) => debitNumber.startsWith("19"));

  const preferred =
    bankish.find(
      ({ paymentType }) =>
        paymentType?.debitAccount?.isBankAccount === true ||
        paymentType?.debitAccount?.isInvoiceAccount === true,
    ) ??
    bankish.find(({ paymentType }) => normalize(paymentType?.name) === "Betalt til bank") ??
    bankish[0];

  if (!preferred) throw new Error(`No payment type: ${JSON.stringify(values)}`);
  return preferred.paymentType;
}

async function runExactPath(customer: any, products: any[]) {
  const refs = TARGET.lines.map((line) => `productNumber=${encodeURIComponent(line.ref)}`).join("&");
  const customerRead = await api<{ values?: any[] }>(
    "path",
    `customer?organizationNumber=${encodeURIComponent(TARGET.customer.organizationNumber)}&fields=*`,
  );
  const productRead = await api<{ values?: any[] }>("path", `product?${refs}&fields=*`);

  const exactCustomer = (customerRead.values ?? []).find(
    (value) => normalize(value.organizationNumber) === TARGET.customer.organizationNumber,
  );
  if (!exactCustomer?.id || exactCustomer.id !== customer.id) {
    throw new Error(`Customer read mismatch: ${JSON.stringify(customerRead)}`);
  }

  const productMap = new Map(
    (productRead.values ?? []).flatMap((product) =>
      [normalize(product.number), normalize(product.productNumber)]
        .filter(Boolean)
        .map((key) => [key, product] as const),
    ),
  );
  const resolvedProducts = TARGET.lines.map((line) => productMap.get(line.ref));
  if (!resolvedProducts.every(Boolean)) {
    throw new Error(`Exact path product-number lookup failed: ${JSON.stringify(productRead)}`);
  }

  const orderWrite = await api<{ value?: any }>("path", "order", {
    method: "POST",
    body: JSON.stringify({
      customer: { id: exactCustomer.id },
      orderDate: RUN_DATE,
      deliveryDate: RUN_DATE,
      orderLines: TARGET.lines.map((line, index) => ({
        product: { id: resolvedProducts[index].id },
        description: line.name,
        count: 1,
        unitPriceExcludingVatCurrency: line.unitPriceExcludingVatCurrency,
      })),
    }),
  });
  const orderId = orderWrite.value?.id;
  if (!orderId) throw new Error(`Order write failed: ${JSON.stringify(orderWrite)}`);

  const invoiceWrite = await api<{ value?: any }>(
    "path",
    `order/${orderId}/:invoice?invoiceDate=${RUN_DATE}&sendToCustomer=false`,
    { method: "PUT" },
  );
  const invoice = invoiceWrite.value;
  const outstanding = invoice?.amountCurrencyOutstanding ?? invoice?.amountOutstanding;
  if (!invoice?.id || outstanding == null) {
    throw new Error(`Invoice write failed: ${JSON.stringify(invoiceWrite)}`);
  }

  const paymentTypeRead = await api<{ values?: any[] }>(
    "path",
    "invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)",
  );
  const paymentType = choosePaymentType(paymentTypeRead.values ?? []);

  const paymentWrite = await api<{ value?: any }>(
    "path",
    `invoice/${invoice.id}/:payment?paymentDate=${RUN_DATE}&paymentTypeId=${paymentType.id}&paidAmount=${encodeURIComponent(
      String(outstanding),
    )}`,
    { method: "PUT" },
  );
  const remaining =
    paymentWrite.value?.amountCurrencyOutstanding ?? paymentWrite.value?.amountOutstanding;
  if (Number(remaining) !== 0) {
    throw new Error(`Payment write failed: ${JSON.stringify(paymentWrite)}`);
  }

  return {
    orderId,
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    outstanding,
    paymentTypeId: paymentType.id,
    remaining,
  };
}

async function main() {
  const customer = await ensureCustomer();
  const products = await ensureProducts();
  const result = await runExactPath(customer, products);
  console.log(
    JSON.stringify({
      setupCallCount: setupCalls.length,
      setupCalls,
      pathCallCount: pathCalls.length,
      pathCalls,
      result,
    }),
  );
}

await main();
