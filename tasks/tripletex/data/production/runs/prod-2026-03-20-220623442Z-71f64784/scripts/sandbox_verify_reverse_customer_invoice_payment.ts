const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const RUN_DATE = "2026-03-20";
const DUE_DATE = "2026-04-03";

const suffix = `${Date.now()}`.slice(-9);
const TARGET = {
  orgNumber: suffix,
  customerName: `Reflection Reverse Polaris ${suffix} AS`,
  email: `reflection-reverse-${suffix}@example.com`,
  description: `Skylagring Reflection ${suffix}`,
  amountExVat: 1000,
};

const base = BASE_URL.endsWith("/") ? BASE_URL : `${BASE_URL}/`;
const auth = `Basic ${Buffer.from(`0:${TOKEN}`).toString("base64")}`;

type Wrapper<T> = { value?: T; values?: T[]; fullResultSize?: number };
type Customer = { id: number };
type VatType = { id: number; percentage?: number | null };
type PaymentType = {
  id: number;
  description?: string | null;
  debitAccount?: {
    number?: string | number | null;
    isBankAccount?: boolean | null;
    isInvoiceAccount?: boolean | null;
  } | null;
  creditAccount?: {
    number?: string | number | null;
  } | null;
};
type Posting = {
  type?: string | null;
  description?: string | null;
  amountCurrency?: number | null;
  amount?: number | null;
  voucher?: { id?: number | null } | null;
  account?: { number?: string | number | null } | null;
};
type Invoice = {
  id: number;
  invoiceNumber?: number | string | null;
  amountExcludingVatCurrency?: number | null;
  amountExcludingVat?: number | null;
  amountCurrency?: number | null;
  amountCurrencyOutstanding?: number | null;
  amountOutstanding?: number | null;
  customer?: { organizationNumber?: string | null; name?: string | null } | null;
  orderLines?: Array<{ description?: string | null; displayName?: string | null }> | null;
  orders?: Array<{
    invoiceComment?: string | null;
    orderLines?: Array<{ description?: string | null; displayName?: string | null }> | null;
  }> | null;
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
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    body:
      init?.body && typeof init.body !== "string"
        ? JSON.stringify(init.body)
        : init?.body,
  });

  const text = await res.text();
  const json = text ? JSON.parse(text) : undefined;

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${pathAndQuery}: ${text}`);
  }

  return json as T;
}

function oneValue<T>(wrapper: Wrapper<T>, label: string): T {
  if (!wrapper.value) throw new Error(`${label}: missing value`);
  return wrapper.value;
}

function manyValues<T>(wrapper: Wrapper<T>, label: string): T[] {
  if (!wrapper.values) throw new Error(`${label}: missing values`);
  return wrapper.values;
}

function invoiceTexts(invoice: Invoice): string[] {
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

function outstanding(invoice: Invoice): number {
  const value = invoice.amountCurrencyOutstanding ?? invoice.amountOutstanding;
  if (typeof value !== "number") throw new Error("Invoice missing outstanding amount");
  return value;
}

function normalizeAccountNumber(value: unknown): string {
  return value == null ? "" : String(value);
}

function choosePaymentType(paymentTypes: PaymentType[]): PaymentType {
  const ranked = [...paymentTypes].sort((a, b) => {
    const score = (paymentType: PaymentType) => {
      const debit = paymentType.debitAccount;
      const number = normalizeAccountNumber(debit?.number);
      return [
        debit?.isBankAccount ? 1 : 0,
        debit?.isInvoiceAccount ? 1 : 0,
        number.startsWith("19") ? 1 : 0,
        paymentType.description === "Betalt til bank" ? 1 : 0,
      ].reduce((sum, n) => sum + n, 0);
    };
    return score(b) - score(a);
  });

  const chosen = ranked[0];
  if (!chosen) throw new Error("No payment types returned");
  return chosen;
}

function extractPaymentVoucherId(invoice: Invoice): number {
  const postings = invoice.postings ?? [];
  const invoiceVoucherIds = new Set<number>();
  for (const posting of postings) {
    const voucherId = posting.voucher?.id;
    if (voucherId && posting.type === "OUTGOING_INVOICE_CUSTOMER_POSTING") {
      invoiceVoucherIds.add(voucherId);
    }
  }

  const typed = new Set<number>();
  for (const posting of postings) {
    const voucherId = posting.voucher?.id;
    if (!voucherId) continue;
    if (
      posting.type === "INCOMING_PAYMENT" ||
      posting.type === "INCOMING_PAYMENT_OPPOSITE"
    ) {
      typed.add(voucherId);
    }
  }
  if (typed.size === 1) {
    const [voucherId] = [...typed];
    if (invoiceVoucherIds.has(voucherId)) {
      throw new Error(`Shared invoice/payment voucher ${voucherId}`);
    }
    return voucherId;
  }

  const fallback = new Set<number>();
  for (const posting of postings) {
    const voucherId = posting.voucher?.id;
    if (!voucherId) continue;
    const amount = posting.amountCurrency ?? posting.amount;
    if (typeof amount === "number" && amount < 0 && (posting.description ?? "").startsWith("Betaling:")) {
      fallback.add(voucherId);
    }
  }
  if (fallback.size !== 1) {
    throw new Error(`Expected 1 fallback payment voucher, got ${[...fallback].join(", ")}`);
  }
  const [voucherId] = [...fallback];
  if (invoiceVoucherIds.has(voucherId)) {
    throw new Error(`Shared invoice/payment voucher ${voucherId}`);
  }
  return voucherId;
}

async function main() {
  const calls: string[] = [];

  const customer = oneValue(
    await api<Wrapper<Customer>>("customer", {
      method: "POST",
      body: {
        name: TARGET.customerName,
        email: TARGET.email,
        organizationNumber: TARGET.orgNumber,
      } satisfies Record<string, unknown>,
    }),
    "POST /customer",
  );
  calls.push("POST /customer");

  const vatParams = new URLSearchParams({
    typeOfVat: "OUTGOING",
    vatDate: RUN_DATE,
    fields: "*",
  });
  const vatTypes = manyValues(
    await api<Wrapper<VatType>>(`ledger/vatType?${vatParams.toString()}`),
    "GET /ledger/vatType",
  );
  calls.push(`GET /ledger/vatType?${vatParams.toString()}`);
  const vatZero = vatTypes.find((vatType) => Number(vatType.percentage) === 0);
  if (!vatZero) throw new Error("No 0% outgoing VAT type in sandbox");

  const invoice = oneValue(
    await api<Wrapper<Invoice>>(`invoice?sendToCustomer=false`, {
      method: "POST",
      body: {
        invoiceDate: RUN_DATE,
        invoiceDueDate: DUE_DATE,
        customer: { id: customer.id },
        orders: [
          {
            customer: { id: customer.id },
            orderDate: RUN_DATE,
            deliveryDate: RUN_DATE,
            orderLines: [
              {
                description: TARGET.description,
                count: 1,
                unitPriceExcludingVatCurrency: TARGET.amountExVat,
                vatType: { id: vatZero.id },
              },
            ],
          },
        ],
      } satisfies Record<string, unknown>,
    }),
    "POST /invoice",
  );
  calls.push("POST /invoice?sendToCustomer=false");

  const paymentTypes = manyValues(
    await api<Wrapper<PaymentType>>(
      "invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)",
    ),
    "GET /invoice/paymentType",
  );
  calls.push("GET /invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)");
  const paymentType = choosePaymentType(paymentTypes);

  const payment = oneValue(
    await api<Wrapper<Invoice>>(
      `invoice/${invoice.id}/:payment?paymentDate=${encodeURIComponent(
        RUN_DATE,
      )}&paymentTypeId=${paymentType.id}&paidAmount=${outstanding(invoice)}`,
      { method: "PUT" },
    ),
    "PUT /invoice/{id}/:payment",
  );
  calls.push("PUT /invoice/{id}/:payment");
  if (outstanding(payment) !== 0) {
    throw new Error(`Payment proof failed; outstanding ${outstanding(payment)}`);
  }

  const locateParams = new URLSearchParams({
    invoiceDateFrom: "2000-01-01",
    invoiceDateTo: RUN_DATE,
    count: "1000",
    sorting: "-invoiceDate",
    fields:
      "*,customer(*),orderLines(*),orders(*),postings(*,voucher(*),account(*),customer(*),closeGroup(*))",
  });
  const locatedInvoices = manyValues(
    await api<Wrapper<Invoice>>(`invoice?${locateParams.toString()}`),
    "GET /invoice",
  );
  calls.push(`GET /invoice?${locateParams.toString()}`);

  const matches = locatedInvoices.filter((candidate) => {
    if ((candidate.customer?.organizationNumber ?? "") !== TARGET.orgNumber) return false;
    if ((candidate.amountExcludingVatCurrency ?? candidate.amountExcludingVat) !== TARGET.amountExVat) {
      return false;
    }
    if ((candidate.amountCurrencyOutstanding ?? candidate.amountOutstanding) !== 0) return false;
    return invoiceTexts(candidate).some((text) => text === TARGET.description);
  });

  let matchedInvoice: Invoice;
  let broadSearchMatchCount = matches.length;
  if (matches.length === 1) {
    matchedInvoice = matches[0];
  } else {
    matchedInvoice = oneValue(
      await api<Wrapper<Invoice>>(
        `invoice/${invoice.id}?fields=*,customer(*),orderLines(*),orders(*,orderLines(*)),postings(*,voucher(*),account(*),customer(*),closeGroup(*))`,
      ),
      "GET /invoice/{id} fallback",
    );
    calls.push("GET /invoice/{id}?fields=*,customer(*),orderLines(*),orders(*,orderLines(*)),postings(*,voucher(*),account(*),customer(*),closeGroup(*)) [fallback]");
    const fallbackMatches =
      (matchedInvoice.customer?.organizationNumber ?? "") === TARGET.orgNumber &&
      (matchedInvoice.amountExcludingVatCurrency ?? matchedInvoice.amountExcludingVat) === TARGET.amountExVat &&
      (matchedInvoice.amountCurrencyOutstanding ?? matchedInvoice.amountOutstanding) === 0 &&
      invoiceTexts(matchedInvoice).some((text) => text === TARGET.description);
    if (!fallbackMatches) {
      throw new Error(`Fallback invoice read did not match target; broad matches ${matches.length}`);
    }
  }

  const paymentVoucherId = extractPaymentVoucherId(matchedInvoice);

  const reversal = oneValue(
    await api<Wrapper<{ id?: number }>>(
      `ledger/voucher/${paymentVoucherId}/:reverse?date=${encodeURIComponent(RUN_DATE)}`,
      { method: "PUT" },
    ),
    "PUT /ledger/voucher/{id}/:reverse",
  );
  calls.push("PUT /ledger/voucher/{id}/:reverse");

  const verified = oneValue(
    await api<Wrapper<Invoice>>(
      `invoice/${matchedInvoice.id}?fields=*,customer(*),orderLines(*),orders(*,orderLines(*)),postings(*,voucher(*),account(*),customer(*),closeGroup(*))`,
    ),
    "GET /invoice/{id}",
  );
  calls.push("GET /invoice/{id}?fields=*,customer(*),orderLines(*),orders(*,orderLines(*)),postings(*,voucher(*),account(*),customer(*),closeGroup(*))");

  const reopenedOutstanding = outstanding(verified);
  if (reopenedOutstanding !== TARGET.amountExVat) {
    throw new Error(`Expected reopened outstanding ${TARGET.amountExVat}, got ${reopenedOutstanding}`);
  }

  console.log(
    JSON.stringify(
      {
        setup: {
          customerId: customer.id,
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber ?? null,
          paymentTypeId: paymentType.id,
          paymentTypeDescription: paymentType.description ?? null,
        },
        proof: {
          calls,
          locatedInvoiceId: matchedInvoice.id,
          broadSearchMatchCount,
          paymentVoucherId,
          reverseVoucherId: reversal.id ?? null,
          reopenedOutstanding,
          matchedTexts: invoiceTexts(matchedInvoice),
          paymentPostings: (matchedInvoice.postings ?? [])
            .filter((posting) => {
              const amount = posting.amountCurrency ?? posting.amount;
              return typeof amount === "number" && amount < 0;
            })
            .map((posting) => ({
              type: posting.type ?? null,
              description: posting.description ?? null,
              amountCurrency: posting.amountCurrency ?? posting.amount ?? null,
              voucherId: posting.voucher?.id ?? null,
              accountNumber: posting.account?.number ?? null,
            })),
        },
      },
      null,
      2,
    ),
  );
}

await main();
