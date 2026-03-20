const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const TODAY = "2026-03-20";

type ListWrapper<T> = { values?: T[]; fullResultSize?: number };
type ValueWrapper<T> = { value?: T };

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
};

type VatType = {
  id: number;
  number?: string | number;
  displayName?: string;
  percentage?: number;
};

type PaymentType = {
  id: number;
  displayName?: string;
  debitAccount?: {
    number?: string | number;
    isBankAccount?: boolean;
    isInvoiceAccount?: boolean;
  } | null;
};

type Invoice = {
  id: number;
  invoiceNumber?: string | number;
  amountOutstanding?: number;
  amountCurrencyOutstanding?: number;
};

let apiCallCount = 0;

const auth = `Basic ${Buffer.from(`0:${TOKEN}`).toString("base64")}`;

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  apiCallCount += 1;
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: auth,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      JSON.stringify({
        method: init?.method ?? "GET",
        path,
        status: response.status,
        body: text,
      }),
    );
  }

  return (text ? JSON.parse(text) : null) as T;
}

function valuesOf<T>(wrapper: ListWrapper<T>): T[] {
  return Array.isArray(wrapper.values) ? wrapper.values : [];
}

function unwrap<T>(wrapper: ValueWrapper<T>): T {
  if (!wrapper?.value) throw new Error("Missing value");
  return wrapper.value;
}

function toStr(value: unknown): string {
  return value == null ? "" : String(value);
}

async function ensureCustomer(): Promise<Customer> {
  const existing = valuesOf(
    await api<ListWrapper<Customer>>(`/customer?organizationNumber=864062245&fields=*`),
  ).find((customer) => customer.organizationNumber === "864062245");

  if (existing) return existing;

  return unwrap(
    await api<ValueWrapper<Customer>>(`/customer`, {
      method: "POST",
      body: JSON.stringify({
        name: "Montanha Lda",
        organizationNumber: "864062245",
        email: "montanha-864062245@example.no",
      }),
    }),
  );
}

async function resolveOutgoingVat(): Promise<VatType> {
  const vatTypes = valuesOf(
    await api<ListWrapper<VatType>>(
      `/ledger/vatType?typeOfVat=OUTGOING&vatDate=${TODAY}&fields=*`,
    ),
  );
  const vatType =
    vatTypes.find((item) => Number(item.percentage) === 25) ??
    vatTypes.find((item) => toStr(item.number) === "3") ??
    vatTypes[0];

  if (!vatType) throw new Error("No outgoing VAT type available");
  return vatType;
}

async function ensureProducts(): Promise<void> {
  const existing = valuesOf(
    await api<ListWrapper<Product>>(
      `/product?productNumber=6749&productNumber=3048&fields=*`,
    ),
  );
  const have6749 = existing.some(
    (product) => toStr(product.number) === "6749" || toStr(product.productNumber) === "6749",
  );
  const have3048 = existing.some(
    (product) => toStr(product.number) === "3048" || toStr(product.productNumber) === "3048",
  );

  if (have6749 && have3048) return;

  const vatType = await resolveOutgoingVat();

  if (!have6749) {
    await api<ValueWrapper<Product>>(`/product`, {
      method: "POST",
      body: JSON.stringify({
        name: "Licença de software",
        number: "6749",
        priceExcludingVatCurrency: 4950,
        vatType: { id: vatType.id },
      }),
    });
  }

  if (!have3048) {
    await api<ValueWrapper<Product>>(`/product`, {
      method: "POST",
      body: JSON.stringify({
        name: "Armazenamento na nuvem",
        number: "3048",
        priceExcludingVatCurrency: 7700,
        vatType: { id: vatType.id },
      }),
    });
  }
}

async function exactFlow() {
  const startCalls = apiCallCount;

  const customer = valuesOf(
    await api<ListWrapper<Customer>>(`/customer?organizationNumber=864062245&fields=*`),
  ).find((item) => item.organizationNumber === "864062245");
  if (!customer) throw new Error("Customer missing for exact flow");

  const products = valuesOf(
    await api<ListWrapper<Product>>(`/product?productNumber=6749&productNumber=3048&fields=*`),
  );
  const software = products.find(
    (product) =>
      (toStr(product.number) === "6749" || toStr(product.productNumber) === "6749") &&
      product.name === "Licença de software",
  );
  const storage = products.find(
    (product) =>
      (toStr(product.number) === "3048" || toStr(product.productNumber) === "3048") &&
      product.name === "Armazenamento na nuvem",
  );
  if (!software || !storage) throw new Error(`Products missing for exact flow: ${JSON.stringify(products)}`);

  const order = unwrap(
    await api<ValueWrapper<{ id: number }>>(`/order`, {
      method: "POST",
      body: JSON.stringify({
        customer: { id: customer.id },
        orderDate: TODAY,
        deliveryDate: TODAY,
        orderLines: [
          {
            product: { id: software.id },
            description: "Licença de software",
            count: 1,
            unitPriceExcludingVatCurrency: 4950,
          },
          {
            product: { id: storage.id },
            description: "Armazenamento na nuvem",
            count: 1,
            unitPriceExcludingVatCurrency: 7700,
          },
        ],
      }),
    }),
  );

  const invoice = unwrap(
    await api<ValueWrapper<Invoice>>(
      `/order/${order.id}/:invoice?invoiceDate=${TODAY}&sendToCustomer=false`,
      { method: "PUT" },
    ),
  );

  const paymentTypes = valuesOf(
    await api<ListWrapper<PaymentType>>(
      `/invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)`,
    ),
  );
  const paymentType =
    paymentTypes.find(
      (type) =>
        toStr(type.debitAccount?.number).startsWith("19") &&
        (type.debitAccount?.isBankAccount || type.debitAccount?.isInvoiceAccount),
    ) ??
    paymentTypes.find((type) => toStr(type.debitAccount?.number).startsWith("19")) ??
    paymentTypes[0];
  if (!paymentType) throw new Error("No payment type found");

  const paidAmount = invoice.amountCurrencyOutstanding ?? invoice.amountOutstanding;
  if (typeof paidAmount !== "number") throw new Error(`Invoice missing outstanding amount: ${JSON.stringify(invoice)}`);

  const paid = unwrap(
    await api<ValueWrapper<Invoice>>(
      `/invoice/${invoice.id}/:payment?paymentDate=${TODAY}&paymentTypeId=${paymentType.id}&paidAmount=${paidAmount}`,
      { method: "PUT" },
    ),
  );

  const outstanding = paid.amountCurrencyOutstanding ?? paid.amountOutstanding;
  if (outstanding !== 0) throw new Error(`Outstanding not zero: ${JSON.stringify(paid)}`);

  return {
    downstreamCallCount: apiCallCount - startCalls,
    customerId: customer.id,
    productIds: [software.id, storage.id],
    orderId: order.id,
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    paymentTypeId: paymentType.id,
    paidAmount,
    outstanding,
  };
}

async function main() {
  const setupStart = apiCallCount;
  const customer = await ensureCustomer();
  await ensureProducts();
  const setupCalls = apiCallCount - setupStart;
  const result = await exactFlow();

  console.log(
    JSON.stringify(
      {
        setupCalls,
        totalCalls: apiCallCount,
        customerId: customer.id,
        ...result,
      },
      null,
      2,
    ),
  );
}

await main();
