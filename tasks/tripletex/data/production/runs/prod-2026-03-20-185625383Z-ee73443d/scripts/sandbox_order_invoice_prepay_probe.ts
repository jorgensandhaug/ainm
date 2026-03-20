const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const SESSION_TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const RUN_DATE = "2026-03-20";

const CUSTOMER = {
  organizationNumber: "975687821",
};

const LINES = [
  { name: "Netzwerkdienst", ref: "4366", unitPriceExcludingVatCurrency: 32750 },
  { name: "Beratungsstunden", ref: "3402", unitPriceExcludingVatCurrency: 17450 },
];
const SEED_PREPAYMENT = "0.01";

const authHeader = `Basic ${Buffer.from(`0:${SESSION_TOKEN}`).toString("base64")}`;
const calls: string[] = [];

function buildUrl(path: string): string {
  return new URL(path, BASE_URL.endsWith("/") ? BASE_URL : `${BASE_URL}/`).toString();
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  if (path.startsWith("/")) throw new Error(`Leading slash not allowed: ${path}`);
  calls.push(`${init?.method ?? "GET"} ${path}`);
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

async function main() {
  const customerResponse = await api<{ values?: any[] }>(
    `customer?organizationNumber=${encodeURIComponent(CUSTOMER.organizationNumber)}&fields=*`,
  );
  const customer = (customerResponse.values ?? []).find(
    (value) => normalize(value.organizationNumber) === CUSTOMER.organizationNumber,
  );
  if (!customer?.id) throw new Error(`Customer not found: ${JSON.stringify(customerResponse)}`);

  const productQuery = LINES.map((line) => `productNumber=${encodeURIComponent(line.ref)}`).join("&");
  const productResponse = await api<{ values?: any[] }>(`product?${productQuery}&fields=*`);
  const productMap = new Map<string, any>();
  for (const product of productResponse.values ?? []) {
    for (const key of [normalize(product.number), normalize(product.productNumber)].filter(Boolean)) {
      productMap.set(key, product);
    }
  }
  const products = LINES.map((line) => productMap.get(line.ref));
  if (!products.every(Boolean)) throw new Error(`Products not found: ${JSON.stringify(productResponse)}`);

  const paymentTypeResponse = await api<{ values?: any[] }>(
    "invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)",
  );
  const paymentType = choosePaymentType(paymentTypeResponse.values ?? []);

  const orderResponse = await api<{ value?: any }>("order", {
    method: "POST",
    body: JSON.stringify({
      customer: { id: customer.id },
      orderDate: RUN_DATE,
      deliveryDate: RUN_DATE,
      orderLines: LINES.map((line, index) => ({
        product: { id: products[index].id },
        description: line.name,
        count: 1,
        unitPriceExcludingVatCurrency: line.unitPriceExcludingVatCurrency,
      })),
    }),
  });
  const orderId = orderResponse.value?.id;
  if (!orderId) throw new Error(`Order create failed: ${JSON.stringify(orderResponse)}`);

  const invoiceResponse = await api<{ value?: any }>(
    `order/${orderId}/:invoice?invoiceDate=${RUN_DATE}&sendToCustomer=false&paymentTypeId=${paymentType.id}&paidAmount=${SEED_PREPAYMENT}&paymentTypeIdRestAmount=${paymentType.id}`,
    { method: "PUT" },
  );
  const invoice = invoiceResponse.value;
  const remaining = invoice?.amountCurrencyOutstanding ?? invoice?.amountOutstanding;
  if (Number(remaining) !== 0) {
    throw new Error(`Invoice not fully settled: ${JSON.stringify(invoiceResponse)}`);
  }

  console.log(
    JSON.stringify({
      callCount: calls.length,
      calls,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      amountExcludingVatCurrency: invoice.amountExcludingVatCurrency,
      amountCurrency: invoice.amountCurrency,
      remaining,
      paymentTypeId: paymentType.id,
    }),
  );
}

await main();
