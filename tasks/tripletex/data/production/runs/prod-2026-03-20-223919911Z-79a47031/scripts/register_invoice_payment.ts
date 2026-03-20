const BASE_URL = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const SESSION_TOKEN = "W9DIqd87aJ6UY8r8QW1XsWKjvm78fAybh46lDEKTw1o";
const PAYMENT_DATE = "2026-03-20";
const TARGET_ORG = "913245539";
const TARGET_EX_VAT = 36450;
const TARGET_TEXT = "Session de formation";

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
  customer?: { organizationNumber?: string | null } | null;
  amountExcludingVatCurrency?: number | null;
  amountExcludingVat?: number | null;
  amountCurrencyOutstanding?: number | null;
  amountOutstanding?: number | null;
  orderLines?: InvoiceLine[] | null;
  orders?: Order[] | null;
  invoiceComment?: string | null;
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
  return String(value ?? "")
    .trim()
    .toLocaleLowerCase("fr");
}

function collectInvoiceTexts(invoice: Invoice): string[] {
  const texts: string[] = [];
  const push = (value: unknown) => {
    const normalized = normalize(value);
    if (normalized) texts.push(normalized);
  };

  push(invoice.invoiceComment);
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
  return texts;
}

function outstandingAmount(invoice: Invoice): number {
  return Number(invoice.amountCurrencyOutstanding ?? invoice.amountOutstanding ?? 0);
}

function exVatAmount(invoice: Invoice): number {
  return Number(invoice.amountExcludingVatCurrency ?? invoice.amountExcludingVat ?? NaN);
}

function invoiceMatchRank(invoice: Invoice): number {
  const texts = collectInvoiceTexts(invoice);
  const target = normalize(TARGET_TEXT);
  let rank = 0;
  for (const text of texts) {
    if (text === target) rank = Math.max(rank, 3);
    else if (text.includes(target)) rank = Math.max(rank, 2);
    else if (target.includes(text)) rank = Math.max(rank, 1);
  }
  return rank;
}

function scorePaymentType(paymentType: PaymentType): number {
  const debit = paymentType.debitAccount;
  const debitNumber = String(debit?.number ?? "");
  let score = 0;
  if (debit?.isBankAccount) score += 100;
  if (debit?.isInvoiceAccount) score += 50;
  if (debitNumber.startsWith("19")) score += 20;
  if (debitNumber === "1920") score += 10;
  if (normalize(paymentType.name).includes("bank")) score += 5;
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
    if (
      response.status === 403 &&
      (data?.error === "Invalid or expired token" ||
        data?.error ===
          "Invalid or expired proxy token. Each submission receives a unique token - do not reuse tokens from previous submissions.")
    ) {
      throw new Error(`Blocked credentials: ${data.error}`);
    }
    throw new Error(
      `HTTP ${response.status}: ${JSON.stringify({
        error: data?.error,
        message: data?.message,
        validationMessages: data?.validationMessages,
        source: data?.source,
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
  const invoicesResponse = await api<Invoice>(`invoice?${invoiceQuery.toString()}`);
  const invoices = invoicesResponse.values ?? [];

  const candidates = invoices
    .filter((invoice) => invoice.customer?.organizationNumber === TARGET_ORG)
    .filter((invoice) => exVatAmount(invoice) === TARGET_EX_VAT)
    .filter((invoice) => outstandingAmount(invoice) > 0)
    .map((invoice) => ({ invoice, rank: invoiceMatchRank(invoice) }))
    .filter(({ rank }) => rank > 0)
    .sort((a, b) => b.rank - a.rank || b.invoice.id - a.invoice.id);

  if (candidates.length !== 1) {
    throw new Error(
      `Expected exactly one invoice candidate, got ${candidates.length}: ${JSON.stringify(
        candidates.map(({ invoice, rank }) => ({
          id: invoice.id,
          invoiceDate: invoice.invoiceDate,
          org: invoice.customer?.organizationNumber,
          exVat: exVatAmount(invoice),
          outstanding: outstandingAmount(invoice),
          rank,
          texts: collectInvoiceTexts(invoice),
        })),
      )}`,
    );
  }

  const invoice = candidates[0].invoice;
  const paidAmount = outstandingAmount(invoice);
  if (!(paidAmount > 0)) {
    throw new Error(`Invoice ${invoice.id} has no positive outstanding amount`);
  }

  const paymentTypesResponse = await api<PaymentType>(
    "invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)",
  );
  const paymentTypes = (paymentTypesResponse.values ?? [])
    .map((paymentType) => ({ paymentType, score: scorePaymentType(paymentType) }))
    .sort((a, b) => b.score - a.score || a.paymentType.id - b.paymentType.id);

  const paymentType = paymentTypes[0]?.paymentType;
  if (!paymentType || scorePaymentType(paymentType) <= 0) {
    throw new Error(
      `No usable payment type found: ${JSON.stringify(
        paymentTypes.map(({ paymentType, score }) => ({
          id: paymentType.id,
          name: paymentType.name,
          debit: paymentType.debitAccount,
          credit: paymentType.creditAccount,
          score,
        })),
      )}`,
    );
  }

  const paymentQuery = new URLSearchParams({
    paymentDate: PAYMENT_DATE,
    paymentTypeId: String(paymentType.id),
    paidAmount: String(paidAmount),
  });
  const paymentResponse = await api<Invoice>(`invoice/${invoice.id}/:payment?${paymentQuery.toString()}`, {
    method: "PUT",
  });
  const paidInvoice = paymentResponse.value;
  const remaining = paidInvoice ? outstandingAmount(paidInvoice) : NaN;

  if (!(remaining === 0)) {
    throw new Error(
      `Payment verification failed: ${JSON.stringify({
        invoiceId: invoice.id,
        paymentTypeId: paymentType.id,
        paidAmount,
        remaining,
        response: paidInvoice,
      })}`,
    );
  }

  console.log(
    JSON.stringify({
      success: true,
      invoiceId: invoice.id,
      paymentTypeId: paymentType.id,
      paidAmount,
      remaining,
    }),
  );
}

await main();
