const baseUrl = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const sessionToken = "aqa2pTnYwFE72avCP6kYwqY4J72xFm43m0aDap2LnaQ";
const reverseDate = "2026-03-20";

const customerOrgNumber = "819152640";
const invoiceText = "Softwarelizenz";
const amountExcludingVat = 49750;

const auth = `Basic ${Buffer.from(`0:${sessionToken}`).toString("base64")}`;

type AnyRecord = Record<string, unknown>;

function apiUrl(path: string, query?: Record<string, string>) {
  const url = new URL(path, `${baseUrl}/`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, value);
    }
  }
  return url;
}

async function api<T>(path: string, init?: RequestInit, query?: Record<string, string>): Promise<T> {
  const response = await fetch(apiUrl(path, query), {
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
    throw new Error(`HTTP ${response.status} ${response.statusText}: ${text}`);
  }

  return data as T;
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.toLowerCase() : "";
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function numericValue(record: AnyRecord, ...keys: string[]): number | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number") return value;
  }
  return null;
}

function collectInvoiceTexts(invoice: AnyRecord): string[] {
  const texts: string[] = [];

  for (const key of [
    "invoiceComment",
    "comment",
    "description",
    "ourReference",
    "yourReference",
    "deliveryMethod",
  ]) {
    const value = invoice[key];
    if (typeof value === "string") texts.push(value);
  }

  for (const orderLineValue of asArray(invoice.orderLines)) {
    const orderLine = orderLineValue as AnyRecord;
    for (const key of ["description", "displayName", "name"]) {
      const value = orderLine[key];
      if (typeof value === "string") texts.push(value);
    }
    const product = orderLine.product as AnyRecord | undefined;
    if (product && typeof product.name === "string") texts.push(product.name);
  }

  for (const orderValue of asArray(invoice.orders)) {
    const order = orderValue as AnyRecord;
    for (const key of ["invoiceComment", "comment", "description", "name"]) {
      const value = order[key];
      if (typeof value === "string") texts.push(value);
    }
    for (const orderLineValue of asArray(order.orderLines)) {
      const orderLine = orderLineValue as AnyRecord;
      for (const key of ["description", "displayName", "name"]) {
        const value = orderLine[key];
        if (typeof value === "string") texts.push(value);
      }
      const product = orderLine.product as AnyRecord | undefined;
      if (product && typeof product.name === "string") texts.push(product.name);
    }
  }

  return texts;
}

function findPaymentVoucherId(invoice: AnyRecord): number {
  const postings = asArray(invoice.postings).map((posting) => posting as AnyRecord);

  const typedMatches = postings.filter((posting) => {
    const type = posting.type;
    return type === "INCOMING_PAYMENT" || type === "INCOMING_PAYMENT_OPPOSITE";
  });

  const typedVoucherIds = [...new Set(typedMatches.map((posting) => posting.voucher as AnyRecord).map((voucher) => voucher?.id).filter((id): id is number => typeof id === "number"))];
  if (typedVoucherIds.length === 1) return typedVoucherIds[0];
  if (typedVoucherIds.length > 1) {
    throw new Error(`Multiple typed payment vouchers found: ${typedVoucherIds.join(", ")}`);
  }

  const fallbackMatches = postings.filter((posting) => {
    const amount = numericValue(posting, "amountCurrency", "amount");
    const account = posting.account as AnyRecord | undefined;
    const accountNumber = account?.number;
    const description = normalizeText(posting.description);
    return amount !== null && amount < 0 && accountNumber === 1500 && description.includes("betaling");
  });

  const fallbackVoucherIds = [...new Set(fallbackMatches.map((posting) => posting.voucher as AnyRecord).map((voucher) => voucher?.id).filter((id): id is number => typeof id === "number"))];
  if (fallbackVoucherIds.length !== 1) {
    throw new Error(`Expected exactly one fallback payment voucher, found ${fallbackVoucherIds.length}`);
  }
  return fallbackVoucherIds[0];
}

async function main() {
  const invoiceList = await api<{ values?: AnyRecord[] }>(
    "invoice",
    undefined,
    {
      invoiceDateFrom: "2000-01-01",
      invoiceDateTo: "2026-03-20",
      count: "1000",
      sorting: "-invoiceDate",
      fields: "*,customer(*),orderLines(*),orders(*,orderLines(*,product(*))),postings(*,voucher(*),account(*),customer(*),closeGroup(*))",
    },
  );

  const candidates = asArray(invoiceList.values)
    .map((invoice) => invoice as AnyRecord)
    .filter((invoice) => {
      const customer = invoice.customer as AnyRecord | undefined;
      if (!customer || customer.organizationNumber !== customerOrgNumber) return false;

      const exVat = numericValue(invoice, "amountExcludingVatCurrency", "amountExcludingVat");
      if (exVat !== amountExcludingVat) return false;

      const outstanding = numericValue(invoice, "amountCurrencyOutstanding", "amountOutstanding");
      if (outstanding !== 0) return false;

      const texts = collectInvoiceTexts(invoice).map(normalizeText);
      return texts.some((text) => text.includes(invoiceText.toLowerCase()));
    });

  if (candidates.length !== 1) {
    const ids = candidates.map((invoice) => invoice.id).join(", ");
    throw new Error(`Expected exactly one invoice candidate, found ${candidates.length}${ids ? `: ${ids}` : ""}`);
  }

  const invoice = candidates[0];
  const paymentVoucherId = findPaymentVoucherId(invoice);

  const reversal = await api<{ value?: AnyRecord }>(
    `ledger/voucher/${paymentVoucherId}/:reverse`,
    { method: "PUT" },
    { date: reverseDate },
  );

  console.log(
    JSON.stringify(
      {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        paymentVoucherId,
        reverseVoucherId: reversal.value?.id ?? null,
      },
      null,
      2,
    ),
  );
}

await main();
