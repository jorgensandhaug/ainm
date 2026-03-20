const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const SESSION_TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const RUN_DATE = "2026-03-20";

const authHeader = `Basic ${Buffer.from(`0:${SESSION_TOKEN}`).toString("base64")}`;

type TripletexList<T> = { values?: T[]; fullResultSize?: number };
type TripletexWrapper<T> = { value?: T };

type Customer = {
  id: number;
  customerName?: string;
  organizationNumber?: string;
};

type Product = {
  id: number;
  name?: string;
  productNumber?: string | number;
  number?: string | number;
};

type VatType = {
  id: number;
  number?: string;
  percentage?: number;
};

type Account = {
  id: number;
  version?: number;
  number?: string | number;
  isBankAccount?: boolean;
  isInvoiceAccount?: boolean;
};

type PaymentType = {
  id: number;
  description?: string;
  debitAccount?: Account | null;
  creditAccount?: Account | null;
};

type Order = {
  id: number;
  number?: string | number;
};

type Invoice = {
  id: number;
  invoiceNumber?: string | number;
  amountExcludingVatCurrency?: number;
  amountCurrencyOutstanding?: number;
  amountOutstanding?: number;
};

async function api<T>(
  method: string,
  path: string,
  options: {
    query?: Record<string, string | number | boolean | Array<string | number> | undefined>;
    body?: unknown;
    expected?: number[];
  } = {},
): Promise<T> {
  const url = new URL(path, `${BASE_URL}/`);
  for (const [key, raw] of Object.entries(options.query ?? {})) {
    if (raw === undefined) continue;
    if (Array.isArray(raw)) {
      for (const value of raw) url.searchParams.append(key, String(value));
    } else {
      url.searchParams.set(key, String(raw));
    }
  }

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: authHeader,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json; charset=utf-8" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  const parsed = text ? JSON.parse(text) : undefined;
  const expected = options.expected ?? [200];

  if (!expected.includes(response.status)) {
    const error = new Error(`HTTP ${response.status} ${method} ${url.pathname}${url.search}: ${text}`);
    (error as Error & { status?: number; body?: unknown }).status = response.status;
    (error as Error & { status?: number; body?: unknown }).body = parsed ?? text;
    throw error;
  }

  return parsed as T;
}

function unwrapList<T>(response: TripletexList<T>, label: string): T[] {
  if (!Array.isArray(response?.values)) throw new Error(`Missing values in ${label}`);
  return response.values;
}

function unwrapValue<T>(response: TripletexWrapper<T>, label: string): T {
  if (!response?.value) throw new Error(`Missing value in ${label}`);
  return response.value;
}

async function ensureCustomer(): Promise<{ customer: Customer; created: boolean }> {
  const existing = unwrapList(
    await api<TripletexList<Customer>>("GET", "customer", {
      query: { organizationNumber: "911511053", fields: "*" },
    }),
    "GET /customer",
  );
  const customer = existing.find(
    (candidate) =>
      candidate.organizationNumber === "911511053" &&
      (candidate.customerName === undefined || candidate.customerName === "Fjordkraft AS"),
  );
  if (customer) return { customer, created: false };

  const created = unwrapValue(
    await api<TripletexWrapper<Customer>>("POST", "customer", {
      expected: [201],
      body: {
        name: "Fjordkraft AS",
        organizationNumber: "911511053",
        email: "sandbox-fjordkraft-911511053@example.no",
      },
    }),
    "POST /customer",
  );
  return { customer: created, created: true };
}

function productMatches(product: Product, targetNumber: string, targetName: string): boolean {
  const keys = [product.productNumber, product.number, product.name]
    .filter((value): value is string | number => value !== undefined && value !== null)
    .map((value) => String(value));
  return keys.includes(targetNumber) || product.name === targetName;
}

async function ensureOutgoingVatType(): Promise<VatType> {
  const vatTypes = unwrapList(
    await api<TripletexList<VatType>>("GET", "ledger/vatType", {
      query: { typeOfVat: "OUTGOING", vatDate: RUN_DATE, fields: "*" },
    }),
    "GET /ledger/vatType",
  );
  const preferred =
    vatTypes.find((vatType) => vatType.percentage === 25 && vatType.number === "3") ??
    vatTypes.find((vatType) => vatType.percentage === 25) ??
    vatTypes[0];
  if (!preferred?.id) throw new Error("No outgoing VAT type found");
  return preferred;
}

async function ensureProducts(): Promise<{
  training: Product;
  webdesign: Product;
  created: string[];
  vatTypeId: number;
}> {
  const existing = unwrapList(
    await api<TripletexList<Product>>("GET", "product", {
      query: { productNumber: ["7579", "2292"], fields: "*" },
    }),
    "GET /product",
  );
  let training = existing.find((product) => productMatches(product, "7579", "Opplæring"));
  let webdesign = existing.find((product) => productMatches(product, "2292", "Webdesign"));
  const created: string[] = [];

  if (training && webdesign) {
    return { training, webdesign, created, vatTypeId: -1 };
  }

  const vatType = await ensureOutgoingVatType();

  if (!training) {
    training = unwrapValue(
      await api<TripletexWrapper<Product>>("POST", "product", {
        expected: [201],
        body: {
          name: "Opplæring",
          number: "7579",
          priceExcludingVatCurrency: 14650,
          vatType: { id: vatType.id },
        },
      }),
      "POST /product Opplæring",
    );
    created.push("7579");
  }

  if (!webdesign) {
    webdesign = unwrapValue(
      await api<TripletexWrapper<Product>>("POST", "product", {
        expected: [201],
        body: {
          name: "Webdesign",
          number: "2292",
          priceExcludingVatCurrency: 11800,
          vatType: { id: vatType.id },
        },
      }),
      "POST /product Webdesign",
    );
    created.push("2292");
  }

  return { training, webdesign, created, vatTypeId: vatType.id };
}

