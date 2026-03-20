const BASE_URL = process.env.TRIPLETEX_BASE_URL;
const TOKEN = process.env.TRIPLETEX_TOKEN;
const RUN_DATE = "2026-03-20";

if (!BASE_URL || !TOKEN) {
  throw new Error("Missing TRIPLETEX_BASE_URL or TRIPLETEX_TOKEN");
}

class ApiError extends Error {
  status: number;
  body: any;
  constructor(status: number, body: any) {
    super(`HTTP ${status}`);
    this.status = status;
    this.body = body;
  }
}

let callCount = 0;

async function api(method: string, path: string, query: Record<string, string | string[]> = {}, body?: any) {
  callCount += 1;
  const url = new URL(`${BASE_URL}${path}`);
  for (const [key, value] of Object.entries(query)) {
    if (Array.isArray(value)) {
      for (const item of value) url.searchParams.append(key, item);
    } else {
      url.searchParams.set(key, value);
    }
  }

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Basic ${Buffer.from(`0:${TOKEN}`).toString("base64")}`,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json; charset=utf-8" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(res.status, json);
  return json;
}

function values<T>(response: any): T[] {
  return Array.isArray(response?.values) ? response.values : [];
}

function value<T>(response: any): T {
  return response?.value ?? response;
}

function choosePaymentType(paymentTypes: any[]) {
  return paymentTypes
    .map((paymentType) => {
      const debitNumber = String(paymentType?.debitAccount?.number ?? "");
      let score = 0;
      if (debitNumber.startsWith("19")) score += 100;
      if (paymentType?.debitAccount?.isBankAccount) score += 20;
      if (paymentType?.debitAccount?.isInvoiceAccount) score += 10;
      return { paymentType, score };
    })
    .sort((a, b) => b.score - a.score)[0]?.paymentType;
}

const customerResponse = await api("GET", "/customer", {
  organizationNumber: "864062245",
  fields: "*",
});
const customer = values<any>(customerResponse).find((item) => item.organizationNumber === "864062245");
if (!customer) throw new Error("Sandbox customer 864062245 not found");

const productResponse = await api("GET", "/product", {
  productNumber: ["6749", "3048"],
  fields: "*",
});
const products = values<any>(productResponse);
const product6749 = products.find((item) => String(item.number ?? item.productNumber) === "6749");
const product3048 = products.find((item) => String(item.number ?? item.productNumber) === "3048");
if (!product6749 || !product3048) throw new Error("Sandbox products 6749/3048 not found");

const orderResponse = await api("POST", "/order", {}, {
  customer: { id: customer.id },
  orderDate: RUN_DATE,
  deliveryDate: RUN_DATE,
  orderLines: [
    {
      product: { id: product6749.id },
      description: product6749.name,
      count: 1,
      unitPriceExcludingVatCurrency: 5700,
    },
    {
      product: { id: product3048.id },
      description: product3048.name,
      count: 1,
      unitPriceExcludingVatCurrency: 6950,
    },
  ],
});
const order = value<any>(orderResponse);

const invoiceResponse = await api("PUT", `/order/${order.id}/:invoice`, {
  invoiceDate: RUN_DATE,
  sendToCustomer: "false",
});
const invoice = value<any>(invoiceResponse);

const paymentTypesResponse = await api("GET", "/invoice/paymentType", {
  count: "1000",
  fields: "*,debitAccount(*),creditAccount(*)",
});
const paymentType = choosePaymentType(values<any>(paymentTypesResponse));
if (!paymentType) throw new Error("No sandbox payment type found");

const outstanding = Number(invoice.amountCurrencyOutstanding ?? invoice.amountOutstanding);
const paymentResponse = await api("PUT", `/invoice/${invoice.id}/:payment`, {
  paymentDate: RUN_DATE,
  paymentTypeId: String(paymentType.id),
  paidAmount: String(outstanding),
});
const paidInvoice = value<any>(paymentResponse);
const remainingOutstanding = Number(paidInvoice.amountCurrencyOutstanding ?? paidInvoice.amountOutstanding);
if (remainingOutstanding !== 0) {
  throw new Error(`Sandbox payment did not settle invoice: ${remainingOutstanding}`);
}

console.log(JSON.stringify({
  ok: true,
  callCount,
  customerId: customer.id,
  productIds: [product6749.id, product3048.id],
  orderId: order.id,
  invoiceId: invoice.id,
  invoiceNumber: invoice.invoiceNumber,
  invoiceOutstandingBeforePayment: outstanding,
  paymentTypeId: paymentType.id,
  paymentTypeName: paymentType.name,
  paymentDebitAccount: paymentType?.debitAccount?.number ?? null,
  remainingOutstanding,
}));
