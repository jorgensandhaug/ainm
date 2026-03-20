const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const SESSION_TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const PAYMENT_DATE = "2026-03-20";

const authHeader = `Basic ${Buffer.from(`0:${SESSION_TOKEN}`).toString("base64")}`;

type TripletexResponse<T> = {
  value?: T;
  values?: T[];
  error?: string;
  message?: string;
  source?: string;
  validationMessages?: Array<{ field?: string; message?: string }>;
};

type InvoiceLine = {
  description?: string | null;
  displayName?: string | null;
};

type Order = {
  invoiceComment?: string | null;
  orderLines?: InvoiceLine[] | null;
};

type Invoice = {
  id: number;
  invoiceDate?: string | null;
  customer?: { organizationNumber?: string | null; name?: string | null } | null;
  amountExcludingVatCurrency?: number | null;
  amountExcludingVat?: number | null;
  amountCurrencyOutstanding?: number | null;
  amountOutstanding?: number | null;
  orderLines?: InvoiceLine[] | null;
  orders?: Order[] | null;
};

type PaymentType = {
  id: number;
  name?: string | null;
  debitAccount?: {
    number?: string | number | null;
    isBankAccount?: boolean | null;
    isInvoiceAccount?: boolean | null;
  } | null;
  creditAccount?: {
    number?: string | number | null;
  } | null;
};

function normalize(value: unknown): string {
  return String(value ?? "").trim();
}

function invoiceTexts(invoice: Invoice): string[] {
  const values: string[] = [];
  const push = (value: unknown) => {
    const text = normalize(value);
    if (text) values.push(text);
  };

  for (const line of invoice.orderLines ?? []) {
    push(line.description);
    push(line.displayName);
  }
  for (const order of invoice.orders ?? []) {
    push(order.invoiceComment);
    for (const line of order.orderLines ?? []) {
      push(line.description);
      push(line.displayName);
    }
  }
  return values;
}

function outstanding(invoice: Invoice): number {
  return Number(invoice.amountCurrencyOutstanding ?? invoice.amountOutstanding ?? 0);
}

function exVat(invoice: Invoice): number {
  return Number(invoice.amountExcludingVatCurrency ?? invoice.amountExcludingVat ?? 0);
}

function paymentTypeScore(paymentType: PaymentType): number {
  const debit = paymentType.debitAccount;
  const number = String(debit?.number ?? "");
  let score = 0;
  if (debit?.isBankAccount) score += 100;
  if (debit?.isInvoiceAccount) score += 50;
  if (number.startsWith("19")) score += 20;
  if (number === "1920") score += 10;
  return score;
}

async function api<T>(path: string, init?: RequestInit): Promise<TripletexResponse<T>> {
  const url = new URL(path, BASE_URL.endsWith("/") ? BASE_URL : `${BASE_URL}/`);
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: authHeader,
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const text = await response.text();
  const data = text ? (JSON.parse(text) as TripletexResponse<T>) : {};
  if (!response.ok) {
    throw new Error(
      `HTTP ${response.status}: ${JSON.stringify({
        error: data?.error,
        message: data?.message,
        source: data?.source,
        validationMessages: data?.validationMessages,
      })}`,
    );
  }
  return data;
}

async function main() {
  const invoiceQuery = new URLSearchParams({
    invoiceDateFrom: "2020-01-01",
    invoiceDateTo: "2030-12-31",
    count: "1000",
    sorting: "-invoiceDate",
    fields: "*,customer(*),currency(*),orderLines(*),orders(*,orderLines(*))",
  });
  const invoices = (await api<Invoice>(`invoice?${invoiceQuery.toString()}`)).values ?? [];

  const candidate = invoices.find((invoice) => {
    const texts = invoiceTexts(invoice);
    return (
      !!invoice.customer?.organizationNumber &&
      exVat(invoice) > 0 &&
      outstanding(invoice) > 0 &&
      texts.length > 0
    );
  });

  if (!candidate) {
    throw new Error("No suitable unpaid invoice found in sandbox");
  }

  const paymentTypes = (await api<PaymentType>("invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)"))
    .values ?? [];
  const paymentType = [...paymentTypes].sort(
    (a, b) => paymentTypeScore(b) - paymentTypeScore(a) || a.id - b.id,
  )[0];

  if (!paymentType || paymentTypeScore(paymentType) <= 0) {
    throw new Error(
      `No usable incoming payment type found: ${JSON.stringify(
        paymentTypes.map((paymentType) => ({
          id: paymentType.id,
          name: paymentType.name,
          debitAccount: paymentType.debitAccount,
          creditAccount: paymentType.creditAccount,
          score: paymentTypeScore(paymentType),
        })),
      )}`,
    );
  }

  const paidAmount = outstanding(candidate);
  const paymentQuery = new URLSearchParams({
    paymentDate: PAYMENT_DATE,
    paymentTypeId: String(paymentType.id),
    paidAmount: String(paidAmount),
  });
  const paymentResult = (
    await api<Invoice>(`invoice/${candidate.id}/:payment?${paymentQuery.toString()}`, { method: "PUT" })
  ).value;

  console.log(
    JSON.stringify({
      invoiceId: candidate.id,
      invoiceDate: candidate.invoiceDate,
      customerOrg: candidate.customer?.organizationNumber,
      customerName: candidate.customer?.name,
      locatorExVat: exVat(candidate),
      locatorText: invoiceTexts(candidate)[0],
      outstandingBefore: paidAmount,
      chosenPaymentTypeId: paymentType.id,
      chosenPaymentTypeName: paymentType.name,
      chosenDebitAccount: paymentType.debitAccount,
      remainingAfter: paymentResult ? outstanding(paymentResult) : null,
      invoiceReadHasPaymentTypeId: Object.prototype.hasOwnProperty.call(candidate, "paymentTypeId"),
    }),
  );
}

await main();
