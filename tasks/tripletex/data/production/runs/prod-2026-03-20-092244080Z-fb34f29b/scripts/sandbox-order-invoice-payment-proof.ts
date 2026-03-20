const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const SESSION_TOKEN =
  "REDACTED";
const TODAY = "2026-03-20";
const BANK_ACCOUNT_NUMBER = "12345678903";

const suffix = `${Date.now()}`.slice(-8);

type Wrapper<T> = { value?: T };
type ListResponse<T> = { values?: T[]; fullResultSize?: number };

type VatType = { id: number; number?: string; description?: string };
type Customer = { id: number; name?: string; organizationNumber?: string };
type Product = { id: number; name?: string; number?: string | number; vatType?: { id?: number } };
type Account = {
  id: number;
  number?: string | number;
  isInvoiceAccount?: boolean;
  isBankAccount?: boolean;
  bankAccountNumber?: string | null;
};
type Order = {
  id: number;
  number?: string;
  customer?: { id?: number };
  orderLines?: Array<{ id?: number; description?: string; product?: { id?: number }; count?: number }>;
  isClosed?: boolean;
};
type OrderLine = {
  id?: number;
  order?: { id?: number };
  product?: { id?: number };
  description?: string;
  count?: number;
  unitPriceExcludingVatCurrency?: number;
};
type PaymentType = {
  id: number;
  description?: string;
  debitAccount?: { number?: string | number };
  creditAccount?: { number?: string | number };
};
type Invoice = {
  id: number;
  invoiceNumber?: number;
  amountExcludingVatCurrency?: number;
  amountOutstanding?: number;
  amountCurrencyOutstanding?: number;
};

const PRODUCT_SPECS = [
  { name: `Reflection Training Session ${suffix}`, number: `84${suffix.slice(-4)}`, price: 5700 },
  { name: `Reflection Consulting Hours ${suffix}`, number: `37${suffix.slice(-4)}`, price: 14750 },
] as const;

