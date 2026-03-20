const BASE_URL = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "kVsvmuvujTfWa7PoBWEmasr9kKUeHHJlyoN6CBACzH0";
const TODAY = "2026-03-20";

type TripletexList<T> = {
  values?: T[];
  fullResultSize?: number;
};

type TripletexValue<T> = {
  value?: T;
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
};

type Order = {
  id: number;
};

type Account = {
  id: number;
  number?: string | number;
  name?: string;
  isBankAccount?: boolean;
  isInvoiceAccount?: boolean;
  bankAccountNumber?: string;
};

type PaymentType = {
  id: number;
  name?: string;
  debitAccount?: Account | null;
  creditAccount?: Account | null;
};

type Invoice = {
  id: number;
  invoiceNumber?: string | number;
  amountOutstanding?: number;
  amountCurrencyOutstanding?: number;
};

const auth = `Basic ${Buffer.from(`0:${TOKEN}`).toString("base64")}`;

async function tripletex<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: auth,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      JSON.stringify({
        method: init?.method ?? "GET",
        path,
        status: response.status,
        body: text,
      }),
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

function valuesOf<T>(wrapper: TripletexList<T>): T[] {
  return Array.isArray(wrapper.values) ? wrapper.values : [];
}

function unwrap<T>(wrapper: TripletexValue<T>): T {
  if (!wrapper?.value) throw new Error("Missing value wrapper");
  return wrapper.value;
}

function asString(value: unknown): string {
  return value == null ? "" : String(value);
}

function exactProductMatch(product: Product, ref: string, name: string): boolean {
  return (
    asString(product.productNumber) === ref ||
    asString(product.number) === ref ||
    product.name === name
  );
}

async function resolveCustomer(): Promise<Customer> {
  const wrapper = await tripletex<TripletexList<Customer>>(
    `/customer?organizationNumber=864062245&fields=*`,
  );
  const customer = valuesOf(wrapper).find(
    (item) => item.organizationNumber === "864062245",
  );
  if (!customer) throw new Error("Customer Montanha Lda not found");
  return customer;
}

async function resolveProducts(): Promise<{ software: Product; storage: Product }> {
  const wanted = [
    { ref: "6749", name: "Licença de software" },
    { ref: "3048", name: "Armazenamento na nuvem" },
  ];

  const byProductNumber = valuesOf(
    await tripletex<TripletexList<Product>>(
      `/product?productNumber=6749&productNumber=3048&fields=*`,
    ),
  );

  let pool = byProductNumber;
  let matched = wanted.map((w) =>
    pool.find((product) => exactProductMatch(product, w.ref, w.name)),
  );

  if (matched.some((item) => !item)) {
    const byIds = valuesOf(
      await tripletex<TripletexList<Product>>(`/product?ids=6749,3048&fields=*`),
    );
    pool = [...byProductNumber, ...byIds];
    matched = wanted.map((w) =>
      pool.find((product) => exactProductMatch(product, w.ref, w.name)),
    );
  }

  if (matched.some((item) => !item)) {
    const allProducts = valuesOf(
      await tripletex<TripletexList<Product>>(`/product?count=1000&fields=*`),
    );
    pool = [...pool, ...allProducts];
    matched = wanted.map((w) =>
      pool.find((product) => exactProductMatch(product, w.ref, w.name)),
    );
  }

  const [software, storage] = matched;
  if (!software || !storage) {
    throw new Error(
      `Failed to resolve products: ${JSON.stringify(
        pool.map((product) => ({
          id: product.id,
          name: product.name,
          number: product.number,
          productNumber: product.productNumber,
        })),
      )}`,
    );
  }

  return { software, storage };
}

async function createOrder(customerId: number, softwareId: number, storageId: number): Promise<Order> {
  const wrapper = await tripletex<TripletexValue<Order>>(`/order`, {
    method: "POST",
    body: JSON.stringify({
      customer: { id: customerId },
      orderDate: TODAY,
      deliveryDate: TODAY,
      orderLines: [
        {
          product: { id: softwareId },
          description: "Licença de software",
          count: 1,
          unitPriceExcludingVatCurrency: 4950,
        },
        {
          product: { id: storageId },
          description: "Armazenamento na nuvem",
          count: 1,
          unitPriceExcludingVatCurrency: 7700,
        },
      ],
    }),
  });
  return unwrap(wrapper);
}

