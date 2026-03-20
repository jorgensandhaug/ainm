const BASE_URL = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const SESSION_TOKEN = "l9NdbCaPYC34iakW7AYPmJRiWo1DPRgjI5-GuQ_vnt0";
const DATE = "2026-03-20";

type Wrapper<T> = { value: T };
type ListResponse<T> = { values?: T[]; fullResultSize?: number };

type Customer = {
  id: number;
  name?: string;
  displayName?: string;
  customerName?: string;
  organizationNumber?: string;
};

type Product = {
  id: number;
  name?: string;
  displayName?: string;
  productNumber?: string | number;
};

type Account = {
  id?: number;
  number?: string | number;
  isBankAccount?: boolean;
  isInvoiceAccount?: boolean;
};

type PaymentType = {
  id: number;
  description?: string;
  displayName?: string;
  sequence?: number;
  debitAccount?: Account | null;
  creditAccount?: Account | null;
};

type Invoice = {
  id: number;
  invoiceNumber?: string | number;
  amountExcludingVatCurrency?: number;
  amountOutstanding?: number;
  amountCurrencyOutstanding?: number;
  orderLines?: Array<{
    description?: string;
    amountExcludingVatCurrency?: number;
    product?: { id?: number; name?: string; productNumber?: string | number };
  }>;
  orders?: Array<{
    id?: number;
    orderLines?: Array<{
      description?: string;
      amountExcludingVatCurrency?: number;
      product?: { id?: number; name?: string; productNumber?: string | number };
    }>;
  }>;
};

const authHeader = `Basic ${Buffer.from(`0:${SESSION_TOKEN}`).toString("base64")}`;

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: authHeader,
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json; charset=utf-8" } : {}),
      ...(init?.headers ?? {}),
    },
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(
      JSON.stringify({
        status: response.status,
        path,
        data,
      }),
    );
  }

  return data as T;
}

function one<T>(values: T[] | undefined, label: string): T {
  if (!values || values.length !== 1) {
    throw new Error(`${label}: expected exactly 1 match, got ${values?.length ?? 0}`);
  }
  return values[0];
}

function exactProductMatch(product: Product, target: { ref: string; name: string }): boolean {
  const num = product.productNumber == null ? "" : String(product.productNumber);
  return num === target.ref || product.name === target.name || product.displayName === target.name;
}

async function resolveProducts(): Promise<[Product, Product]> {
  const targets = [
    { ref: "9057", name: "Datarådgjeving" },
    { ref: "4573", name: "Programvarelisens" },
  ];

  const byProductNumber = await api<ListResponse<Product>>(
    `/product?productNumber=9057&productNumber=4573&fields=*`,
  );
  const p1a = byProductNumber.values?.find((product) => exactProductMatch(product, targets[0]));
  const p2a = byProductNumber.values?.find((product) => exactProductMatch(product, targets[1]));
  if (p1a && p2a) {
    return [p1a, p2a];
  }

  const byIds = await api<ListResponse<Product>>(`/product?ids=9057,4573&fields=*`);
  const p1b = byIds.values?.find((product) => exactProductMatch(product, targets[0]));
  const p2b = byIds.values?.find((product) => exactProductMatch(product, targets[1]));
  if (p1b && p2b) {
    return [p1b, p2b];
  }

  const byName = await api<ListResponse<Product>>(`/product?count=1000&fields=*`);
  const p1c = byName.values?.find((product) => exactProductMatch(product, targets[0]));
  const p2c = byName.values?.find((product) => exactProductMatch(product, targets[1]));
  if (p1c && p2c) {
    return [p1c, p2c];
  }

  throw new Error("Products not resolved");
}

function paymentTypeScore(paymentType: PaymentType): number {
  const debitNumber = paymentType.debitAccount?.number == null ? "" : String(paymentType.debitAccount.number);
  const desc = `${paymentType.description ?? ""} ${paymentType.displayName ?? ""}`.toLowerCase();
  let score = 0;
  if (debitNumber.startsWith("19")) score += 100;
  if (paymentType.debitAccount?.isBankAccount) score += 20;
  if (paymentType.debitAccount?.isInvoiceAccount) score += 10;
  if (desc.includes("bank")) score += 5;
  if (desc.includes("betalt")) score += 3;
  score -= paymentType.sequence ?? 0;
  return score;
}

async function main() {
  const customerResp = await api<ListResponse<Customer>>(
    `/customer?organizationNumber=951788031&fields=*`,
  );
  const customer = one(customerResp.values, "customer");

  const [consultingProduct, licenseProduct] = await resolveProducts();

  const orderResp = await api<Wrapper<{ id: number }>>(`/order`, {
    method: "POST",
    body: JSON.stringify({
      customer: { id: customer.id },
      orderDate: DATE,
      deliveryDate: DATE,
      orderLines: [
        {
          product: { id: consultingProduct.id },
          description: "Datarådgjeving",
          count: 1,
          unitPriceExcludingVatCurrency: 36900,
        },
        {
          product: { id: licenseProduct.id },
          description: "Programvarelisens",
          count: 1,
          unitPriceExcludingVatCurrency: 19450,
        },
      ],
    }),
  });

  const orderId = orderResp.value.id;

  const invoiceResp = await api<Wrapper<Invoice>>(
    `/order/${orderId}/:invoice?invoiceDate=${encodeURIComponent(DATE)}&sendToCustomer=false`,
    { method: "PUT" },
  );
  const invoice = invoiceResp.value;

  const outstanding = invoice.amountCurrencyOutstanding ?? invoice.amountOutstanding;
  if (outstanding == null || !(outstanding > 0)) {
    throw new Error(`Unexpected outstanding amount: ${outstanding}`);
  }

  const paymentTypesResp = await api<ListResponse<PaymentType>>(
    `/invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)`,
  );
  const paymentTypes = paymentTypesResp.values ?? [];
  const paymentType = paymentTypes
    .filter((candidate) => String(candidate.debitAccount?.number ?? "").startsWith("19"))
    .sort((a, b) => paymentTypeScore(b) - paymentTypeScore(a))[0];

  if (!paymentType) {
    throw new Error("No usable payment type found");
  }

  const paymentResp = await api<Wrapper<Invoice>>(
    `/invoice/${invoice.id}/:payment?paymentDate=${encodeURIComponent(DATE)}&paymentTypeId=${paymentType.id}&paidAmount=${encodeURIComponent(String(outstanding))}&paidAmountCurrency=${encodeURIComponent(String(outstanding))}`,
    { method: "PUT" },
  );
  const paidInvoice = paymentResp.value;
  const remaining = paidInvoice.amountCurrencyOutstanding ?? paidInvoice.amountOutstanding;
  if (remaining !== 0) {
    throw new Error(`Invoice still outstanding: ${remaining}`);
  }

  console.log(
    JSON.stringify(
      {
        customerId: customer.id,
        productIds: [consultingProduct.id, licenseProduct.id],
        orderId,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        paymentTypeId: paymentType.id,
        amountPaid: outstanding,
        remainingOutstanding: remaining,
      },
      null,
      2,
    ),
  );
}

await main();
