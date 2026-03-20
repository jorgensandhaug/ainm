const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const SESSION_TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const PAYMENT_DATE = "2026-03-20";

function buildUrl(path: string, query?: Record<string, string>): string {
  const base = BASE_URL.endsWith("/") ? BASE_URL.slice(0, -1) : BASE_URL;
  const url = new URL(`${base}/${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.append(key, value);
    }
  }
  return url.toString();
}

function authHeader(): string {
  return `Basic ${Buffer.from(`0:${SESSION_TOKEN}`).toString("base64")}`;
}

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

async function api<T>(method: string, path: string, query?: Record<string, string>): Promise<T> {
  const response = await fetch(buildUrl(path, query), {
    method,
    headers: {
      Authorization: authHeader(),
      Accept: "application/json",
    },
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText} for ${method} ${path}: ${text}`);
  }
  return data as T;
}

function invoiceTexts(invoice: any): string[] {
  const texts: string[] = [];
  const push = (value: unknown) => {
    const normalized = normalizeText(value);
    if (normalized) texts.push(normalized);
  };
  for (const line of invoice?.orderLines ?? []) {
    push(line?.description);
    push(line?.displayName);
  }
  for (const order of invoice?.orders ?? []) {
    push(order?.invoiceComment);
    for (const line of order?.orderLines ?? []) {
      push(line?.description);
      push(line?.displayName);
    }
  }
  return [...new Set(texts)];
}

function paymentTypeScore(paymentType: any): number {
  const name = normalizeText(paymentType?.name);
  const debit = paymentType?.debitAccount ?? {};
  const debitNumber = String(debit?.number ?? "");
  let score = 0;
  if (debit?.isBankAccount === true) score += 100;
  if (debit?.isInvoiceAccount === true) score += 30;
  if (/^19\d\d$/.test(debitNumber)) score += 20;
  if (/bank|betal|innbet|deposit|konto/.test(name)) score += 10;
  return score;
}

const invoiceQuery = {
  invoiceDateFrom: "2020-01-01",
  invoiceDateTo: "2030-12-31",
  count: "1000",
  sorting: "-invoiceDate",
  fields: "*,customer(*),currency(*),orderLines(*),orders(*,orderLines(*))",
};

const paymentTypeQuery = {
  count: "1000",
  fields: "*,debitAccount(*),creditAccount(*)",
};

const invoiceList = await api<any>("GET", "invoice", invoiceQuery);
const invoices = Array.isArray(invoiceList?.values) ? invoiceList.values : [];

const candidates = invoices
  .map((invoice: any) => {
    const orgNr = String(invoice?.customer?.organizationNumber ?? "");
    const exVat =
      toNumber(invoice?.amountExcludingVatCurrency) ??
      toNumber(invoice?.amountExcludingVat);
    const outstanding =
      toNumber(invoice?.amountCurrencyOutstanding) ??
      toNumber(invoice?.amountOutstanding) ??
      0;
    const descriptions = invoiceTexts(invoice);
    return { invoice, orgNr, exVat, outstanding, descriptions };
  })
  .filter(
    (row) =>
      row.orgNr &&
      row.exVat !== null &&
      row.outstanding > 0 &&
      row.descriptions.length > 0,
  );

const keyCount = new Map<string, number>();
for (const row of candidates) {
  for (const description of row.descriptions) {
    const key = `${row.orgNr}|${row.exVat}|${description}`;
    keyCount.set(key, (keyCount.get(key) ?? 0) + 1);
  }
}

const selected = candidates.find((row) =>
  row.descriptions.some((description) => keyCount.get(`${row.orgNr}|${row.exVat}|${description}`) === 1),
);

if (!selected) {
  throw new Error("No uniquely identifiable unpaid invoice found in sandbox");
}

const description = selected.descriptions.find(
  (value) => keyCount.get(`${selected.orgNr}|${selected.exVat}|${value}`) === 1,
);
if (!description) {
  throw new Error("Selected candidate lost its unique description key");
}

const paymentTypeList = await api<any>("GET", "invoice/paymentType", paymentTypeQuery);
const paymentTypes = Array.isArray(paymentTypeList?.values) ? paymentTypeList.values : [];
const paymentType = [...paymentTypes].sort((a, b) => paymentTypeScore(b) - paymentTypeScore(a))[0];

if (!paymentType?.id) {
  throw new Error("No usable payment type returned");
}

const outstanding =
  toNumber(selected.invoice?.amountCurrencyOutstanding) ??
  toNumber(selected.invoice?.amountOutstanding);
if (outstanding === null || outstanding <= 0) {
  throw new Error("Selected invoice does not have positive outstanding amount");
}

const paymentResponse = await api<any>(
  "PUT",
  `invoice/${selected.invoice.id}/:payment`,
  {
    paymentDate: PAYMENT_DATE,
    paymentTypeId: String(paymentType.id),
    paidAmount: String(outstanding),
  },
);

const paidInvoice = paymentResponse?.value ?? paymentResponse;
const remainingOutstanding =
  toNumber(paidInvoice?.remainingOutstanding) ??
  toNumber(paidInvoice?.amountCurrencyOutstanding) ??
  toNumber(paidInvoice?.amountOutstanding);

if (remainingOutstanding !== 0) {
  throw new Error(`Sandbox payment did not settle invoice, remaining ${remainingOutstanding}`);
}

console.log(
  JSON.stringify({
    invoiceId: selected.invoice.id,
    orgNr: selected.orgNr,
    amountExcludingVat: selected.exVat,
    description,
    invoiceReadHasPaymentTypeId: Boolean(
      selected.invoice?.paymentTypeId ??
        selected.invoice?.paymentType?.id ??
        selected.invoice?.payment?.paymentTypeId,
    ),
    paymentTypeId: paymentType.id,
    paidAmount: outstanding,
    remainingOutstanding,
  }),
);
