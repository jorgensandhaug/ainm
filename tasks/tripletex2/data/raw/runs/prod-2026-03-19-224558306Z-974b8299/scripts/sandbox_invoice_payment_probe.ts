const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const SESSION_TOKEN =
  "REDACTED";

const auth = `Basic ${Buffer.from(`0:${SESSION_TOKEN}`).toString("base64")}`;

type ListResponse<T> = { values: T[] };

type Invoice = {
  id: number;
  invoiceNumber?: number;
  invoiceDate?: string;
  amount?: number;
  amountExcludingVat?: number;
  amountOutstanding?: number;
  amountOutstandingTotal?: number;
  amountCurrencyOutstanding?: number;
  amountCurrencyOutstandingTotal?: number;
  customer?: {
    id?: number;
    name?: string;
    organizationNumber?: string;
  };
  orderLines?: Array<{
    description?: string;
    amountExcludingVatCurrency?: number;
    vatType?: { id?: number; number?: string; description?: string };
  }>;
  currency?: { code?: string };
  isCharged?: boolean;
};

type PaymentType = {
  id: number;
  description?: string;
  displayName?: string;
  currencyCode?: string;
  customer?: { id?: number };
  debitAccount?: { number?: number };
  creditAccount?: { number?: number };
};

async function request<T>(path: string): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: {
      Authorization: auth,
      Accept: "application/json",
    },
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText} ${path}\n${JSON.stringify(data, null, 2)}`);
  }
  return data as T;
}

const paymentTypes = await request<ListResponse<PaymentType>>("/invoice/paymentType?count=1000&fields=*");
const invoices = await request<ListResponse<Invoice>>(
  "/invoice?invoiceDateFrom=2000-01-01&invoiceDateTo=2100-01-01&count=1000&sorting=-id&fields=*,customer(*),orderLines(*),currency(*)"
);

const openInvoices = invoices.values.filter((invoice) => (invoice.amountOutstandingTotal ?? invoice.amountOutstanding ?? 0) > 0);
const differentiated = openInvoices.filter(
  (invoice) =>
    invoice.amountExcludingVat !== undefined &&
    invoice.amountOutstandingTotal !== undefined &&
    invoice.amountExcludingVat !== invoice.amountOutstandingTotal
);

console.log(
  JSON.stringify(
    {
      paymentTypes: paymentTypes.values.map((pt) => ({
        id: pt.id,
        description: pt.description,
        displayName: pt.displayName,
        currencyCode: pt.currencyCode,
        customerId: pt.customer?.id ?? null,
        debitAccount: pt.debitAccount?.number ?? null,
        creditAccount: pt.creditAccount?.number ?? null,
      })),
      openInvoiceCount: openInvoices.length,
      differentiatedCount: differentiated.length,
      sampleOpenInvoices: openInvoices.slice(0, 10).map((invoice) => ({
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        invoiceDate: invoice.invoiceDate,
        customerName: invoice.customer?.name,
        customerOrgNo: invoice.customer?.organizationNumber,
        currencyCode: invoice.currency?.code,
        amount: invoice.amount,
        amountExcludingVat: invoice.amountExcludingVat,
        amountOutstanding: invoice.amountOutstanding,
        amountOutstandingTotal: invoice.amountOutstandingTotal,
        lineDescriptions: invoice.orderLines?.map((line) => line.description) ?? [],
      })),
      sampleDifferentiatedInvoices: differentiated.slice(0, 10).map((invoice) => ({
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        customerName: invoice.customer?.name,
        amount: invoice.amount,
        amountExcludingVat: invoice.amountExcludingVat,
        amountOutstanding: invoice.amountOutstanding,
        amountOutstandingTotal: invoice.amountOutstandingTotal,
        lineDescriptions: invoice.orderLines?.map((line) => line.description) ?? [],
      })),
    },
    null,
    2
  )
);
