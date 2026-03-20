const baseUrl = process.env.TRIPLETEX_BASE_URL;
const sessionToken = process.env.TRIPLETEX_SESSION_TOKEN;

if (!baseUrl || !sessionToken) {
  throw new Error("Missing TRIPLETEX_BASE_URL or TRIPLETEX_SESSION_TOKEN");
}

const reverseDate = "2026-03-20";
const target = {
  organizationNumber: "913083458",
  description: "Analyserapport",
  amountExcludingVat: 21450,
};

const auth = `Basic ${Buffer.from(`0:${sessionToken}`).toString("base64")}`;

function apiUrl(path: string, params?: Record<string, string>) {
  const url = new URL(path, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }
  return url;
}

async function api(path: string, init: RequestInit = {}, params?: Record<string, string>) {
  const response = await fetch(apiUrl(path, params), {
    ...init,
    headers: {
      Authorization: auth,
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    if (response.status === 403 && data?.error === "Invalid or expired token") {
      throw new Error(`Blocked: ${JSON.stringify(data)}`);
    }
    throw new Error(`HTTP ${response.status}: ${text}`);
  }

  return data;
}

function amountEq(value: unknown, expected: number) {
  return typeof value === "number" && Math.abs(value - expected) < 0.0001;
}

function collectTexts(invoice: any) {
  const texts = new Set<string>();
  const add = (value: unknown) => {
    if (typeof value === "string" && value.trim()) texts.add(value.trim());
  };

  for (const line of invoice.orderLines ?? []) {
    add(line?.description);
    add(line?.displayName);
  }
  for (const order of invoice.orders ?? []) {
    add(order?.invoiceComment);
    add(order?.deliveryComment);
    for (const line of order?.orderLines ?? []) {
      add(line?.description);
      add(line?.displayName);
    }
  }

  return [...texts];
}

function getPaymentVoucherId(invoice: any) {
  const postings = Array.isArray(invoice.postings) ? invoice.postings : [];
  const voucherIds = (rows: any[]) =>
    [...new Set(rows.map((row) => row?.voucher?.id).filter((id) => typeof id === "number"))];

  const typed = postings.filter((posting) =>
    posting?.type === "INCOMING_PAYMENT" || posting?.type === "INCOMING_PAYMENT_OPPOSITE"
  );
  const typedVoucherIds = voucherIds(typed);
  if (typedVoucherIds.length === 1) return typedVoucherIds[0];
  if (typedVoucherIds.length > 1) {
    throw new Error(`Ambiguous typed payment vouchers: ${typedVoucherIds.join(", ")}`);
  }

  const fallback = postings.filter((posting) => {
    const amount = posting?.amountCurrency ?? posting?.amount;
    const description = typeof posting?.description === "string" ? posting.description : "";
    const type = typeof posting?.type === "string" ? posting.type : "";
    return (
      typeof amount === "number" &&
      amount < 0 &&
      (description.startsWith("Betaling:") || type.includes("PAYMENT"))
    );
  });
  const fallbackVoucherIds = voucherIds(fallback);
  if (fallbackVoucherIds.length === 1) return fallbackVoucherIds[0];
  if (fallbackVoucherIds.length > 1) {
    throw new Error(`Ambiguous fallback payment vouchers: ${fallbackVoucherIds.join(", ")}`);
  }

  throw new Error("Payment voucher not found");
}

const invoiceResponse = await api("invoice", { method: "GET" }, {
  invoiceDateFrom: "2000-01-01",
  invoiceDateTo: reverseDate,
  count: "1000",
  sorting: "-invoiceDate",
  fields: "*,customer(*),orderLines(*),orders(*),postings(*,voucher(*),account(*),customer(*),closeGroup(*))",
});

const invoices = Array.isArray(invoiceResponse?.values) ? invoiceResponse.values : [];
const matches = invoices.filter((invoice: any) => {
  const org = invoice?.customer?.organizationNumber;
  const amount = invoice?.amountExcludingVatCurrency ?? invoice?.amountExcludingVat;
  const outstanding = invoice?.amountCurrencyOutstanding ?? invoice?.amountOutstanding;
  const texts = collectTexts(invoice);
  return (
    org === target.organizationNumber &&
    amountEq(amount, target.amountExcludingVat) &&
    amountEq(outstanding, 0) &&
    texts.includes(target.description)
  );
});

if (matches.length !== 1) {
  throw new Error(`Expected 1 matching paid invoice, got ${matches.length}`);
}

const invoice = matches[0];
const paymentVoucherId = getPaymentVoucherId(invoice);
const reverseResponse = await api(`ledger/voucher/${paymentVoucherId}/:reverse`, { method: "PUT" }, {
  date: reverseDate,
});

console.log(
  JSON.stringify(
    {
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber ?? invoice.number ?? null,
      paymentVoucherId,
      reverseVoucherId: reverseResponse?.value?.id ?? null,
    },
    null,
    2
  )
);