function paymentTypeScore(paymentType: PaymentType): number {
  const number = String(paymentType.debitAccount?.number ?? "");
  let score = 0;
  if (number.startsWith("19")) score += 100;
  if (paymentType.debitAccount?.isBankAccount) score += 30;
  if (paymentType.debitAccount?.isInvoiceAccount) score += 20;
  if ((paymentType.description ?? "").toLowerCase().includes("bank")) score += 10;
  if ((paymentType.description ?? "").toLowerCase().includes("betalt")) score += 5;
  return score;
}

async function getPaymentType(): Promise<PaymentType> {
  const paymentTypes = unwrapList(
    await api<TripletexList<PaymentType>>("GET", "invoice/paymentType", {
      query: { count: 1000, fields: "*,debitAccount(*),creditAccount(*)" },
    }),
    "GET /invoice/paymentType",
  );
  const sorted = [...paymentTypes].sort((a, b) => paymentTypeScore(b) - paymentTypeScore(a));
  const best = sorted.find((paymentType) => paymentTypeScore(paymentType) >= 100);
  if (!best) throw new Error("No suitable payment type found");
  return best;
}

function makeValidNorwegianBankAccount(seed: number): string {
  const base = `9900${String(seed).padStart(6, "0")}`;
  const digits = base.split("").map(Number);
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const sum = digits.reduce((acc, digit, index) => acc + digit * weights[index], 0);
  const remainder = sum % 11;
  const check = remainder === 0 ? 0 : 11 - remainder;
  if (check === 10) return makeValidNorwegianBankAccount(seed + 1);
  return `${base}${check}`;
}

async function repairBankAccount(): Promise<number> {
  const accounts = unwrapList(
    await api<TripletexList<Account>>("GET", "ledger/account", {
      query: { isBankAccount: true, fields: "*" },
    }),
    "GET /ledger/account",
  );
  const account =
    accounts.find((candidate) => candidate.isInvoiceAccount) ??
    accounts.find((candidate) => String(candidate.number ?? "").startsWith("19")) ??
    accounts[0];
  if (!account?.id) throw new Error("No bank account found for repair");

  await api<TripletexWrapper<Account>>("PUT", `ledger/account/${account.id}`, {
    body: {
      version: account.version,
      bankAccountNumber: makeValidNorwegianBankAccount(Date.now() % 1_000_000),
    },
  });
  return account.id;
}

function outstanding(invoice: Invoice): number {
  const amount = invoice.amountCurrencyOutstanding ?? invoice.amountOutstanding;
  if (typeof amount !== "number") throw new Error("Invoice missing outstanding amount");
  return amount;
}

async function main() {
  const { customer, created: customerCreated } = await ensureCustomer();
  const {
    training,
    webdesign,
    created: createdProducts,
    vatTypeId,
  } = await ensureProducts();

  const order = unwrapValue(
    await api<TripletexWrapper<Order>>("POST", "order", {
      expected: [201],
      body: {
        customer: { id: customer.id },
        orderDate: RUN_DATE,
        deliveryDate: RUN_DATE,
        orderLines: [
          {
            product: { id: training.id },
            description: "Opplæring",
            count: 1,
            unitPriceExcludingVatCurrency: 14650,
          },
          {
            product: { id: webdesign.id },
            description: "Webdesign",
            count: 1,
            unitPriceExcludingVatCurrency: 11800,
          },
        ],
      },
    }),
    "POST /order",
  );

  let invoice: Invoice;
  let repairedBankAccountId: number | null = null;
  try {
    invoice = unwrapValue(
      await api<TripletexWrapper<Invoice>>("PUT", `order/${order.id}/:invoice`, {
        query: { invoiceDate: RUN_DATE, sendToCustomer: false },
      }),
      "PUT /order/{id}/:invoice",
    );
  } catch (error) {
    const message = String(error);
    if (!message.includes("Faktura kan ikke opprettes før selskapet har registrert et bankkontonummer")) {
      throw error;
    }
    repairedBankAccountId = await repairBankAccount();
    invoice = unwrapValue(
      await api<TripletexWrapper<Invoice>>("PUT", `order/${order.id}/:invoice`, {
        query: { invoiceDate: RUN_DATE, sendToCustomer: false },
      }),
      "PUT /order/{id}/:invoice retry",
    );
  }

  const paymentType = await getPaymentType();
  const paidAmount = outstanding(invoice);
  const payment = unwrapValue(
    await api<TripletexWrapper<Invoice>>("PUT", `invoice/${invoice.id}/:payment`, {
      query: {
        paymentDate: RUN_DATE,
        paymentTypeId: paymentType.id,
        paidAmount,
      },
    }),
    "PUT /invoice/{id}/:payment",
  );

  const remaining = payment.amountCurrencyOutstanding ?? payment.amountOutstanding;
  if (remaining !== 0) throw new Error(`Invoice still outstanding: ${remaining}`);

  console.log(
    JSON.stringify(
      {
        customerId: customer.id,
        customerCreated,
        createdProducts,
        vatTypeId: vatTypeId === -1 ? null : vatTypeId,
        orderId: order.id,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber ?? null,
        invoiceAmountExVat: invoice.amountExcludingVatCurrency ?? null,
        paidAmount,
        remainingOutstanding: remaining,
        paymentTypeId: paymentType.id,
        paymentTypeDescription: paymentType.description ?? null,
        repairedBankAccountId,
      },
      null,
      2,
    ),
  );
}

await main();
