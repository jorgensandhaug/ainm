const BASE_URL = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "BaHbiQITLTFSRUrnXNIgklfLUSPc-tXf5tF8qoUdFXc";
const REVERSE_DATE = "2026-03-20";

const TARGET = {
  organizationNumber: "835510131",
  amountExcludingVat: 19650,
  description: "Session de formation",
};

type AnyRecord = Record<string, any>;

const auth = Buffer.from(`0:${TOKEN}`).toString("base64");

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(
      `HTTP ${response.status} ${response.statusText} for ${init?.method ?? "GET"} ${path}\n${text}`,
    );
  }

  return data as T;
}

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function getDescriptions(invoice: AnyRecord): string[] {
  const topLevel = Array.isArray(invoice.orderLines) ? invoice.orderLines : [];
  const nestedOrders = Array.isArray(invoice.orders) ? invoice.orders : [];
  const nestedLines = nestedOrders.flatMap((order: AnyRecord) =>
    Array.isArray(order.orderLines) ? order.orderLines : [],
  );

  return [...topLevel, ...nestedLines].flatMap((line: AnyRecord) => [
    line.description,
    line.displayName,
    line.product?.name,
    line.product?.description,
  ]);
}

function amountsMatch(invoice: AnyRecord): boolean {
  return [
    invoice.amountExcludingVatCurrency,
    invoice.amountExcludingVat,
  ].some((value) => Number(value) === TARGET.amountExcludingVat);
}

function isFullyPaid(invoice: AnyRecord): boolean {
  return [invoice.amountCurrencyOutstanding, invoice.amountOutstanding].some(
    (value) => Number(value) === 0,
  );
}

function matchesBase(invoice: AnyRecord): boolean {
  if (invoice.customer?.organizationNumber !== TARGET.organizationNumber) {
    return false;
  }

  if (!amountsMatch(invoice)) {
    return false;
  }

  const needle = normalizeText(TARGET.description);
  return getDescriptions(invoice).some((value) => normalizeText(value) === needle);
}

function extractPaymentVoucherId(invoice: AnyRecord): number {
  const postings = Array.isArray(invoice.postings) ? invoice.postings : [];

  const preferredVoucherIds = [
    ...new Set(
      postings
        .filter((posting: AnyRecord) =>
          ["INCOMING_PAYMENT", "INCOMING_PAYMENT_OPPOSITE"].includes(posting.type),
        )
        .map((posting: AnyRecord) => posting.voucher?.id)
        .filter((value: unknown): value is number => typeof value === "number"),
    ),
  ];

  if (preferredVoucherIds.length === 1) {
    return preferredVoucherIds[0];
  }

  const fallbackVoucherIds = [
    ...new Set(
      postings
        .filter((posting: AnyRecord) => {
          const amount = Number(
            posting.amount ?? posting.amountCurrency ?? posting.amountGross ?? 0,
          );
          return amount < 0 && typeof posting.voucher?.id === "number";
        })
        .map((posting: AnyRecord) => posting.voucher.id),
    ),
  ];

  if (fallbackVoucherIds.length === 1) {
    return fallbackVoucherIds[0];
  }

  throw new Error(
    `Could not isolate one payment voucher. preferred=${JSON.stringify(preferredVoucherIds)} fallback=${JSON.stringify(fallbackVoucherIds)}`,
  );
}

async function main() {
  const locateParams = new URLSearchParams({
    invoiceDateFrom: "2000-01-01",
    invoiceDateTo: "2026-03-21",
    count: "1000",
    sorting: "-invoiceDate",
    fields:
      "*,customer(*),orderLines(*),orders(*,orderLines(*)),postings(*,voucher(*),account(*),customer(*),closeGroup(*))",
  });

  const locate = await api<{ values?: AnyRecord[] }>(`/invoice?${locateParams.toString()}`);
  const invoices = Array.isArray(locate.values) ? locate.values : [];
  const baseMatches = invoices.filter(matchesBase);
  const paidMatches = baseMatches.filter(isFullyPaid);

  if (paidMatches.length === 0) {
    const reopenedMatches = baseMatches.filter(
      (invoice) => Number(invoice.amountCurrencyOutstanding ?? invoice.amountOutstanding ?? 0) > 0,
    );

    if (reopenedMatches.length === 1) {
      const invoice = reopenedMatches[0];
      console.log(
        JSON.stringify(
          {
            alreadyReversed: true,
            invoiceId: invoice.id,
            reopenedOutstanding: Number(
              invoice.amountCurrencyOutstanding ?? invoice.amountOutstanding,
            ),
          },
          null,
          2,
        ),
      );
      return;
    }

    throw new Error(
      `Expected exactly 1 paid match before reversal, got ${paidMatches.length}. base=${baseMatches.length} reopened=${reopenedMatches.length}`,
    );
  }

  if (paidMatches.length !== 1) {
    throw new Error(`Expected exactly 1 paid match before reversal, got ${paidMatches.length}`);
  }

  const invoice = paidMatches[0];
  const invoiceId = Number(invoice.id);
  const expectedOutstanding = Number(
    invoice.amountCurrency ?? invoice.amount ?? invoice.amountExcludingVatCurrency ?? invoice.amountExcludingVat,
  );
  const paymentVoucherId = extractPaymentVoucherId(invoice);

  const reverse = await api<{ value?: AnyRecord }>(
    `/ledger/voucher/${paymentVoucherId}/:reverse?date=${encodeURIComponent(REVERSE_DATE)}`,
    { method: "PUT" },
  );

  const verifyParams = new URLSearchParams({
    invoiceDateFrom: "2000-01-01",
    invoiceDateTo: "2026-03-21",
    id: String(invoiceId),
    fields: "*,postings(*,voucher(*))",
  });

  const verify = await api<{ values?: AnyRecord[] }>(`/invoice?${verifyParams.toString()}`);
  const verifiedInvoice = Array.isArray(verify.values) ? verify.values[0] : null;

  if (!verifiedInvoice) {
    throw new Error(`Invoice ${invoiceId} missing in verification read`);
  }

  const reopenedOutstanding = Number(
    verifiedInvoice.amountCurrencyOutstanding ?? verifiedInvoice.amountOutstanding,
  );

  if (reopenedOutstanding !== expectedOutstanding) {
    throw new Error(
      `Outstanding mismatch after reversal. expected=${expectedOutstanding} actual=${reopenedOutstanding}`,
    );
  }

  console.log(
    JSON.stringify(
      {
        invoiceId,
        paymentVoucherId,
        reverseVoucherId: reverse.value?.id ?? null,
        reopenedOutstanding,
      },
      null,
      2,
    ),
  );
}

await main();
