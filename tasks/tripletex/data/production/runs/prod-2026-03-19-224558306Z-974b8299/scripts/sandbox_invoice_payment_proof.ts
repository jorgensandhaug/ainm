const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const SESSION_TOKEN =
  "REDACTED";
const PAYMENT_DATE = "2026-03-19";

const auth = `Basic ${Buffer.from(`0:${SESSION_TOKEN}`).toString("base64")}`;

type ListResponse<T> = { values: T[] };
type ValueResponse<T> = { value: T };

type PaymentType = {
  id: number;
  description?: string;
  displayName?: string;
  currencyCode?: string;
  customer?: { id?: number };
};

type Invoice = {
  id: number;
  invoiceNumber?: number;
  amount?: number;
  amountExcludingVat?: number;
  amountOutstanding?: number;
  amountOutstandingTotal?: number;
  customer?: { name?: string };
  currency?: { code?: string };
  orderLines?: Array<{ description?: string }>;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: auth,
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText} ${path}\n${JSON.stringify(data, null, 2)}`);
  }
  return data as T;
}

const invoiceRes = await request<ListResponse<Invoice>>(
  "/invoice?invoiceDateFrom=2000-01-01&invoiceDateTo=2100-01-01&count=1000&sorting=-id&fields=*,customer(*),orderLines(*),currency(*)"
);

const invoice = invoiceRes.values.find((item) => item.id === 2147515695);
if (!invoice) {
  throw new Error("Sandbox proof invoice not found");
}

const paidAmount = invoice.amountOutstandingTotal ?? invoice.amountOutstanding;
if (!paidAmount || paidAmount <= 0) {
  throw new Error(`Sandbox proof invoice already closed or invalid: ${JSON.stringify(invoice, null, 2)}`);
}

const paymentTypeRes = await request<ListResponse<PaymentType>>("/invoice/paymentType?count=1000&fields=*");
const paymentType = paymentTypeRes.values.find(
  (item) => !item.customer?.id && (!item.currencyCode || item.currencyCode === invoice.currency?.code) && item.description === "Kontant"
);
if (!paymentType) {
  throw new Error("Sandbox proof payment type not found");
}

const paymentRes = await request<ValueResponse<Invoice>>(
  `/invoice/${invoice.id}/:payment?paymentDate=${encodeURIComponent(PAYMENT_DATE)}&paymentTypeId=${paymentType.id}&paidAmount=${encodeURIComponent(String(paidAmount))}`,
  { method: "PUT" }
);

console.log(
  JSON.stringify(
    {
      before: {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        customerName: invoice.customer?.name,
        amount: invoice.amount,
        amountExcludingVat: invoice.amountExcludingVat,
        amountOutstanding: invoice.amountOutstanding,
        amountOutstandingTotal: invoice.amountOutstandingTotal,
        lineDescriptions: invoice.orderLines?.map((line) => line.description) ?? [],
      },
      paymentType: {
        id: paymentType.id,
        description: paymentType.description,
      },
      paidAmount,
      after: {
        amountOutstanding: paymentRes.value.amountOutstanding,
        amountOutstandingTotal: paymentRes.value.amountOutstandingTotal,
      },
    },
    null,
    2
  )
);
