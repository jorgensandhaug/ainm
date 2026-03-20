const BASE_URL = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "FIhLb1ob-cbk43GVynjgJxZkYsMMd3WhWYfFLFSt7Rw";
const REVERSE_DATE = "2026-03-20";
const DATE_FROM = "2000-01-01";
const DATE_TO = "2026-03-21";

const TARGET = {
  organizationNumber: "916057903",
  amountExcludingVat: 8300,
  text: "Maintenance",
};

const auth = `Basic ${Buffer.from(`0:${TOKEN}`).toString("base64")}`;

type JsonRecord = Record<string, any>;

function normalize(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function numberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

async function tripletex<T>(path: string, init?: RequestInit): Promise<T> {
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
    throw new Error(
      `HTTP ${response.status} ${response.statusText} on ${path}\n${JSON.stringify(data)}`
    );
  }

  return data as T;
}

function collectInvoiceTexts(invoice: JsonRecord): string[] {
  const texts: string[] = [];

  const push = (value: unknown) => {
    const normalized = normalize(value);
    if (normalized) texts.push(normalized);
  };

  push(invoice.description);
  push(invoice.invoiceComment);
  push(invoice.customerReference);
  push(invoice.reference);

  for (const line of invoice.orderLines ?? []) {
    push(line?.description);
    push(line?.displayName);
    push(line?.product?.name);
    push(line?.product?.number);
  }

  for (const order of invoice.orders ?? []) {
    push(order?.invoiceComment);
    push(order?.yourReference);
    push(order?.ourReference);
    for (const line of order?.orderLines ?? []) {
      push(line?.description);
      push(line?.displayName);
      push(line?.product?.name);
      push(line?.product?.number);
    }
  }

  return texts;
}

function invoiceMatches(invoice: JsonRecord): boolean {
  const org = String(invoice.customer?.organizationNumber ?? "");
  if (org !== TARGET.organizationNumber) return false;

  const amountExVat =
    numberOrNull(invoice.amountExcludingVatCurrency) ??
    numberOrNull(invoice.amountExcludingVat);
  if (amountExVat !== TARGET.amountExcludingVat) return false;

  const outstanding =
    numberOrNull(invoice.amountCurrencyOutstanding) ??
    numberOrNull(invoice.amountOutstanding);
  if (outstanding !== 0) return false;

  const needle = normalize(TARGET.text);
  return collectInvoiceTexts(invoice).some((text) => text.includes(needle));
}

function extractPaymentVoucherId(invoice: JsonRecord): number {
  const preferredTypes = new Set([
    "INCOMING_PAYMENT",
    "INCOMING_PAYMENT_OPPOSITE",
  ]);

  const preferredVoucherIds = new Set<number>();
  for (const posting of invoice.postings ?? []) {
    const voucherId = numberOrNull(posting?.voucher?.id);
    if (!voucherId) continue;
    if (preferredTypes.has(String(posting?.type ?? ""))) {
      preferredVoucherIds.add(voucherId);
    }
  }

  if (preferredVoucherIds.size === 1) {
    return [...preferredVoucherIds][0]!;
  }

  const paymentKeywordVoucherIds = new Set<number>();
  for (const posting of invoice.postings ?? []) {
    const voucherId = numberOrNull(posting?.voucher?.id);
    const amount =
      numberOrNull(posting?.amountCurrency) ?? numberOrNull(posting?.amount);
    const combinedText = normalize(
      [posting?.description, posting?.text, posting?.account?.name].filter(Boolean).join(" ")
    );
    if (!voucherId || amount === null) continue;
    if (amount < 0 && (combinedText.includes("betaling") || combinedText.includes("payment"))) {
      paymentKeywordVoucherIds.add(voucherId);
    }
  }

  if (paymentKeywordVoucherIds.size === 1) {
    return [...paymentKeywordVoucherIds][0]!;
  }

  const postingSummary = (invoice.postings ?? []).map((posting: JsonRecord) => ({
    id: posting.id ?? null,
    type: posting.type ?? null,
    amount: posting.amount ?? null,
    amountCurrency: posting.amountCurrency ?? null,
    amountGross: posting.amountGross ?? null,
    text: posting.text ?? null,
    description: posting.description ?? null,
    accountNumber: posting.account?.number ?? null,
    accountName: posting.account?.name ?? null,
    voucherId: posting.voucher?.id ?? null,
    voucherNumber: posting.voucher?.number ?? null,
    closeGroup: posting.closeGroup ?? null,
  }));

  throw new Error(
    `Unable to isolate payment voucher from invoice ${invoice.id}. Candidates from preferred types: ${JSON.stringify(
      [...preferredVoucherIds]
    )}. Candidates from payment text fallback: ${JSON.stringify(
      [...paymentKeywordVoucherIds]
    )}\n${JSON.stringify(postingSummary, null, 2)}`
  );
}

