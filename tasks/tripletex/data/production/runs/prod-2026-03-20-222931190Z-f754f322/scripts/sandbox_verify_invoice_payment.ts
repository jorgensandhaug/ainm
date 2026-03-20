const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const SESSION_TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const PAYMENT_DATE = "2026-03-20";
const TARGET = {
  org: "977448240",
  amountExVat: 12900,
  text: "Konsulenttimer",
};

type Invoice = {
  id: number;
  customer?: { organizationNumber?: string | number | null } | null;
  amountExcludingVatCurrency?: number | null;
  amountExcludingVat?: number | null;
  amountCurrencyOutstanding?: number | null;
  amountOutstanding?: number | null;
  orderLines?: Array<{ description?: string | null; displayName?: string | null }> | null;
  orders?: Array<{
    invoiceComment?: string | null;
    orderLines?: Array<{ description?: string | null; displayName?: string | null }> | null;
  }> | null;
};

type PaymentType = {
  id: number;
  name?: string | null;
  debitAccount?: {
    number?: string | number | null;
    isBankAccount?: boolean | null;
    isInvoiceAccount?: boolean | null;
  } | null;
  creditAccount?: { number?: string | number | null } | null;
};

function authHeader() {
  return `Basic ${Buffer.from(`0:${SESSION_TOKEN}`).toString("base64")}`;
}

function endpoint(path: string, params?: Record<string, string>) {
  const url = new URL(path, `${BASE_URL}/`);
  if (params) {
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  }
  return url;
}

async function request<T>(path: string, init: RequestInit = {}, params?: Record<string, string>) {
  const response = await fetch(endpoint(path, params), {
    ...init,
    headers: {
      Authorization: authHeader(),
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${text}`);
  return text ? (JSON.parse(text) as T) : (null as T);
}

function normalize(value: unknown) {
  return String(value ?? "").trim();
}

function evidenceTexts(invoice: Invoice) {
  const out: string[] = [];
  for (const line of invoice.orderLines ?? []) {
    if (line.description) out.push(line.description);
    if (line.displayName) out.push(line.displayName);
  }
  for (const order of invoice.orders ?? []) {
    if (order.invoiceComment) out.push(order.invoiceComment);
    for (const line of order.orderLines ?? []) {
      if (line.description) out.push(line.description);
      if (line.displayName) out.push(line.displayName);
    }
  }
  return [...new Set(out.map((value) => value.trim()))];
}

function outstanding(invoice: Invoice) {
  return invoice.amountCurrencyOutstanding ?? invoice.amountOutstanding ?? null;
}

function paymentTypeScore(paymentType: PaymentType) {
  const debit = normalize(paymentType.debitAccount?.number);
  const name = normalize(paymentType.name).toLowerCase();
  let score = 0;
  if (paymentType.debitAccount?.isBankAccount) score += 8;
  if (paymentType.debitAccount?.isInvoiceAccount) score += 6;
  if (debit.startsWith("19")) score += 4;
  if (name.includes("bank")) score += 2;
  if (name.includes("betalt")) score += 1;
  return score;
}

const locate = await request<{ values?: Invoice[] }>("invoice", {}, {
  invoiceDateFrom: "2020-01-01",
  invoiceDateTo: "2030-12-31",
  count: "1000",
  sorting: "-invoiceDate",
  fields: "*,customer(*),currency(*),orderLines(*),orders(*,orderLines(*))",
});

const matches = (locate.values ?? []).filter((invoice) => {
  const amount = invoice.amountExcludingVatCurrency ?? invoice.amountExcludingVat;
  const remaining = outstanding(invoice);
  return (
    normalize(invoice.customer?.organizationNumber) === TARGET.org &&
    amount === TARGET.amountExVat &&
    typeof remaining === "number" &&
    remaining > 0 &&
    evidenceTexts(invoice).includes(TARGET.text)
  );
});

if (matches.length !== 1) {
  throw new Error(`Expected 1 exact invoice match, got ${matches.length}`);
}

const invoice = matches[0];
const paidAmount = outstanding(invoice);
if (typeof paidAmount !== "number" || !(paidAmount > 0)) {
  throw new Error("Positive outstanding amount not found");
}

const paymentTypes = await request<{ values?: PaymentType[] }>("invoice/paymentType", {}, {
  count: "1000",
  fields: "*,debitAccount(*),creditAccount(*)",
});

const paymentType = [...(paymentTypes.values ?? [])].sort((a, b) => paymentTypeScore(b) - paymentTypeScore(a))[0];
if (!paymentType?.id) {
  throw new Error("No payment type resolved");
}

const payment = await request<{ value?: Invoice }>(
  `invoice/${invoice.id}/:payment`,
  { method: "PUT" },
  {
    paymentDate: PAYMENT_DATE,
    paymentTypeId: String(paymentType.id),
    paidAmount: String(paidAmount),
  },
);

const remaining = payment.value?.amountCurrencyOutstanding ?? payment.value?.amountOutstanding ?? null;
if (remaining !== 0) {
  throw new Error(`Expected settled invoice, remaining=${remaining}`);
}

console.log(
  JSON.stringify({
    invoiceId: invoice.id,
    org: TARGET.org,
    amountExVat: TARGET.amountExVat,
    locatorText: TARGET.text,
    paidAmount,
    paymentTypeId: paymentType.id,
    paymentTypeName: paymentType.name ?? null,
    paymentTypeDebitAccount: paymentType.debitAccount?.number ?? null,
    paymentTypeCreditAccount: paymentType.creditAccount?.number ?? null,
    remainingOutstanding: remaining,
    hadPaymentTypeOnInvoiceRead: Object.prototype.hasOwnProperty.call(invoice as object, "paymentType"),
  }),
);
