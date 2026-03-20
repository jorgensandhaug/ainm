const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const SESSION_TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const TODAY = "2026-03-20";

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

async function api<T>(method: string, path: string, init?: { params?: Record<string, string>; body?: unknown }) {
  const response = await fetch(buildUrl(path, init?.params), {
    method,
    headers: {
      Authorization: auth,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`${method} ${path} failed: ${response.status}\n${text}`);
  }
  return body as T;
}

function asObject(value: unknown): Json | null {
  return value && typeof value === "object" ? (value as Json) : null;
}

function asArray(value: unknown): Json[] {
  return Array.isArray(value) ? (value as Json[]) : [];
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

function getPaymentTypeId(values: Json[]): number {
  const scored = [...values].sort((a, b) => {
    const rank = (value: Json) => {
      const debit = String(asObject(value.debitAccount)?.number ?? "");
      return Number(debit.startsWith("19")) * 4 + Number(asObject(value.debitAccount)?.isBankAccount) * 2 + Number(asObject(value.debitAccount)?.isInvoiceAccount);
    };
    return rank(b) - rank(a);
  });
  const chosenId = asNumber(scored[0]?.id);
  if (chosenId === null) {
    throw new Error(`No usable payment type: ${JSON.stringify(values, null, 2)}`);
  }
  return chosenId;
}

function pickPaymentVoucher(invoice: Json) {
  const candidates = asArray(invoice.postings)
    .map((posting) => {
      const voucher = asObject(posting.voucher);
      const account = asObject(posting.account);
      return {
        type: asString(posting.type),
        description: asString(posting.description),
        amountCurrency: asNumber(posting.amountCurrency),
        amount: asNumber(posting.amount),
        voucherId: asNumber(voucher?.id),
        accountNumber: asString(account?.number),
      };
    })
    .filter((posting) => {
      const description = posting.description ?? "";
      const amount = posting.amountCurrency ?? posting.amount ?? 0;
      return amount < 0 && description.includes("Betaling:");
    });

  const uniqueVoucherIds = [...new Set(candidates.map((posting) => posting.voucherId).filter((id): id is number => typeof id === "number"))];
  if (uniqueVoucherIds.length !== 1) {
    throw new Error(`Expected one payment voucher, got ${JSON.stringify(candidates, null, 2)}`);
  }

  return {
    voucherId: uniqueVoucherIds[0],
    candidates,
  };
}

async function main() {
  const unique = `${Date.now()}`;

  const vatTypes = await api<{ values?: Json[] }>("GET", "ledger/vatType", {
    params: { typeOfVat: "OUTGOING", vatDate: TODAY, fields: "*" },
  });
  const vatTypeId = asNumber(asArray(vatTypes.values)[0]?.id);
  if (vatTypeId === null) {
    throw new Error(`No outgoing vat type: ${JSON.stringify(vatTypes, null, 2)}`);
  }

  const product = await api<{ value?: Json }>("POST", "product", {
    body: {
      name: `Reflection Reverse Null Account Product ${unique}`,
      number: unique.slice(-8),
      priceExcludingVatCurrency: 1000,
      vatType: { id: vatTypeId },
    },
  });

  const customer = await api<{ value?: Json }>("POST", "customer", {
    body: {
      name: `Reflection Reverse Null Account Customer ${unique}`,
      email: `reverse-null-${unique}@example.com`,
      organizationNumber: unique.slice(-9),
    },
  });

  const order = await api<{ value?: Json }>("POST", "order", {
    body: {
      customer: { id: asNumber(asObject(customer.value)?.id) },
      orderDate: TODAY,
      deliveryDate: TODAY,
      orderLines: [
        {
          product: { id: asNumber(asObject(product.value)?.id) },
          description: `Horas de consultoria ${unique}`,
          count: 1,
          unitPriceExcludingVatCurrency: 1000,
        },
      ],
    },
  });

  const invoice = await api<{ value?: Json }>("PUT", `order/${asNumber(asObject(order.value)?.id)}/:invoice`, {
    params: { invoiceDate: TODAY, sendToCustomer: "false" },
  });
  const invoiceId = asNumber(asObject(invoice.value)?.id);
  if (invoiceId === null) {
    throw new Error(`Missing invoice id: ${JSON.stringify(invoice, null, 2)}`);
  }

  const paymentTypes = await api<{ values?: Json[] }>("GET", "invoice/paymentType", {
    params: { count: "1000", fields: "*,debitAccount(*),creditAccount(*)" },
  });
  const paymentTypeId = getPaymentTypeId(asArray(paymentTypes.values));

  const outstanding =
    asNumber(asObject(invoice.value)?.amountCurrencyOutstanding) ??
    asNumber(asObject(invoice.value)?.amountOutstanding);
  if (outstanding === null) {
    throw new Error(`Missing outstanding amount: ${JSON.stringify(invoice, null, 2)}`);
  }

  await api("PUT", `invoice/${invoiceId}/:payment`, {
    params: { paymentDate: TODAY, paymentTypeId: String(paymentTypeId), paidAmount: String(outstanding) },
  });

  const located = await api<{ values?: Json[] }>("GET", "invoice", {
    params: {
      invoiceDateFrom: "2000-01-01",
      invoiceDateTo: TODAY,
      id: String(invoiceId),
      fields: "*,customer(*),orderLines(*),orders(*),postings(*,voucher(*),account(*),customer(*),closeGroup(*))",
    },
  });
  let locatedInvoice = asArray(located.values)[0] ?? null;
  const searchLagObserved = !locatedInvoice;
  if (!locatedInvoice) {
    const direct = await api<{ value?: Json }>("GET", `invoice/${invoiceId}`, {
      params: {
        fields: "*,customer(*),orderLines(*),orders(*,orderLines(*)),postings(*,voucher(*),account(*),customer(*),closeGroup(*))",
      },
    });
    locatedInvoice = asObject(direct.value);
  }
  if (!locatedInvoice) {
    throw new Error(`Invoice not found via search or direct read: ${JSON.stringify(located, null, 2)}`);
  }

  const payment = pickPaymentVoucher(locatedInvoice);

  const reversed = await api<{ value?: Json }>("PUT", `ledger/voucher/${payment.voucherId}/:reverse`, {
    params: { date: TODAY },
  });

  const reopened = await api<{ value?: Json }>("GET", `invoice/${invoiceId}`, {
    params: { fields: "*,postings(*,voucher(*),account(*))" },
  });
  const reopenedOutstanding =
    asNumber(asObject(reopened.value)?.amountCurrencyOutstanding) ??
    asNumber(asObject(reopened.value)?.amountOutstanding);

  console.log(
    JSON.stringify(
      {
        productId: asNumber(asObject(product.value)?.id),
        customerId: asNumber(asObject(customer.value)?.id),
        orderId: asNumber(asObject(order.value)?.id),
        invoiceId,
        paymentTypeId,
        searchLagObserved,
        locatePaymentCandidates: payment.candidates,
        reverseVoucherId: asNumber(asObject(reversed.value)?.id),
        reopenedOutstanding,
      },
      null,
      2,
    ),
  );
}

await main();
