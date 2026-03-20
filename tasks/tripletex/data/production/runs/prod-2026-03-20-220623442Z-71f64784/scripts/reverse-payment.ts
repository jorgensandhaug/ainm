const BASE_URL = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "4AX1Tr7vGuVel4MAR4HgRdN-hYUb7ZFHNo09XB0Cow8";

const TARGET = {
  orgNumber: "896496468",
  lineText: "Skylagring",
  amountExVat: 17200,
  reverseDate: "2026-03-20",
};

const base = BASE_URL.endsWith("/") ? BASE_URL : `${BASE_URL}/`;
const auth = `Basic ${Buffer.from(`0:${TOKEN}`).toString("base64")}`;

type ApiList<T> = { values?: T[]; fullResultSize?: number };
type ApiValue<T> = { value?: T };

type VoucherRef = { id?: number | null };
type Posting = {
  type?: string | null;
  description?: string | null;
  amountCurrency?: number | null;
  amount?: number | null;
  voucher?: VoucherRef | null;
  account?: { number?: string | number | null } | null;
};

type OrderLine = {
  description?: string | null;
  displayName?: string | null;
};

type Order = {
  invoiceComment?: string | null;
  orderLines?: OrderLine[] | null;
};

type Invoice = {
  id?: number;
  invoiceNumber?: number | string | null;
  amountExcludingVatCurrency?: number | null;
  amountExcludingVat?: number | null;
  amountCurrencyOutstanding?: number | null;
  amountOutstanding?: number | null;
  customer?: { organizationNumber?: string | null; name?: string | null } | null;
  orderLines?: OrderLine[] | null;
  orders?: Order[] | null;
  postings?: Posting[] | null;
};

function buildUrl(pathAndQuery: string) {
  return new URL(pathAndQuery, base);
}

async function api<T>(pathAndQuery: string, init?: RequestInit): Promise<T> {
  const res = await fetch(buildUrl(pathAndQuery), {
    ...init,
    headers: {
      Authorization: auth,
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const text = await res.text();
  let json: unknown = undefined;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = text;
    }
  }

  if (!res.ok) {
    const errorMessage =
      typeof json === "object" && json !== null && "error" in json
        ? String((json as { error?: unknown }).error)
        : text;
    if (
      res.status === 403 &&
      (errorMessage.includes("Invalid or expired token") ||
        errorMessage.includes("Invalid or expired proxy token"))
    ) {
      throw new Error(`Blocked credentials: ${errorMessage}`);
    }
    throw new Error(`HTTP ${res.status} for ${pathAndQuery}: ${text}`);
  }

  return json as T;
}

function extractTexts(invoice: Invoice): string[] {
  const texts: string[] = [];
  for (const line of invoice.orderLines ?? []) {
    if (line.description) texts.push(line.description);
    if (line.displayName) texts.push(line.displayName);
  }
  for (const order of invoice.orders ?? []) {
    if (order.invoiceComment) texts.push(order.invoiceComment);
    for (const line of order.orderLines ?? []) {
      if (line.description) texts.push(line.description);
      if (line.displayName) texts.push(line.displayName);
    }
  }
  return texts;
}

function invoiceMatches(invoice: Invoice): boolean {
  const org = invoice.customer?.organizationNumber ?? "";
  if (org !== TARGET.orgNumber) return false;

  const exVat = invoice.amountExcludingVatCurrency ?? invoice.amountExcludingVat;
  if (exVat !== TARGET.amountExVat) return false;

  const outstanding =
    invoice.amountCurrencyOutstanding ?? invoice.amountOutstanding ?? null;
  if (outstanding !== 0) return false;

  const haystack = extractTexts(invoice).join("\n");
  return haystack.includes(TARGET.lineText);
}

function getPaymentVoucherId(invoice: Invoice): number {
  const postings = invoice.postings ?? [];
  const invoiceVoucherIds = new Set<number>();
  for (const posting of postings) {
    const voucherId = posting.voucher?.id;
    if (!voucherId) continue;
    if (posting.type === "OUTGOING_INVOICE_CUSTOMER_POSTING") {
      invoiceVoucherIds.add(voucherId);
    }
  }

  const typedPaymentVoucherIds = new Set<number>();
  for (const posting of postings) {
    const voucherId = posting.voucher?.id;
    if (!voucherId) continue;
    if (
      posting.type === "INCOMING_PAYMENT" ||
      posting.type === "INCOMING_PAYMENT_OPPOSITE"
    ) {
      typedPaymentVoucherIds.add(voucherId);
    }
  }
  if (typedPaymentVoucherIds.size === 1) {
    const [voucherId] = [...typedPaymentVoucherIds];
    if (invoiceVoucherIds.has(voucherId)) {
      throw new Error(`Shared invoice/payment voucher ${voucherId}; not exact-match flow`);
    }
    return voucherId;
  }
  if (typedPaymentVoucherIds.size > 1) {
    throw new Error(`Multiple typed payment vouchers: ${[...typedPaymentVoucherIds].join(", ")}`);
  }

  const fallbackVoucherIds = new Set<number>();
  for (const posting of postings) {
    const voucherId = posting.voucher?.id;
    if (!voucherId) continue;
    const amount = posting.amountCurrency ?? posting.amount ?? null;
    const description = posting.description ?? "";
    const isNegative = typeof amount === "number" && amount < 0;
    const looksLikePayment = description.startsWith("Betaling:");
    if (isNegative && looksLikePayment) {
      fallbackVoucherIds.add(voucherId);
    }
  }

  if (fallbackVoucherIds.size !== 1) {
    throw new Error(`Expected one fallback payment voucher, got ${[...fallbackVoucherIds].join(", ")}`);
  }

  const [voucherId] = [...fallbackVoucherIds];
  if (invoiceVoucherIds.has(voucherId)) {
    throw new Error(`Shared invoice/payment voucher ${voucherId}; not exact-match flow`);
  }
  return voucherId;
}

async function main() {
  const params = new URLSearchParams({
    invoiceDateFrom: "2000-01-01",
    invoiceDateTo: TARGET.reverseDate,
    count: "1000",
    sorting: "-invoiceDate",
    fields:
      "*,customer(*),orderLines(*),orders(*),postings(*,voucher(*),account(*),customer(*),closeGroup(*))",
  });

  const list = await api<ApiList<Invoice>>(`invoice?${params.toString()}`);
  const invoices = list.values ?? [];
  const matches = invoices.filter(invoiceMatches);

  if (matches.length !== 1) {
    throw new Error(
      `Expected 1 invoice match, got ${matches.length}: ${JSON.stringify(
        matches.map((invoice) => ({
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          org: invoice.customer?.organizationNumber,
          exVat: invoice.amountExcludingVatCurrency ?? invoice.amountExcludingVat,
          outstanding: invoice.amountCurrencyOutstanding ?? invoice.amountOutstanding,
          texts: extractTexts(invoice),
        })),
      )}`,
    );
  }

  const invoice = matches[0];
  const paymentVoucherId = getPaymentVoucherId(invoice);
  const reverse = await api<ApiValue<{ id?: number }>>(
    `ledger/voucher/${paymentVoucherId}/:reverse?date=${encodeURIComponent(TARGET.reverseDate)}`,
    { method: "PUT" },
  );

  console.log(
    JSON.stringify(
      {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        paymentVoucherId,
        reverseVoucherId: reverse.value?.id ?? null,
      },
      null,
      2,
    ),
  );
}

await main();
