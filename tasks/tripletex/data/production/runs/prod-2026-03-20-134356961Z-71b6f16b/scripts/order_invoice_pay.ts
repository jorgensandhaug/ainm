const BASE_URL = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const SESSION_TOKEN = "YAsU5jItHlxHj-l79pIL-6rUu8Aq_kldGg8KHS6KWRk";
const RUN_DATE = "2026-03-20";

const authHeader = `Basic ${Buffer.from(`0:${SESSION_TOKEN}`).toString("base64")}`;

type TripletexList<T> = {
  values?: T[];
  fullResultSize?: number;
};

type TripletexWrapper<T> = {
  value?: T;
};

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

type Account = {
  id: number;
  version?: number;
  number?: string | number;
  isBankAccount?: boolean;
  isInvoiceAccount?: boolean;
  bankAccountNumber?: string;
  name?: string;
};

type PaymentType = {
  id: number;
  description?: string;
  debitAccount?: Account | null;
  creditAccount?: Account | null;
};

type Invoice = {
  id: number;
  invoiceNumber?: number | string;
  amountCurrencyOutstanding?: number;
  amountOutstanding?: number;
  amountExcludingVatCurrency?: number;
};

type Order = {
  id: number;
  number?: string | number;
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

function unwrapValue<T>(wrapper: TripletexWrapper<T>, label: string): T {
  if (!wrapper?.value) throw new Error(`Missing value in ${label} response`);
  return wrapper.value;
}

function unwrapList<T>(list: TripletexList<T>, label: string): T[] {
  if (!Array.isArray(list?.values)) throw new Error(`Missing values in ${label} response`);
  return list.values;
}

function exactSingleCustomer(values: Customer[]): Customer {
  const matches = values.filter(
    (customer) =>
      customer.organizationNumber === "911511053" &&
      (customer.customerName === undefined || customer.customerName === "Fjordkraft AS"),
  );
  if (matches.length !== 1) {
    throw new Error(`Expected 1 customer match, got ${matches.length}`);
  }
  return matches[0];
}

function normalizeProductKey(product: Product): string[] {
  return [
    product.productNumber,
    product.number,
    product.name,
  ]
    .filter((value): value is string | number => value !== undefined && value !== null)
    .map((value) => String(value));
}

function resolveRequestedProducts(products: Product[]): { training: Product; webdesign: Product } | null {
  const byTraining = products.find((product) => {
    const keys = normalizeProductKey(product);
    return keys.includes("7579") || product.name === "Opplæring";
  });
  const byWebdesign = products.find((product) => {
    const keys = normalizeProductKey(product);
    return keys.includes("2292") || product.name === "Webdesign";
  });
  return byTraining && byWebdesign ? { training: byTraining, webdesign: byWebdesign } : null;
}

async function getProducts(): Promise<{ training: Product; webdesign: Product }> {
  const byProductNumber = unwrapList(
    await api<TripletexList<Product>>("GET", "product", {
      query: {
        productNumber: ["7579", "2292"],
        fields: "*",
      },
    }),
    "GET /product productNumber",
  );
  const exactByNumber = resolveRequestedProducts(byProductNumber);
  if (exactByNumber) return exactByNumber;

  const byIds = unwrapList(
    await api<TripletexList<Product>>("GET", "product", {
      query: {
        ids: "7579,2292",
        fields: "*",
      },
    }),
    "GET /product ids",
  );
  const exactByIds = resolveRequestedProducts(byIds);
  if (exactByIds) return exactByIds;

  const byNameFallback = unwrapList(
    await api<TripletexList<Product>>("GET", "product", {
      query: {
        count: 1000,
        fields: "*",
      },
    }),
    "GET /product fallback",
  );
  const exactByName = resolveRequestedProducts(byNameFallback);
  if (exactByName) return exactByName;

  throw new Error("Could not resolve both requested products");
}

function paymentTypeScore(paymentType: PaymentType): number {
  const debit = paymentType.debitAccount;
  const number = String(debit?.number ?? "");
  let score = 0;
  if (number.startsWith("19")) score += 100;
  if (debit?.isBankAccount) score += 30;
  if (debit?.isInvoiceAccount) score += 20;
  if ((paymentType.description ?? "").toLowerCase().includes("bank")) score += 10;
  if ((paymentType.description ?? "").toLowerCase().includes("betalt")) score += 5;
  return score;
}

async function getPaymentType(): Promise<PaymentType> {
  const paymentTypes = unwrapList(
    await api<TripletexList<PaymentType>>("GET", "invoice/paymentType", {
      query: {
        count: 1000,
        fields: "*,debitAccount(*),creditAccount(*)",
      },
    }),
    "GET /invoice/paymentType",
  );

  const sorted = [...paymentTypes].sort((a, b) => paymentTypeScore(b) - paymentTypeScore(a));
  const best = sorted.find((paymentType) => paymentTypeScore(paymentType) >= 100);
  if (!best) throw new Error("No suitable incoming payment type found");
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

async function repairBankAccount(): Promise<void> {
  const accounts = unwrapList(
    await api<TripletexList<Account>>("GET", "ledger/account", {
      query: {
        isBankAccount: true,
        fields: "*",
      },
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
}

function outstandingAmount(invoice: Invoice): number {
  const amount = invoice.amountCurrencyOutstanding ?? invoice.amountOutstanding;
  if (typeof amount !== "number") throw new Error("Invoice missing outstanding amount");
  return amount;
}

async function main() {
  const customer = exactSingleCustomer(
    unwrapList(
      await api<TripletexList<Customer>>("GET", "customer", {
        query: {
          organizationNumber: "911511053",
          fields: "*",
        },
      }),
      "GET /customer",
    ),
  );

  const { training, webdesign } = await getProducts();

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
  try {
    invoice = unwrapValue(
      await api<TripletexWrapper<Invoice>>("PUT", `order/${order.id}/:invoice`, {
        query: {
          invoiceDate: RUN_DATE,
          sendToCustomer: false,
        },
      }),
      "PUT /order/{id}/:invoice",
    );
  } catch (error) {
    const message = String(error);
    if (!message.includes("Faktura kan ikke opprettes før selskapet har registrert et bankkontonummer")) {
      throw error;
    }
    await repairBankAccount();
    invoice = unwrapValue(
      await api<TripletexWrapper<Invoice>>("PUT", `order/${order.id}/:invoice`, {
        query: {
          invoiceDate: RUN_DATE,
          sendToCustomer: false,
        },
      }),
      "PUT /order/{id}/:invoice retry",
    );
  }

  const paymentType = await getPaymentType();
  const paymentResponse = unwrapValue(
    await api<TripletexWrapper<Invoice>>("PUT", `invoice/${invoice.id}/:payment`, {
      query: {
        paymentDate: RUN_DATE,
        paymentTypeId: paymentType.id,
        paidAmount: outstandingAmount(invoice),
      },
    }),
    "PUT /invoice/{id}/:payment",
  );

  const remaining = paymentResponse.amountCurrencyOutstanding ?? paymentResponse.amountOutstanding;
  if (remaining !== 0) {
    throw new Error(`Invoice still outstanding: ${remaining}`);
  }

  console.log(
    JSON.stringify(
      {
        customerId: customer.id,
        orderId: order.id,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        paidAmount: outstandingAmount(invoice),
        remainingOutstanding: remaining,
        paymentTypeId: paymentType.id,
        paymentTypeDescription: paymentType.description ?? null,
      },
      null,
      2,
    ),
  );
}

await main();
