const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const SESSION_TOKEN =
  "REDACTED";
const AUTH = `Basic ${Buffer.from(`0:${SESSION_TOKEN}`).toString("base64")}`;

type TripletexList<T> = {
  values?: T[];
  fullResultSize?: number;
};

type PaymentType = {
  id: number;
  description?: string;
  displayName?: string;
  currencyCode?: string;
  debitAccount?: {
    id?: number;
    number?: string | number;
    name?: string;
  };
  creditAccount?: {
    id?: number;
    number?: string | number;
    name?: string;
  };
};

type Invoice = {
  id: number;
  invoiceNumber?: number;
  invoiceDate?: string;
  amountExcludingVat?: number;
  amountExcludingVatCurrency?: number;
  amountOutstanding?: number;
  amountCurrencyOutstanding?: number;
  customer?: {
    id?: number;
    name?: string;
    displayName?: string;
    organizationNumber?: string;
  };
  currency?: {
    code?: string;
  };
  orderLines?: Array<{
    description?: string;
    displayName?: string;
    amountExcludingVatCurrency?: number;
  }>;
  orders?: Array<{
    number?: string;
    reference?: string;
    invoiceComment?: string;
  }>;
};

async function api<T>(path: string): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: {
      Authorization: AUTH,
      Accept: "application/json",
    },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}\n${await response.text()}`);
  }
  return (await response.json()) as T;
}

const invoiceFields = ["*", "customer(*)", "currency(*)", "orderLines(*)", "orders(*)"].join(",");
const paymentTypeFields = ["*", "debitAccount(*)", "creditAccount(*)"].join(",");

const [invoiceResponse, paymentTypeResponse] = await Promise.all([
  api<TripletexList<Invoice>>(
    `/invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2027-01-01&count=50&sorting=-invoiceDate&fields=${encodeURIComponent(invoiceFields)}`,
  ),
  api<TripletexList<PaymentType>>(
    `/invoice/paymentType?count=1000&fields=${encodeURIComponent(paymentTypeFields)}`,
  ),
]);

const openInvoices = (invoiceResponse.values ?? [])
  .filter((invoice) => (invoice.amountCurrencyOutstanding ?? invoice.amountOutstanding ?? 0) > 0)
  .slice(0, 10)
  .map((invoice) => ({
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    invoiceDate: invoice.invoiceDate,
    customerName: invoice.customer?.name ?? invoice.customer?.displayName,
    orgNumber: invoice.customer?.organizationNumber,
    amountExVat: invoice.amountExcludingVatCurrency ?? invoice.amountExcludingVat,
    outstanding: invoice.amountCurrencyOutstanding ?? invoice.amountOutstanding,
    currency: invoice.currency?.code,
    lines: (invoice.orderLines ?? []).map((line) => ({
      description: line.description,
      displayName: line.displayName,
      amountExVat: line.amountExcludingVatCurrency,
    })),
    orders: (invoice.orders ?? []).map((order) => ({
      number: order.number,
      reference: order.reference,
      invoiceComment: order.invoiceComment,
    })),
  }));

const paymentTypes = (paymentTypeResponse.values ?? []).map((paymentType) => ({
  id: paymentType.id,
  description: paymentType.description ?? paymentType.displayName,
  currencyCode: paymentType.currencyCode,
  debitAccountNumber: paymentType.debitAccount?.number,
  creditAccountNumber: paymentType.creditAccount?.number,
}));

console.log(
  JSON.stringify(
    {
      openInvoiceCount: openInvoices.length,
      openInvoices,
      paymentTypes,
    },
    null,
    2,
  ),
);
