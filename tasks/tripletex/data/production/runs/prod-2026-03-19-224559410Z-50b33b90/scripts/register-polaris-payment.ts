const BASE_URL = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const SESSION_TOKEN = "REDACTED";
const PAYMENT_DATE = "2026-03-19";
const AUTH = `Basic ${Buffer.from(`0:${SESSION_TOKEN}`).toString("base64")}`;

type TripletexList<T> = {
  values?: T[];
  fullResultSize?: number;
};

type AccountRef = {
  id?: number;
  number?: string;
  name?: string;
};

type PaymentType = {
  id: number;
  description?: string;
  displayName?: string;
  currencyCode?: string;
  debitAccount?: AccountRef;
  creditAccount?: AccountRef;
};

type CustomerRef = {
  id?: number;
  name?: string;
  displayName?: string;
  organizationNumber?: string;
};

type CurrencyRef = {
  id?: number;
  code?: string;
  displayName?: string;
};

type OrderLine = {
  id?: number;
  description?: string;
  displayName?: string;
  amountExcludingVatCurrency?: number;
  amountIncludingVatCurrency?: number;
};

type OrderRef = {
  id?: number;
  number?: string;
  reference?: string;
  invoiceComment?: string;
  displayName?: string;
};

type Invoice = {
  id: number;
  invoiceNumber?: number;
  invoiceDate?: string;
  invoiceDueDate?: string;
  customer?: CustomerRef;
  currency?: CurrencyRef;
  amount?: number;
  amountCurrency?: number;
  amountExcludingVat?: number;
  amountExcludingVatCurrency?: number;
  amountOutstanding?: number;
  amountCurrencyOutstanding?: number;
  amountOutstandingTotal?: number;
  amountCurrencyOutstandingTotal?: number;
  paidAmount?: number;
  isCreditNote?: boolean;
  isCharged?: boolean;
  comment?: string;
  invoiceComment?: string;
  orderLines?: OrderLine[];
  orders?: OrderRef[];
};

type TripletexResponse<T> = {
  value?: T;
};

function approxEqual(a: number | undefined, b: number, epsilon = 0.01): boolean {
  return typeof a === "number" && Math.abs(a - b) <= epsilon;
}

function textMatchesService(invoice: Invoice): boolean {
  const haystack = [
    invoice.comment,
    invoice.invoiceComment,
    ...(invoice.orderLines ?? []).flatMap((line) => [line.description, line.displayName]),
    ...(invoice.orders ?? []).flatMap((order) => [order.invoiceComment, order.reference, order.displayName]),
  ]
    .filter((value): value is string => Boolean(value))
    .join("\n")
    .toLowerCase();

  return haystack.includes("datarådgivning");
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: AUTH,
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status} ${response.statusText}\n${text}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

function choosePaymentType(paymentTypes: PaymentType[], invoice: Invoice): PaymentType {
  const invoiceCurrency = invoice.currency?.code ?? "NOK";
  const candidates = paymentTypes.filter((paymentType) => {
    const debitAccountNumber = String(paymentType.debitAccount?.number ?? "");
    const creditAccountNumber = String(paymentType.creditAccount?.number ?? "");
    const currencyOk = !paymentType.currencyCode || paymentType.currencyCode === invoiceCurrency;
    const looksLikeIncoming =
      debitAccountNumber.startsWith("19") ||
      debitAccountNumber.startsWith("18") ||
      creditAccountNumber.startsWith("15");
    return currencyOk && looksLikeIncoming;
  });

  const ranked = (candidates.length > 0 ? candidates : paymentTypes).sort((a, b) => {
    const aDebitAccountNumber = String(a.debitAccount?.number ?? "");
    const aCreditAccountNumber = String(a.creditAccount?.number ?? "");
    const bDebitAccountNumber = String(b.debitAccount?.number ?? "");
    const bCreditAccountNumber = String(b.creditAccount?.number ?? "");
    const aScore =
      (aDebitAccountNumber.startsWith("19") ? 4 : 0) +
      (aCreditAccountNumber.startsWith("15") ? 2 : 0) +
      ((a.description ?? a.displayName ?? "").toLowerCase().includes("bank") ? 1 : 0);
    const bScore =
      (bDebitAccountNumber.startsWith("19") ? 4 : 0) +
      (bCreditAccountNumber.startsWith("15") ? 2 : 0) +
      ((b.description ?? b.displayName ?? "").toLowerCase().includes("bank") ? 1 : 0);
    return bScore - aScore || a.id - b.id;
  });

  const chosen = ranked[0];
  if (!chosen) {
    throw new Error("Fant ingen betalingsmåter for kundeinnbetaling.");
  }
  return chosen;
}

