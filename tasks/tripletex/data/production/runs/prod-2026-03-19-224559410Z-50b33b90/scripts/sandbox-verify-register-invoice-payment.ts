const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const SESSION_TOKEN =
  "REDACTED";
const AUTH = `Basic ${Buffer.from(`0:${SESSION_TOKEN}`).toString("base64")}`;

type ResponseWrapper<T> = { value?: T };
type ListResponse<T> = { values?: T[] };

type Customer = {
  id: number;
  name?: string;
  organizationNumber?: string;
};

type Invoice = {
  id: number;
  invoiceNumber?: number;
  invoiceDate?: string;
  customer?: {
    id?: number;
    name?: string;
    organizationNumber?: string;
  };
  currency?: {
    code?: string;
  };
  amountExcludingVat?: number;
  amountExcludingVatCurrency?: number;
  amountOutstanding?: number;
  amountCurrencyOutstanding?: number;
  orderLines?: Array<{
    description?: string;
    displayName?: string;
  }>;
  orders?: Array<{
    invoiceComment?: string;
    reference?: string;
  }>;
};

type PaymentType = {
  id: number;
  description?: string;
  displayName?: string;
  currencyCode?: string;
  debitAccount?: {
    number?: string | number;
  };
  creditAccount?: {
    number?: string | number;
  };
};

type VatType = {
  id: number;
  number?: string;
  displayName?: string;
  percentage?: number;
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: AUTH,
      Accept: "application/json",
      "Content-Type": "application/json; charset=utf-8",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}\n${await response.text()}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

function textMatches(invoice: Invoice): boolean {
  const text = [
    ...(invoice.orderLines ?? []).flatMap((line) => [line.description, line.displayName]),
    ...(invoice.orders ?? []).flatMap((order) => [order.invoiceComment, order.reference]),
  ]
    .filter((value): value is string => Boolean(value))
    .join("\n")
    .toLowerCase();
  return text.includes("datarådgivning");
}

function choosePaymentType(paymentTypes: PaymentType[], invoice: Invoice): PaymentType {
  const invoiceCurrency = invoice.currency?.code ?? "NOK";
  const ranked = paymentTypes
    .filter((paymentType) => !paymentType.currencyCode || paymentType.currencyCode === invoiceCurrency)
    .sort((a, b) => {
      const aDebit = String(a.debitAccount?.number ?? "");
      const aCredit = String(a.creditAccount?.number ?? "");
      const bDebit = String(b.debitAccount?.number ?? "");
      const bCredit = String(b.creditAccount?.number ?? "");
      const aScore =
        (aDebit.startsWith("19") ? 4 : 0) +
        (aCredit.startsWith("15") ? 2 : 0) +
        ((a.description ?? a.displayName ?? "").toLowerCase().includes("bank") ? 1 : 0);
      const bScore =
        (bDebit.startsWith("19") ? 4 : 0) +
        (bCredit.startsWith("15") ? 2 : 0) +
        ((b.description ?? b.displayName ?? "").toLowerCase().includes("bank") ? 1 : 0);
      return bScore - aScore || a.id - b.id;
    });
  const chosen = ranked[0];
  if (!chosen) {
    throw new Error("No usable invoice payment type found.");
  }
  return chosen;
}

const probeSuffix = Date.now().toString().slice(-6);
const orgNumber = `889${probeSuffix}`;
const customerName = `Codex Payment Probe ${probeSuffix}`;

const customerCreate = await api<ResponseWrapper<Customer>>("/customer", {
  method: "POST",
  body: JSON.stringify({
    name: customerName,
    organizationNumber: orgNumber,
    email: `codex-probe-${probeSuffix}@example.com`,
    postalAddress: {
      addressLine1: "Probeveien 1",
      postalCode: "0150",
      city: "Oslo",
    },
  }),
});

const customer = customerCreate.value;
if (!customer?.id) {
  throw new Error("Customer create did not return an id.");
}