async function repairBankAccountAndRetry(orderId: number): Promise<Invoice> {
  const accounts = valuesOf(
    await tripletex<TripletexList<Account>>(`/ledger/account?isBankAccount=true&fields=*`),
  );
  const account =
    accounts.find((item) => item.isInvoiceAccount) ??
    accounts.find((item) => asString(item.number) === "1920") ??
    accounts[0];

  if (!account) throw new Error("No bank account available for repair");

  await tripletex<TripletexValue<Account>>(`/ledger/account/${account.id}`, {
    method: "PUT",
    body: JSON.stringify({
      bankAccountNumber: "12345678903",
    }),
  });

  const wrapper = await tripletex<TripletexValue<Invoice>>(
    `/order/${orderId}/:invoice?invoiceDate=${TODAY}&sendToCustomer=false`,
    { method: "PUT" },
  );
  return unwrap(wrapper);
}

async function invoiceOrder(orderId: number): Promise<Invoice> {
  try {
    const wrapper = await tripletex<TripletexValue<Invoice>>(
      `/order/${orderId}/:invoice?invoiceDate=${TODAY}&sendToCustomer=false`,
      { method: "PUT" },
    );
    return unwrap(wrapper);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("registrert et bankkontonummer")) throw error;
    return repairBankAccountAndRetry(orderId);
  }
}

function rankPaymentType(type: PaymentType): number {
  const debitNumber = asString(type.debitAccount?.number);
  return [
    debitNumber.startsWith("19"),
    !!type.debitAccount?.isBankAccount,
    !!type.debitAccount?.isInvoiceAccount,
    type.name === "Betalt til bank",
  ].filter(Boolean).length;
}

async function resolvePaymentType(): Promise<PaymentType> {
  const paymentTypes = valuesOf(
    await tripletex<TripletexList<PaymentType>>(
      `/invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)`,
    ),
  );

  const candidates = paymentTypes
    .filter((type) => asString(type.debitAccount?.number).startsWith("19"))
    .sort((a, b) => rankPaymentType(b) - rankPaymentType(a));

  const paymentType = candidates[0] ?? paymentTypes.sort((a, b) => rankPaymentType(b) - rankPaymentType(a))[0];
  if (!paymentType) throw new Error("No invoice payment type found");
  return paymentType;
}

async function registerPayment(invoice: Invoice, paymentTypeId: number): Promise<Invoice> {
  const paidAmount =
    invoice.amountCurrencyOutstanding ?? invoice.amountOutstanding;
  if (typeof paidAmount !== "number") {
    throw new Error(`Invoice outstanding amount missing: ${JSON.stringify(invoice)}`);
  }

  const wrapper = await tripletex<TripletexValue<Invoice>>(
    `/invoice/${invoice.id}/:payment?paymentDate=${TODAY}&paymentTypeId=${paymentTypeId}&paidAmount=${paidAmount}`,
    { method: "PUT" },
  );
  return unwrap(wrapper);
}

async function main() {
  const customer = await resolveCustomer();
  const products = await resolveProducts();
  const order = await createOrder(customer.id, products.software.id, products.storage.id);
  const invoice = await invoiceOrder(order.id);
  const paymentType = await resolvePaymentType();
  const paidInvoice = await registerPayment(invoice, paymentType.id);

  const outstanding =
    paidInvoice.amountCurrencyOutstanding ?? paidInvoice.amountOutstanding;
  if (outstanding !== 0) {
    throw new Error(`Invoice still outstanding: ${JSON.stringify(paidInvoice)}`);
  }

  console.log(
    JSON.stringify({
      customerId: customer.id,
      orderId: order.id,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      paymentTypeId: paymentType.id,
      outstanding,
    }),
  );
}

await main();