async function main() {
  const invoiceFields = [
    "*",
    "customer(*)",
    "currency(*)",
    "orderLines(*)",
    "orders(*)",
  ].join(",");
  const paymentTypeFields = [
    "*",
    "debitAccount(*)",
    "creditAccount(*)",
  ].join(",");

  const invoicesResponse = await api<TripletexList<Invoice>>(
    `/invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2027-01-01&count=1000&sorting=-invoiceDate&fields=${encodeURIComponent(invoiceFields)}`,
  );

  const matchingInvoices = (invoicesResponse.values ?? []).filter((invoice) => {
    const orgNumber = invoice.customer?.organizationNumber?.replace(/\s+/g, "");
    const outstanding = invoice.amountCurrencyOutstanding ?? invoice.amountOutstanding ?? 0;
    return (
      orgNumber === "896571559" &&
      !invoice.isCreditNote &&
      invoice.isCharged !== false &&
      outstanding > 0 &&
      approxEqual(invoice.amountExcludingVatCurrency ?? invoice.amountExcludingVat, 15200) &&
      textMatchesService(invoice)
    );
  });

  if (matchingInvoices.length !== 1) {
    console.log(
      JSON.stringify(
        {
          message: "Fant ikke entydig faktura",
          candidates: matchingInvoices.map((invoice) => ({
            id: invoice.id,
            invoiceNumber: invoice.invoiceNumber,
            invoiceDate: invoice.invoiceDate,
            customer: invoice.customer,
            amountExcludingVat: invoice.amountExcludingVatCurrency ?? invoice.amountExcludingVat,
            outstanding: invoice.amountCurrencyOutstanding ?? invoice.amountOutstanding,
            lines: (invoice.orderLines ?? []).map((line) => ({
              description: line.description,
              displayName: line.displayName,
            })),
            orders: (invoice.orders ?? []).map((order) => ({
              number: order.number,
              reference: order.reference,
              invoiceComment: order.invoiceComment,
            })),
          })),
        },
        null,
        2,
      ),
    );
    throw new Error(`Forventet 1 matchende faktura, fant ${matchingInvoices.length}.`);
  }

  const invoice = matchingInvoices[0];
  const paymentTypesResponse = await api<TripletexList<PaymentType>>(
    `/invoice/paymentType?count=1000&fields=${encodeURIComponent(paymentTypeFields)}`,
  );
  const paymentTypes = paymentTypesResponse.values ?? [];
  const paymentType = choosePaymentType(paymentTypes, invoice);

  const paidAmount = invoice.amountCurrencyOutstanding ?? invoice.amountOutstanding;
  if (typeof paidAmount !== "number" || paidAmount <= 0) {
    throw new Error("Faktura har ikke gyldig utestående beløp.");
  }

  const paymentQuery = new URLSearchParams({
    paymentDate: PAYMENT_DATE,
    paymentTypeId: String(paymentType.id),
    paidAmount: String(paidAmount),
  });

  const invoiceCurrency = invoice.currency?.code;
  const paymentCurrency = paymentType.currencyCode;
  if (invoiceCurrency && paymentCurrency && invoiceCurrency !== paymentCurrency) {
    paymentQuery.set("paidAmountCurrency", String(paidAmount));
  }

  const paymentResponse = await api<TripletexResponse<Invoice>>(
    `/invoice/${invoice.id}/:payment?${paymentQuery.toString()}`,
    { method: "PUT" },
  );

  const updatedInvoice = paymentResponse.value;
  if (!updatedInvoice) {
    throw new Error("Manglet faktura i betalingsrespons.");
  }

  const remaining = updatedInvoice.amountCurrencyOutstanding ?? updatedInvoice.amountOutstanding ?? NaN;
  if (!approxEqual(remaining, 0)) {
    throw new Error(`Betaling registrert, men restbeløp er ikke 0. Rest: ${remaining}`);
  }

  console.log(
    JSON.stringify(
      {
        invoiceId: updatedInvoice.id,
        invoiceNumber: updatedInvoice.invoiceNumber,
        paymentDate: PAYMENT_DATE,
        paymentTypeId: paymentType.id,
        paymentType: paymentType.description ?? paymentType.displayName,
        paidAmount,
        remainingOutstanding: remaining,
      },
      null,
      2,
    ),
  );
}

await main();
