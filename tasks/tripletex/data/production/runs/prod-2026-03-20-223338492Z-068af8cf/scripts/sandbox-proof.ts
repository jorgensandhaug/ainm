const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const SESSION_TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const RUN_DATE = "2026-03-20";

type Json = Record<string, unknown>;
type TripletexList<T> = { values?: T[] };
type TripletexValue<T> = { value?: T };

type Customer = { id: number; organizationNumber?: string };
type Product = { id: number; name?: string; number?: string | number; productNumber?: string | number };
type PaymentType = {
  id: number;
  name?: string;
  debitAccount?: { number?: string | number; isBankAccount?: boolean; isInvoiceAccount?: boolean } | null;
  creditAccount?: unknown;
};
type Invoice = {
  id: number;
  invoiceNumber?: number | string;
  amountOutstanding?: number | null;
  amountCurrencyOutstanding?: number | null;
};

const authHeader = `Basic ${Buffer.from(`0:${SESSION_TOKEN}`).toString("base64")}`;
let calls = 0;

async function api<T>(
  path: string,
  init: RequestInit = {},
  query?: Record<string, string | number | boolean | Array<string | number | boolean>>,
): Promise<{ status: number; data: T | null; text: string; url: string }> {
  const url = new URL(path, BASE_URL.endsWith("/") ? BASE_URL : `${BASE_URL}/`);
  if (query) {
    for (const [key, raw] of Object.entries(query)) {
      const values = Array.isArray(raw) ? raw : [raw];
      for (const value of values) url.searchParams.append(key, String(value));
    }
  }
  const headers = new Headers(init.headers ?? {});
  headers.set("Authorization", authHeader);
  headers.set("Accept", "application/json");
  if (init.body !== undefined) headers.set("Content-Type", "application/json");
  calls += 1;
  const response = await fetch(url, { ...init, headers });
  const text = await response.text();
  let data: T | null = null;
  if (text) {
    try {
      data = JSON.parse(text) as T;
    } catch {
      data = null;
    }
  }
  return { status: response.status, data, text, url: url.toString() };
}

function norm(value: unknown): string {
  return value === null || value === undefined ? "" : String(value).trim();
}

function requireOk<T>(result: { status: number; data: T | null; text: string; url: string }, label: string): T {
  if (result.status < 200 || result.status >= 300 || result.data === null) {
    throw new Error(`${label} failed ${result.status} ${result.url}\n${result.text}`);
  }
  return result.data;
}

function list<T>(data: unknown): T[] {
  return Array.isArray((data as TripletexList<T>)?.values) ? ((data as TripletexList<T>).values as T[]) : [];
}

function value<T>(data: unknown): T {
  const wrapped = (data as TripletexValue<T>)?.value;
  if (!wrapped) throw new Error(`Missing value wrapper: ${JSON.stringify(data)}`);
  return wrapped;
}

function choosePaymentType(paymentTypes: PaymentType[]): PaymentType {
  const scored = paymentTypes
    .map((paymentType) => {
      const debit = paymentType.debitAccount;
      const debitNumber = norm(debit?.number);
      let score = 0;
      if (debitNumber.startsWith("19")) score += 50;
      if (debit?.isInvoiceAccount) score += 20;
      if (debit?.isBankAccount) score += 15;
      if ((paymentType.name ?? "").toLowerCase().includes("bank")) score += 5;
      return { paymentType, score };
    })
    .sort((a, b) => b.score - a.score);
  if (!scored.length || scored[0].score < 50) {
    throw new Error(`No usable payment type: ${JSON.stringify(paymentTypes)}`);
  }
  return scored[0].paymentType;
}

async function main(): Promise<void> {
  const customerRes = await api<TripletexList<Customer>>("customer", {}, {
    organizationNumber: "975687821",
    fields: "*",
  });
  const customer = list<Customer>(requireOk(customerRes, "GET customer")).find(
    (entry) => norm(entry.organizationNumber) === "975687821",
  );
  if (!customer) throw new Error(`Customer not found: ${customerRes.text}`);

  const productRes = await api<TripletexList<Product>>("product", {}, {
    productNumber: ["4366", "3402"],
    fields: "*",
  });
  const products = list<Product>(requireOk(productRes, "GET product"));
  const byRef: Record<string, Product> = {};
  for (const product of products) {
    if (norm(product.number) === "4366" || norm(product.productNumber) === "4366") byRef["4366"] = product;
    if (norm(product.number) === "3402" || norm(product.productNumber) === "3402") byRef["3402"] = product;
  }
  if (!byRef["4366"] || !byRef["3402"]) {
    throw new Error(`Product lookup incomplete: ${JSON.stringify(products)}`);
  }

  const paymentTypeRes = await api<TripletexList<PaymentType>>("invoice/paymentType", {}, {
    count: 1000,
    fields: "*,debitAccount(*),creditAccount(*)",
  });
  const paymentType = choosePaymentType(list<PaymentType>(requireOk(paymentTypeRes, "GET paymentType")));

  const orderRes = await api<TripletexValue<{ id: number; orderLines?: unknown[] }>>("order", {
    method: "POST",
    body: JSON.stringify({
      customer: { id: customer.id },
      orderDate: RUN_DATE,
      deliveryDate: RUN_DATE,
      orderLines: [
        {
          product: { id: byRef["4366"].id },
          description: "Netzwerkdienst",
          count: 1,
          unitPriceExcludingVatCurrency: 32750,
        },
        {
          product: { id: byRef["3402"].id },
          description: "Beratungsstunden",
          count: 1,
          unitPriceExcludingVatCurrency: 17450,
        },
      ],
    }),
  });
  const order = value<{ id: number; orderLines?: unknown[] }>(requireOk(orderRes, "POST order"));

  const invoiceRes = await api<TripletexValue<Invoice>>(
    `order/${order.id}/:invoice`,
    { method: "PUT" },
    {
      invoiceDate: RUN_DATE,
      sendToCustomer: false,
      paymentTypeId: paymentType.id,
      paidAmount: 0.01,
      paymentTypeIdRestAmount: paymentType.id,
    },
  );
  const invoice = value<Invoice>(requireOk(invoiceRes, "PUT order/:invoice"));
  const outstanding = invoice.amountCurrencyOutstanding ?? invoice.amountOutstanding;
  if (outstanding !== 0) {
    throw new Error(`Invoice not settled: ${JSON.stringify(invoice)}`);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        calls,
        customerId: customer.id,
        productIds: {
          "4366": byRef["4366"].id,
          "3402": byRef["3402"].id,
        },
        paymentType: {
          id: paymentType.id,
          name: paymentType.name ?? null,
          debitAccountNumber: norm(paymentType.debitAccount?.number),
          debitIsBankAccount: Boolean(paymentType.debitAccount?.isBankAccount),
          debitIsInvoiceAccount: Boolean(paymentType.debitAccount?.isInvoiceAccount),
        },
        orderId: order.id,
        postOrderOrderLinesLength: Array.isArray(order.orderLines) ? order.orderLines.length : null,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber ?? null,
        amountCurrencyOutstanding: invoice.amountCurrencyOutstanding ?? null,
        amountOutstanding: invoice.amountOutstanding ?? null,
      },
      null,
      2,
    ),
  );
}

await main();