async function main() {
  const locatePath =
    `/invoice?invoiceDateFrom=${encodeURIComponent(DATE_FROM)}` +
    `&invoiceDateTo=${encodeURIComponent(DATE_TO)}` +
    `&count=1000&sorting=-invoiceDate` +
    `&fields=${encodeURIComponent(
      "*,customer(*),orderLines(*),orders(*,orderLines(*)),postings(*,voucher(*),account(*),customer(*),closeGroup(*))"
    )}`;

  const locateResponse = await tripletex<{ values?: JsonRecord[] }>(locatePath);
  const invoices = locateResponse.values ?? [];
  const matches = invoices.filter(invoiceMatches);

  if (matches.length !== 1) {
    const summary = matches.map((invoice) => ({
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      customer: invoice.customer?.name,
      organizationNumber: invoice.customer?.organizationNumber,
      amountExcludingVatCurrency: invoice.amountExcludingVatCurrency,
      amountCurrencyOutstanding: invoice.amountCurrencyOutstanding,
      texts: collectInvoiceTexts(invoice),
    }));
    throw new Error(
      `Expected exactly one matching invoice, found ${matches.length}\n${JSON.stringify(summary, null, 2)}`
    );
  }

  const invoice = matches[0]!;
  const invoiceId = numberOrNull(invoice.id);
  const expectedOutstanding =
    numberOrNull(invoice.amountCurrency) ?? numberOrNull(invoice.amount);
  const paymentVoucherId = extractPaymentVoucherId(invoice);

  if (!invoiceId || expectedOutstanding === null) {
    throw new Error(
      `Missing invoice id or expected outstanding on invoice ${JSON.stringify({
        id: invoice.id,
        amountCurrency: invoice.amountCurrency,
        amount: invoice.amount,
      })}`
    );
  }

  const reversePath = `/ledger/voucher/${paymentVoucherId}/:reverse?date=${encodeURIComponent(
    REVERSE_DATE
  )}`;
  const reverseResponse = await tripletex<{ value?: JsonRecord }>(reversePath, {
    method: "PUT",
  });

  const verifyPath =
    `/invoice?id=${invoiceId}` +
    `&invoiceDateFrom=${encodeURIComponent(DATE_FROM)}` +
    `&invoiceDateTo=${encodeURIComponent(DATE_TO)}` +
    `&fields=${encodeURIComponent("*,postings(*,voucher(*))")}`;
  const verifyResponse = await tripletex<{ values?: JsonRecord[] }>(verifyPath);
  const verifiedInvoice = (verifyResponse.values ?? [])[0];

  if (!verifiedInvoice) {
    throw new Error(`Invoice ${invoiceId} not found in verification read`);
  }

  const reopenedOutstanding =
    numberOrNull(verifiedInvoice.amountCurrencyOutstanding) ??
    numberOrNull(verifiedInvoice.amountOutstanding);

  if (reopenedOutstanding !== expectedOutstanding) {
    throw new Error(
      `Outstanding mismatch after reversal: expected ${expectedOutstanding}, got ${reopenedOutstanding}`
    );
  }

  console.log(
    JSON.stringify(
      {
        invoiceId,
        invoiceNumber: invoice.invoiceNumber,
        paymentVoucherId,
        reverseVoucherId: reverseResponse.value?.id ?? null,
        expectedOutstanding,
        reopenedOutstanding,
      },
      null,
      2
    )
  );
}

await main();
