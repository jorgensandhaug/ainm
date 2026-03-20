const BASE_URL = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const SESSION_TOKEN = "VcMUfIVw2z30qmwSqET4_-WXm9ZhFkpEvT56r8x4bt4";
const REVERSE_DATE = "2026-03-20";

const EXPECTED_ORG_NO = "888412972";
const EXPECTED_DESCRIPTION = "Diseño web";
const EXPECTED_EX_VAT = 35800;

const base = BASE_URL.endsWith("/") ? BASE_URL : `${BASE_URL}/`;
const auth = `Basic ${Buffer.from(`0:${SESSION_TOKEN}`).toString("base64")}`;

type Json = Record<string, unknown>;

function buildUrl(path: string, params?: Record<string, string>) {
  const url = new URL(path, base);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

async function tripletex<T>(method: string, path: string, params?: Record<string, string>) {
  const response = await fetch(buildUrl(path, params), {
    method,
    headers: {
      Authorization: auth,
      Accept: "application/json",
    },
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const invalidToken =
      response.status === 403 &&
      body &&
      typeof body === "object" &&
      (body as Json).error === "Invalid or expired token";
    if (invalidToken) {
      throw new Error("Blocked: invalid or expired token");
    }
    throw new Error(`${method} ${path} failed: ${response.status} ${text}`);
  }

  return body as T;
}

function asArray(value: unknown): Json[] {
  return Array.isArray(value) ? (value as Json[]) : [];
}

function asObject(value: unknown): Json | null {
  return value && typeof value === "object" ? (value as Json) : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

function getDescriptions(invoice: Json): string[] {
  const topLevel = asArray(invoice.orderLines).flatMap((line) => {
    return [asString(line.description), asString(line.displayName)].filter(Boolean) as string[];
  });
  const orderLevel = asArray(invoice.orders).flatMap((order) =>
    asArray(order.orderLines).flatMap((line) => {
      return [asString(line.description), asString(line.displayName)].filter(Boolean) as string[];
    }),
  );
  return [...topLevel, ...orderLevel];
}

function summarizePosting(posting: Json) {
  const account = asObject(posting.account);
  const voucher = asObject(posting.voucher);
  return {
    type: asString(posting.type),
    description: asString(posting.description),
    amountCurrency: asNumber(posting.amountCurrency),
    amount: asNumber(posting.amount),
    accountNumber: asString(account?.number),
    voucherId: asNumber(voucher?.id),
  };
}

function summarizeInvoice(invoice: Json) {
  const customer = asObject(invoice.customer);
  return {
    id: asNumber(invoice.id),
    invoiceNumber: asNumber(invoice.invoiceNumber),
    invoiceDate: asString(invoice.invoiceDate),
    amountExcludingVatCurrency: asNumber(invoice.amountExcludingVatCurrency),
    amountExcludingVat: asNumber(invoice.amountExcludingVat),
    amountCurrency: asNumber(invoice.amountCurrency),
    amount: asNumber(invoice.amount),
    amountCurrencyOutstanding: asNumber(invoice.amountCurrencyOutstanding),
    amountOutstanding: asNumber(invoice.amountOutstanding),
    customerName: asString(customer?.name),
    customerOrgNo: asString(customer?.organizationNumber),
    descriptions: getDescriptions(invoice),
    paymentVoucherId: getPaymentVoucherId(invoice),
    postings: asArray(invoice.postings).map(summarizePosting),
  };
}

function getPaymentVoucherId(invoice: Json): number | null {
  const postings = asArray(invoice.postings);

  const typedVoucherIds = postings
    .filter((posting) => {
      const type = asString(posting.type);
      return type === "INCOMING_PAYMENT" || type === "INCOMING_PAYMENT_OPPOSITE";
    })
    .map((posting) => asObject(posting.voucher))
    .map((voucher) => asNumber(voucher?.id))
    .filter((id): id is number => id !== null);
  const typedUnique = [...new Set(typedVoucherIds)];
  if (typedUnique.length === 1) {
    return typedUnique[0];
  }

  const fallbackVoucherIds = postings
    .filter((posting) => {
      const account = asObject(posting.account);
      const accountNumber = asString(account?.number);
      const amountCurrency = asNumber(posting.amountCurrency);
      const amount = asNumber(posting.amount);
      const description = asString(posting.description) ?? "";
      return (
        (accountNumber === "1500" || accountNumber === null) &&
        (amountCurrency ?? amount ?? 0) < 0 &&
        description.toLowerCase().includes("betaling")
      );
    })
    .map((posting) => asObject(posting.voucher))
    .map((voucher) => asNumber(voucher?.id))
    .filter((id): id is number => id !== null);
  const fallbackUnique = [...new Set(fallbackVoucherIds)];
  if (fallbackUnique.length === 1) {
    return fallbackUnique[0];
  }

  return null;
}

async function main() {
  const invoiceResponse = await tripletex<{ values?: Json[] }>("GET", "invoice", {
    invoiceDateFrom: "2000-01-01",
    invoiceDateTo: REVERSE_DATE,
    count: "1000",
    sorting: "-invoiceDate",
    fields: "*,customer(*),orderLines(*),orders(*),postings(*,voucher(*),account(*),customer(*),closeGroup(*))",
  });

  const candidates = asArray(invoiceResponse.values).filter((invoice) => {
    const customer = asObject(invoice.customer);
    const orgNo = asString(customer?.organizationNumber);
    if (orgNo !== EXPECTED_ORG_NO) {
      return false;
    }

    const amountExVat =
      asNumber(invoice.amountExcludingVatCurrency) ??
      asNumber(invoice.amountExcludingVat) ??
      asNumber(invoice.amountCurrency) ??
      asNumber(invoice.amount);
    if (amountExVat !== EXPECTED_EX_VAT) {
      return false;
    }

    const descriptions = getDescriptions(invoice);
    if (!descriptions.some((description) => description.includes(EXPECTED_DESCRIPTION))) {
      return false;
    }

    return getPaymentVoucherId(invoice) !== null;
  });

  if (candidates.length !== 1) {
    const interesting = asArray(invoiceResponse.values)
      .filter((invoice) => {
        const customer = asObject(invoice.customer);
        const orgNo = asString(customer?.organizationNumber);
        const descriptions = getDescriptions(invoice).join(" | ");
        const amountExVat =
          asNumber(invoice.amountExcludingVatCurrency) ??
          asNumber(invoice.amountExcludingVat) ??
          asNumber(invoice.amountCurrency) ??
          asNumber(invoice.amount);
        return (
          orgNo === EXPECTED_ORG_NO ||
          descriptions.includes(EXPECTED_DESCRIPTION) ||
          amountExVat === EXPECTED_EX_VAT
        );
      })
      .map(summarizeInvoice);
    throw new Error(
      `Expected exactly 1 matching paid invoice, got ${candidates.length}\n${JSON.stringify(interesting, null, 2)}`,
    );
  }

  const invoice = candidates[0];
  const invoiceId = asNumber(invoice.id);
  const paymentVoucherId = getPaymentVoucherId(invoice);

  if (invoiceId === null || paymentVoucherId === null) {
    throw new Error("Missing invoice id or payment voucher id");
  }

  const reverseResponse = await tripletex<{ value?: Json }>(
    "PUT",
    `ledger/voucher/${paymentVoucherId}/:reverse`,
    { date: REVERSE_DATE },
  );

  console.log(
    JSON.stringify({
      invoiceId,
      paymentVoucherId,
      reverseVoucherId: asNumber(asObject(reverseResponse.value)?.id),
    }),
  );
}

await main();
