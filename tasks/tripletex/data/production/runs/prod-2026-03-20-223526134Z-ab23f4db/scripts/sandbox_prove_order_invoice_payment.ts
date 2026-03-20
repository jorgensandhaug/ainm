const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const sessionToken =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const today = "2026-03-20";
const customerOrgNo = "975687821";
const wantedProducts = [
  { name: "Netzwerkdienst", ref: "4366", price: 13450 },
  { name: "Beratungsstunden", ref: "3402", price: 14200 },
];

type ApiEnvelope<T> = {
  value?: T;
  values?: T[];
  message?: string;
  error?: string;
  validationMessages?: Array<{ message?: string }>;
};

type Customer = {
  id: number;
  organizationNumber?: string;
};

type Product = {
  id: number;
  name?: string;
  number?: string | number;
  productNumber?: string | number;
};

type PaymentType = {
  id: number;
  name?: string | null;
  debitAccount?: {
    number?: string | number;
    isBankAccount?: boolean;
    isInvoiceAccount?: boolean;
  };
  creditAccount?: {
    number?: string | number;
  } | null;
};

type Order = { id: number };

type Invoice = {
  id: number;
  invoiceNumber?: string | number;
  amountCurrencyOutstanding?: number | null;
  amountOutstanding?: number | null;
  amountExcludingVatCurrency?: number | null;
  amountCurrency?: number | null;
};

class HttpError extends Error {
  status: number;
  parsed: any;

  constructor(status: number, parsed: any) {
    super(`HTTP ${status}`);
    this.status = status;
    this.parsed = parsed;
  }
}

const auth = Buffer.from(`0:${sessionToken}`).toString("base64");

function endpoint(pathAndQuery: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/${pathAndQuery}`;
}

async function request<T>(
  pathAndQuery: string,
  init: RequestInit = {},
): Promise<ApiEnvelope<T>> {
  const res = await fetch(endpoint(pathAndQuery), {
    ...init,
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
  });

  const text = await res.text();
  const parsed = text ? JSON.parse(text) : {};
  if (!res.ok) throw new HttpError(res.status, parsed);
  return parsed as ApiEnvelope<T>;
}

function normalizedProductRef(product: Product): string {
  return String(product.productNumber ?? product.number ?? "");
}

function choosePaymentType(values: PaymentType[] | undefined): PaymentType | undefined {
  const all = values ?? [];
  return (
    all.find(
      (paymentType) =>
        paymentType.debitAccount?.isBankAccount === true &&
        String(paymentType.debitAccount?.number ?? "") === "1920",
    ) ??
    all.find(
      (paymentType) =>
        paymentType.debitAccount?.isBankAccount === true ||
        paymentType.debitAccount?.isInvoiceAccount === true,
    ) ??
    all.find((paymentType) => String(paymentType.debitAccount?.number ?? "").startsWith("19")) ??
    all[0]
  );
}

const customerRes = await request<Customer>(
  `customer?organizationNumber=${encodeURIComponent(customerOrgNo)}&fields=*`,
);
const customer = customerRes.values?.find((value) => value.organizationNumber === customerOrgNo);
if (!customer?.id) throw new Error("Sandbox customer not found");

const productRes = await request<Product>(
  wantedProducts
    .map((product) => `productNumber=${encodeURIComponent(product.ref)}`)
    .reduce((path, param, index) => `${path}${index === 0 ? "" : "&"}${param}`, "product?")
    .concat("&fields=*"),
);
const productsByRef = new Map(
  (productRes.values ?? []).map((product) => [normalizedProductRef(product), product]),
);
for (const wanted of wantedProducts) {
  if (!productsByRef.get(wanted.ref)?.id) {
    throw new Error(`Sandbox product missing: ${wanted.ref}`);
  }
}

const paymentTypeRes = await request<PaymentType>(
  "invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)",
);
const paymentType = choosePaymentType(paymentTypeRes.values);
if (!paymentType?.id) throw new Error("Sandbox payment type not found");

const orderRes = await request<Order>("order", {
  method: "POST",
  body: JSON.stringify({
    customer: { id: customer.id },
    orderDate: today,
    deliveryDate: today,
    orderLines: wantedProducts.map((wanted) => ({
      product: { id: productsByRef.get(wanted.ref)!.id },
      description: wanted.name,
      count: 1,
      unitPriceExcludingVatCurrency: wanted.price,
    })),
  }),
});
if (!orderRes.value?.id) throw new Error("Sandbox order create failed");

const invoiceRes = await request<Invoice>(
  `order/${orderRes.value.id}/:invoice?invoiceDate=${today}&sendToCustomer=false&paymentTypeId=${paymentType.id}&paidAmount=0.01&paymentTypeIdRestAmount=${paymentType.id}`,
  { method: "PUT" },
);
const invoice = invoiceRes.value;
const outstanding = invoice?.amountCurrencyOutstanding ?? invoice?.amountOutstanding;
if (!invoice?.id || outstanding !== 0) {
  throw new Error(
    `Sandbox invoice write did not settle outstanding amount. ${JSON.stringify(invoice)}`,
  );
}

console.log(
  JSON.stringify({
    ok: true,
    customerId: customer.id,
    orderId: orderRes.value.id,
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber ?? null,
    paymentTypeId: paymentType.id,
    paymentTypeName: paymentType.name ?? null,
    debitAccountNumber: paymentType.debitAccount?.number ?? null,
    creditAccountNumber: paymentType.creditAccount?.number ?? null,
    amountExcludingVatCurrency: invoice.amountExcludingVatCurrency ?? null,
    amountCurrency: invoice.amountCurrency ?? null,
    outstanding,
  }),
);