const vatTypes = await api<ListResponse<VatType>>(
  "/ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-19&fields=*",
);
const vatType =
  (vatTypes.values ?? []).find((candidate) => candidate.percentage === 25) ??
  (vatTypes.values ?? []).find((candidate) => candidate.percentage === 0) ??
  vatTypes.values?.[0];

if (!vatType?.id) {
  throw new Error("No valid outgoing VAT type found.");
}

const invoiceCreate = await api<ResponseWrapper<Invoice>>("/invoice?sendToCustomer=false", {
  method: "POST",
  body: JSON.stringify({
    invoiceDate: "2026-03-19",
    invoiceDueDate: "2026-04-02",
    customer: { id: customer.id },
    orders: [
      {
        customer: { id: customer.id },
        orderDate: "2026-03-19",
        deliveryDate: "2026-03-19",
        orderLines: [
          {
            description: "Datarådgivning",
            count: 1,
            unitPriceExcludingVatCurrency: 15200,
            vatType: { id: vatType.id },
          },
        ],
      },
    ],
  }),
});

if (!invoiceCreate.value?.id) {
  throw new Error("Invoice create did not return an id.");
}

const invoiceFields = ["*", "customer(*)", "currency(*)", "orderLines(*)", "orders(*)"].join(",");
const invoiceSearch = await api<ListResponse<Invoice>>(
  `/invoice?invoiceDateFrom=2026-01-01&invoiceDateTo=2027-01-01&count=1000&sorting=-invoiceDate&fields=${encodeURIComponent(invoiceFields)}`,
);

const matches = (invoiceSearch.values ?? []).filter((invoice) => {
  const amountExVat = invoice.amountExcludingVatCurrency ?? invoice.amountExcludingVat;
  const outstanding = invoice.amountCurrencyOutstanding ?? invoice.amountOutstanding ?? 0;
  return (
    invoice.customer?.organizationNumber === orgNumber &&
    amountExVat === 15200 &&
    outstanding > 0 &&
    textMatches(invoice)
  );
});

if (matches.length !== 1) {
  throw new Error(`Expected exactly 1 located invoice, got ${matches.length}.`);
}

const locatedInvoice = matches[0];
const paymentTypes = await api<ListResponse<PaymentType>>(
  `/invoice/paymentType?count=1000&fields=${encodeURIComponent("*,debitAccount(*),creditAccount(*)")}`,
);
const paymentType = choosePaymentType(paymentTypes.values ?? [], locatedInvoice);
const paidAmount = locatedInvoice.amountCurrencyOutstanding ?? locatedInvoice.amountOutstanding;
if (typeof paidAmount !== "number" || paidAmount <= 0) {
  throw new Error(`Expected positive outstanding amount after creation, got ${paidAmount}.`);
}

const payment = await api<ResponseWrapper<Invoice>>(
  `/invoice/${locatedInvoice.id}/:payment?paymentDate=2026-03-19&paymentTypeId=${paymentType.id}&paidAmount=${paidAmount}`,
  { method: "PUT" },
);

const updatedInvoice = payment.value;
const remaining = updatedInvoice?.amountCurrencyOutstanding ?? updatedInvoice?.amountOutstanding;
if (remaining !== 0) {
  throw new Error(`Expected remaining outstanding 0, got ${remaining}.`);
}

console.log(
  JSON.stringify(
    {
      customerId: customer.id,
      customerName,
      organizationNumber: orgNumber,
      createdInvoiceId: invoiceCreate.value.id,
      createdInvoiceNumber: invoiceCreate.value.invoiceNumber,
      locatedInvoiceId: locatedInvoice.id,
      locatedInvoiceNumber: locatedInvoice.invoiceNumber,
      vatTypeId: vatType.id,
      vatTypeNumber: vatType.number,
      vatTypeDisplayName: vatType.displayName,
      amountExVat: locatedInvoice.amountExcludingVatCurrency ?? locatedInvoice.amountExcludingVat,
      paidAmount,
      paymentTypeId: paymentType.id,
      paymentType: paymentType.description ?? paymentType.displayName,
      remainingOutstanding: remaining,
    },
    null,
    2,
  ),
);
