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

function asArray(value: unknown): Json[] {
  return Array.isArray(value) ? (value as Json[]) : [];
}

function asObject(value: unknown): Json | null {
  return value && typeof value === "object" ? (value as Json) : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
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

function paymentPostingSummary(invoice: Json) {
  return asArray(invoice.postings)
    .map((posting) => {
      const account = asObject(posting.account);
      const voucher = asObject(posting.voucher);
      return {
        type: asString(posting.type),
        description: asString(posting.description),
        amountCurrency: asNumber(posting.amountCurrency),
        amount: asNumber(posting.amount),
        accountNumber: account ? asString(account.number) : null,
        voucherId: asNumber(voucher?.id),
      };
    })
    .filter((posting) => {
      const description = posting.description ?? "";
      const amount = posting.amountCurrency ?? posting.amount ?? 0;
      return amount < 0 || description.toLowerCase().includes("betaling");
    });
}

function getPaymentVoucherId(invoice: Json): number {
  const voucherIds = paymentPostingSummary(invoice)
    .filter((posting) => {
      const description = posting.description ?? "";
      const amount = posting.amountCurrency ?? posting.amount ?? 0;
      return amount < 0 && description.toLowerCase().includes("betaling");
    })
    .map((posting) => posting.voucherId)
    .filter((id): id is number => typeof id === "number");

  const unique = [...new Set(voucherIds)];
  if (unique.length !== 1) {
    throw new Error(`Expected exactly one payment voucher, got ${unique.length}: ${JSON.stringify(paymentPostingSummary(invoice), null, 2)}`);
  }
  return unique[0];
}

async function main() {
  const unique = `${Date.now()}`;

  const vatTypes = await api<{ values?: Json[] }>("GET", "ledger/vatType", {
    params: { typeOfVat: "OUTGOING", vatDate: TODAY, fields: "*" },
  });
  const vatTypeId = asNumber(asArray(vatTypes.values)[0]?.id);
  if (vatTypeId === null) {
    throw new Error(`No outgoing vatType: ${JSON.stringify(vatTypes, null, 2)}`);
  }

  const product = await api<{ value?: Json }>("POST", "product", {
    body: {
      name: `Reflection Reverse Product ${unique}`,
      number: unique.slice(-8),
      priceExcludingVatCurrency: 1000,
      vatType: { id: vatTypeId },
    },
  });

  const customer = await api<{ value?: Json }>("POST", "customer", {
    body: {
      name: `Reflection Reverse Customer ${unique}`,
      email: `reflection-${unique}@example.com`,
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
          description: `Reflection Reverse Service ${unique}`,
          count: 1,
          unitPriceExcludingVatCurrency: 1000,
        },
      ],
    },
  });

  const invoice = await api<{ value?: Json }>("PUT", `order/${asNumber(asObject(order.value)?.id)}/:invoice`, {
    params: { invoiceDate: TODAY, sendToCustomer: "false" },
  });

  const paymentTypes = await api<{ values?: Json[] }>("GET", "invoice/paymentType", {
    params: { count: "1000", fields: "*,debitAccount(*),creditAccount(*)" },
  });
  const paymentTypeId = getPaymentTypeId(asArray(paymentTypes.values));

  const outstanding =
    asNumber(asObject(invoice.value)?.amountCurrencyOutstanding) ??
    asNumber(asObject(invoice.value)?.amountOutstanding);
  if (outstanding === null) {
    throw new Error(`Missing outstanding amount on invoice write: ${JSON.stringify(invoice, null, 2)}`);
  }

  const paid = await api<{ value?: Json }>("PUT", `invoice/${asNumber(asObject(invoice.value)?.id)}/:payment`, {
    params: { paymentDate: TODAY, paymentTypeId: String(paymentTypeId), paidAmount: String(outstanding) },
  });

  const located = await api<{ values?: Json[] }>("GET", "invoice", {
    params: {
      invoiceDateFrom: "2026-01-01",
      invoiceDateTo: "2027-01-01",
      id: String(asNumber(asObject(invoice.value)?.id)),
      fields: "*,customer(*),orderLines(*),orders(*,orderLines(*)),postings(*,voucher(*),account(*),customer(*),closeGroup(*))",
    },
  });
  const locatedInvoice = asArray(located.values)[0];
  if (!locatedInvoice) {
    throw new Error(`Located invoice missing: ${JSON.stringify(located, null, 2)}`);
  }

  const paymentVoucherId = getPaymentVoucherId(locatedInvoice);

  const reversed = await api<{ value?: Json }>("PUT", `ledger/voucher/${paymentVoucherId}/:reverse`, {
    params: { date: TODAY },
  });

  const reopened = await api<{ values?: Json[] }>("GET", "invoice", {
    params: {
      invoiceDateFrom: "2026-01-01",
      invoiceDateTo: "2027-01-01",
      id: String(asNumber(asObject(invoice.value)?.id)),
      fields: "*,postings(*,voucher(*),account(*))",
    },
  });
  const reopenedInvoice = asArray(reopened.values)[0];
  const reopenedOutstanding =
    asNumber(reopenedInvoice?.amountCurrencyOutstanding) ??
    asNumber(reopenedInvoice?.amountOutstanding);
  if (reopenedOutstanding !== outstanding) {
    throw new Error(
      `Reopened outstanding mismatch: expected ${outstanding}, got ${reopenedOutstanding}\n${JSON.stringify(reopenedInvoice, null, 2)}`,
    );
  }

  console.log(
    JSON.stringify(
      {
        productId: asNumber(asObject(product.value)?.id),
        customerId: asNumber(asObject(customer.value)?.id),
        orderId: asNumber(asObject(order.value)?.id),
        invoiceId: asNumber(asObject(invoice.value)?.id),
        invoiceNumber: asNumber(asObject(invoice.value)?.invoiceNumber),
        paymentTypeId,
        paidOutstandingAfterPayment:
          asNumber(asObject(paid.value)?.amountCurrencyOutstanding) ??
          asNumber(asObject(paid.value)?.amountOutstanding),
        paymentPostings: paymentPostingSummary(locatedInvoice),
        paymentVoucherId,
        reverseVoucherId: asNumber(asObject(reversed.value)?.id),
        reopenedOutstanding,
      },
      null,
      2,
    ),
  );
}

await main();