function authHeader() {
  return `Basic ${Buffer.from(`0:${SESSION_TOKEN}`).toString("base64")}`;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function toNumberString(value: unknown): string {
  return value === undefined || value === null ? "" : String(value);
}

async function api<T>(
  method: string,
  path: string,
  options: {
    query?: Record<string, string | number | boolean | Array<string | number | boolean> | undefined>;
    body?: unknown;
  } = {},
): Promise<T> {
  const base = BASE_URL.endsWith("/") ? BASE_URL : `${BASE_URL}/`;
  const url = new URL(path.replace(/^\//, ""), base);
  for (const [key, rawValue] of Object.entries(options.query ?? {})) {
    if (rawValue === undefined) continue;
    if (Array.isArray(rawValue)) {
      for (const value of rawValue) {
        url.searchParams.append(key, String(value));
      }
    } else {
      url.searchParams.set(key, String(rawValue));
    }
  }

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: authHeader(),
      Accept: "application/json",
      ...(options.body === undefined ? {} : { "Content-Type": "application/json; charset=utf-8" }),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : undefined;
  if (!response.ok) {
    throw new Error(`${method} ${url.toString()} -> ${response.status} ${response.statusText}\n${text}`);
  }
  return payload as T;
}

function generateValidOrgNumber(seed: number): string {
  const weights = [3, 2, 7, 6, 5, 4, 3, 2];
  let base = Math.max(10000000, seed % 90000000);
  for (let i = 0; i < 5000; i += 1, base += 1) {
    const digits = String(base).padStart(8, "0").split("").map(Number);
    const sum = digits.reduce((acc, digit, index) => acc + digit * weights[index], 0);
    let check = 11 - (sum % 11);
    if (check === 11) check = 0;
    if (check === 10) continue;
    return `${digits.join("")}${check}`;
  }
  throw new Error("Unable to generate valid organization number");
}

async function ensureInvoiceBankAccount() {
  const response = await api<ListResponse<Account>>("GET", "/ledger/account", {
    query: { isBankAccount: true, fields: "*" },
  });
  const accounts = response.values ?? [];
  const target =
    accounts.find((account) => account.isInvoiceAccount && Number(account.number) === 1920) ??
    accounts.find((account) => account.isInvoiceAccount) ??
    accounts.find((account) => account.isBankAccount && Number(account.number) === 1920) ??
    null;

  if (!target) return { updated: false, accountId: null as number | null };
  if ((target.bankAccountNumber ?? "").trim()) {
    return { updated: false, accountId: target.id, bankAccountNumber: target.bankAccountNumber };
  }

  const updated = await api<Wrapper<Account>>("PUT", `/ledger/account/${target.id}`, {
    body: { bankAccountNumber: BANK_ACCOUNT_NUMBER },
  });
  return {
    updated: true,
    accountId: updated.value?.id ?? target.id,
    bankAccountNumber: updated.value?.bankAccountNumber ?? BANK_ACCOUNT_NUMBER,
  };
}

function pickIncomingPaymentType(values: PaymentType[]): PaymentType {
  const picked =
    values.find(
      (value) => /^19/.test(toNumberString(value.debitAccount?.number)) && /^15/.test(toNumberString(value.creditAccount?.number)),
    ) ??
    values.find((value) => /^19/.test(toNumberString(value.debitAccount?.number))) ??
    values[0];
  assert(picked?.id, "No usable payment type found");
  return picked;
}

async function main() {
  const orgNumber = generateValidOrgNumber(Number(suffix));
  const customerName = `Reflection Order Customer ${suffix}`;

  const vatTypes = await api<ListResponse<VatType>>("GET", "/ledger/vatType", {
    query: { typeOfVat: "OUTGOING", vatDate: TODAY, fields: "*" },
  });
  const vatType = (vatTypes.values ?? [])[0];
  assert(vatType?.id, "No outgoing VAT type found");

  const customer = (
    await api<Wrapper<Customer>>("POST", "/customer", {
      body: {
        name: customerName,
        email: `reflection-order-${suffix}@example.no`,
        organizationNumber: orgNumber,
      },
    })
  ).value;
  assert(customer?.id, "Customer creation failed");

  const products: Product[] = [];
  for (const spec of PRODUCT_SPECS) {
    const created = (
      await api<Wrapper<Product>>("POST", "/product", {
        body: {
          name: spec.name,
          number: spec.number,
          priceExcludingVatCurrency: spec.price,
          vatType: { id: vatType.id },
        },
      })
    ).value;
    assert(created?.id, `Product creation failed for ${spec.name}`);
    products.push(created);
  }

  const lookupByNumber = await api<ListResponse<Product>>("GET", "/product", {
    query: { productNumber: PRODUCT_SPECS.map((spec) => spec.number), fields: "*" },
  });
  const lookupByIds = await api<ListResponse<Product>>("GET", "/product", {
    query: { ids: products.map((product) => product.id).join(","), fields: "*" },
  });

  const bankAccount = await ensureInvoiceBankAccount();

  const badOrder = (
    await api<Wrapper<Order>>("POST", "/order", {
      body: {
        customer: { id: customer.id },
        orderDate: TODAY,
        deliveryDate: TODAY,
        orderLines: PRODUCT_SPECS.map((spec, index) => ({
          product: { id: products[index].id },
          description: spec.name,
          count: 1,
          unitPriceExcludingVatCurrency: spec.price,
          vatType: { id: vatType.id },
        })),
      },
    })
  ).value;
  assert(badOrder?.id, "Embedded-line order creation failed");

  const badOrderFetched = (
    await api<Wrapper<Order>>("GET", `/order/${badOrder.id}`, {
      query: { fields: "*,customer(*),orderLines(*)" },
    })
  ).value;
  assert(badOrderFetched?.id, "Unable to fetch embedded-line order");

  await api<void>("DELETE", `/order/${badOrder.id}`);

  const goodOrder = (
    await api<Wrapper<Order>>("POST", "/order", {
      body: {
        customer: { id: customer.id },
        orderDate: TODAY,
        deliveryDate: TODAY,
      },
    })
  ).value;
  assert(goodOrder?.id, "Bare order creation failed");

  const createdLines = await api<ListResponse<OrderLine>>("POST", "/order/orderline/list", {
    body: PRODUCT_SPECS.map((spec, index) => ({
      order: { id: goodOrder.id },
      product: { id: products[index].id },
      description: spec.name,
      count: 1,
      unitPriceExcludingVatCurrency: spec.price,
      vatType: { id: vatType.id },
    })),
  });
  assert((createdLines.values ?? []).length === 2, "Order line list create did not return two lines");

  const goodOrderFetched = (
    await api<Wrapper<Order>>("GET", `/order/${goodOrder.id}`, {
      query: { fields: "*,customer(*),orderLines(*)" },
    })
  ).value;
  assert(goodOrderFetched?.orderLines?.length === 2, "Good order does not contain two lines");

  const invoice = (
    await api<Wrapper<Invoice>>("PUT", `/order/${goodOrder.id}/:invoice`, {
      query: { invoiceDate: TODAY, sendToCustomer: false },
    })
  ).value;
  assert(invoice?.id, "Order invoicing failed");

  const outstanding = invoice.amountCurrencyOutstanding ?? invoice.amountOutstanding;
  assert(typeof outstanding === "number" && outstanding > 0, `Invalid outstanding amount: ${outstanding}`);

  const paymentTypes = await api<ListResponse<PaymentType>>("GET", "/invoice/paymentType", {
    query: { count: 1000, fields: "*,debitAccount(*),creditAccount(*)" },
  });
  const paymentType = pickIncomingPaymentType(paymentTypes.values ?? []);

  const paidInvoice = (
    await api<Wrapper<Invoice>>("PUT", `/invoice/${invoice.id}/:payment`, {
      query: {
        paymentDate: TODAY,
        paymentTypeId: paymentType.id,
        paidAmount: outstanding,
      },
    })
  ).value;
  assert(paidInvoice?.id, "Invoice payment failed");
  assert((paidInvoice.amountCurrencyOutstanding ?? paidInvoice.amountOutstanding) === 0, "Invoice not fully paid");

  console.log(
    JSON.stringify(
      {
        customer: {
          id: customer.id,
          name: customer.name,
          organizationNumber: customer.organizationNumber,
        },
        vatType: {
          id: vatType.id,
          number: vatType.number,
          description: vatType.description,
        },
        productsCreated: products.map((product) => ({
          id: product.id,
          number: product.number,
          name: product.name,
        })),
        productLookup: {
          byNumberCount: (lookupByNumber.values ?? []).length,
          byIdsCount: (lookupByIds.values ?? []).length,
        },
        bankAccount,
        embeddedOrderProof: {
          orderId: badOrder.id,
          postResponseLineCount: badOrder.orderLines?.length ?? 0,
          fetchedLineCount: badOrderFetched.orderLines?.length ?? 0,
          deletedAfterProof: true,
        },
        correctedOrderProof: {
          orderId: goodOrder.id,
          fetchedLineCount: goodOrderFetched.orderLines?.length ?? 0,
          createdLineIds: (createdLines.values ?? []).map((line) => line.id),
        },
        invoiceProof: {
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          amountExcludingVatCurrency: invoice.amountExcludingVatCurrency,
          outstandingBeforePayment: outstanding,
          outstandingAfterPayment: paidInvoice.amountCurrencyOutstanding ?? paidInvoice.amountOutstanding,
        },
        paymentType: {
          id: paymentType.id,
          description: paymentType.description,
          debitAccount: paymentType.debitAccount?.number,
          creditAccount: paymentType.creditAccount?.number,
        },
      },
      null,
      2,
    ),
  );
}

await main();
