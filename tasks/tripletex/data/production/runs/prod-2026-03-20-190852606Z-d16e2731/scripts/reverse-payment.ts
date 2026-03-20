const baseUrl = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const sessionToken = "W90GLyzwRTQLoP_AENnNV2qSffU9Ce1M8sUjxswRGT4";

const taskDate = "2026-03-20";
const customerOrgNumber = "998536561";
const lineText = "Programvarelisens";
const amountExcludingVat = 32350;

const auth = Buffer.from(`0:${sessionToken}`).toString("base64");

type Invoice = {
  id: number;
  invoiceNumber?: number | string;
  amountOutstanding?: number;
  amountCurrencyOutstanding?: number;
  amountExcludingVat?: number;
  amountExcludingVatCurrency?: number;
  customer?: { organizationNumber?: string; name?: string };
  orderLines?: Array<{ description?: string; displayName?: string }>;
  orders?: Array<{
    invoiceComment?: string;
    orderLines?: Array<{ description?: string; displayName?: string }>;
  }>;
  postings?: Array<{
    type?: string | null;
    description?: string | null;
    amount?: number | null;
    amountCurrency?: number | null;
    voucher?: { id?: number | null } | null;
    account?: { number?: number | null } | null;
  }>;
};

function apiUrl(path: string, params?: Record<string, string>): string {
  const url = new URL(path, `${baseUrl}/`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

async function api<T>(path: string, init?: RequestInit, params?: Record<string, string>): Promise<T> {
  const res = await fetch(apiUrl(path, params), {
    ...init,
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const invalidToken =
      res.status === 403 &&
      data &&
      typeof data === "object" &&
      "error" in data &&
      data.error === "Invalid or expired token";
    if (invalidToken) {
      throw new Error("Blocked: invalid or expired token");
    }
    throw new Error(`HTTP ${res.status}: ${text}`);
  }

  return data as T;
}

function invoiceTexts(invoice: Invoice): string[] {
  return [
    ...(invoice.orderLines ?? []).flatMap((line) => [line.description, line.displayName]),
    ...(invoice.orders ?? []).flatMap((order) => [
      order.invoiceComment,
      ...(order.orderLines ?? []).flatMap((line) => [line.description, line.displayName]),
    ]),
  ].filter((value): value is string => Boolean(value));
}

function findPaymentVoucherId(invoice: Invoice): number {
  const postings = invoice.postings ?? [];

  const typed = postings.filter((posting) => {
    const type = posting.type ?? "";
    return type === "INCOMING_PAYMENT" || type === "INCOMING_PAYMENT_OPPOSITE";
  });
  const typedVoucherIds = [...new Set(typed.map((posting) => posting.voucher?.id).filter((id): id is number => Number.isInteger(id)))];
  if (typedVoucherIds.length === 1) {
    return typedVoucherIds[0];
  }

  const fallback = postings.filter((posting) => {
    const amount = posting.amountCurrency ?? posting.amount ?? 0;
    const description = posting.description ?? "";
    return amount < 0 && description.includes("Betaling:");
  });
  const fallbackVoucherIds = [...new Set(fallback.map((posting) => posting.voucher?.id).filter((id): id is number => Number.isInteger(id)))];
  if (fallbackVoucherIds.length === 1) {
    return fallbackVoucherIds[0];
  }

  throw new Error(`Could not isolate payment voucher for invoice ${invoice.id}`);
}

function pickInvoice(invoices: Invoice[]): Invoice {
  const matches = invoices.filter((invoice) => {
    const orgMatch = invoice.customer?.organizationNumber === customerOrgNumber;
    const amount = invoice.amountExcludingVatCurrency ?? invoice.amountExcludingVat;
    const amountMatch = amount === amountExcludingVat;
    const textMatch = invoiceTexts(invoice).some((text) => text.includes(lineText));
    const outstanding = invoice.amountCurrencyOutstanding ?? invoice.amountOutstanding;
    const paidMatch = outstanding === 0;
    return orgMatch && amountMatch && textMatch && paidMatch;
  });

  if (matches.length !== 1) {
    throw new Error(`Expected exactly 1 matching invoice, got ${matches.length}`);
  }

  return matches[0];
}

async function main() {
  const invoiceResponse = await api<{ values?: Invoice[] }>("invoice", undefined, {
    invoiceDateFrom: "2000-01-01",
    invoiceDateTo: taskDate,
    count: "1000",
    sorting: "-invoiceDate",
    fields: "*,customer(*),orderLines(*),orders(*),postings(*,voucher(*),account(*),customer(*),closeGroup(*))",
  });

  const invoice = pickInvoice(invoiceResponse.values ?? []);
  const voucherId = findPaymentVoucherId(invoice);

  const reverseResponse = await api<{ value?: { id?: number } }>(
    `ledger/voucher/${voucherId}/:reverse`,
    { method: "PUT" },
    { date: taskDate },
  );

  console.log(
    JSON.stringify(
      {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        reversedVoucherId: voucherId,
        reverseVoucherId: reverseResponse.value?.id ?? null,
      },
      null,
      2,
    ),
  );
}

await main();
