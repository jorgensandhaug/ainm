const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const sessionToken =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const taskDate = "2026-03-20";

const auth = Buffer.from(`0:${sessionToken}`).toString("base64");
const stamp = `${Date.now()}`;
const orgNumber = `99${stamp.slice(-7)}`;
const productNumber = stamp.slice(-6);
const lineText = `Reflection reverse ${stamp}`;
const amountExcludingVat = 1000;

type Customer = { id: number; organizationNumber?: string };
type Product = { id: number; number?: string; priceExcludingVatCurrency?: number; vatType?: { percentage?: number } | null };
type PaymentType = {
  id: number;
  name?: string;
  debitAccount?: { number?: number | null } | null;
  creditAccount?: { number?: number | null } | null;
};
type Order = { id: number };
type Invoice = {
  id: number;
  invoiceNumber?: number | string;
  amountExcludingVatCurrency?: number;
  amountExcludingVat?: number;
  amountCurrencyOutstanding?: number;
  amountOutstanding?: number;
  customer?: { organizationNumber?: string; name?: string };
  orderLines?: Array<{ description?: string; displayName?: string }>;
  orders?: Array<{
    invoiceComment?: string;
    orderLines?: Array<{ description?: string; displayName?: string }>;
  }>;
  postings?: Array<{
    type?: string | null;
    description?: string | null;
    amountCurrency?: number | null;
    amount?: number | null;
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
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${path}: ${text}`);
  }

  return data as T;
}

function pickPaymentType(values: PaymentType[]): PaymentType {
  const preferred =
    values.find((value) => value.name === "Betalt til bank" && value.debitAccount?.number === 1920) ??
    values.find((value) => value.name === "Betalt til bank") ??
    values.find((value) => value.debitAccount?.number === 1920);

  if (!preferred) {
    throw new Error("No incoming payment type found");
  }

  return preferred;
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

function pickInvoice(values: Invoice[], expectedInvoiceId: number): Invoice | null {
  const matches = values.filter((invoice) => {
    const orgMatch = invoice.customer?.organizationNumber === orgNumber;
    const amount = invoice.amountExcludingVatCurrency ?? invoice.amountExcludingVat;
    const amountMatch = amount === amountExcludingVat;
    const textMatch = invoiceTexts(invoice).some((text) => text.includes(lineText));
    const outstanding = invoice.amountCurrencyOutstanding ?? invoice.amountOutstanding;
    return orgMatch && amountMatch && textMatch && outstanding === 0;
  });

  if (matches.length === 0) {
    return null;
  }
  if (matches.length !== 1) {
    throw new Error(`Expected 1 paid invoice from search, got ${matches.length}`);
  }

  if (matches[0].id !== expectedInvoiceId) {
    throw new Error(`Search matched invoice ${matches[0].id}, expected ${expectedInvoiceId}`);
  }

  return matches[0];
}

function pickVoucherId(invoice: Invoice): number {
  const postings = invoice.postings ?? [];
  const typed = [...new Set(
    postings
      .filter((posting) => posting.type === "INCOMING_PAYMENT" || posting.type === "INCOMING_PAYMENT_OPPOSITE")
      .map((posting) => posting.voucher?.id)
      .filter((id): id is number => Number.isInteger(id)),
  )];
  if (typed.length === 1) {
    return typed[0];
  }

  const fallback = [...new Set(
    postings
      .filter((posting) => {
        const amount = posting.amountCurrency ?? posting.amount ?? 0;
        return amount < 0 && (posting.description ?? "").includes("Betaling:");
      })
      .map((posting) => posting.voucher?.id)
      .filter((id): id is number => Number.isInteger(id)),
  )];
  if (fallback.length === 1) {
    return fallback[0];
  }

  throw new Error(
    JSON.stringify({
      message: `Could not isolate payment voucher on invoice ${invoice.id}`,
      postings: postings.map((posting) => ({
        type: posting.type ?? null,
        description: posting.description ?? null,
        amountCurrency: posting.amountCurrency ?? null,
        amount: posting.amount ?? null,
        voucherId: posting.voucher?.id ?? null,
        accountNumber: posting.account?.number ?? null,
      })),
    }),
  );
}

async function main() {
  const createdCustomer = await api<{ value: Customer }>("customer", {
    method: "POST",
    body: JSON.stringify({
      name: `Reflection Reverse Customer ${stamp}`,
      email: `reflection-${stamp}@example.com`,
      organizationNumber: orgNumber,
    }),
  });

  const createdProduct = await api<{ value: Product }>("product", {
    method: "POST",
    body: JSON.stringify({
      name: `Reflection Reverse Product ${stamp}`,
      number: productNumber,
      priceExcludingVatCurrency: amountExcludingVat,
    }),
  });

  const createdOrder = await api<{ value: Order }>("order", {
    method: "POST",
    body: JSON.stringify({
      customer: { id: createdCustomer.value.id },
      orderDate: taskDate,
      deliveryDate: taskDate,
      orderLines: [
        {
          product: { id: createdProduct.value.id },
          description: lineText,
          count: 1,
          unitPriceExcludingVatCurrency: amountExcludingVat,
        },
      ],
    }),
  });

  const invoicedOrder = await api<{ value: Invoice }>(
    `order/${createdOrder.value.id}/:invoice`,
    { method: "PUT" },
    {
      invoiceDate: taskDate,
      sendToCustomer: "false",
    },
  );

  const invoiceId = invoicedOrder.value.id;
  const paymentTypes = await api<{ values: PaymentType[] }>("invoice/paymentType", undefined, {
    count: "1000",
    fields: "*,debitAccount(*),creditAccount(*)",
  });
  const paymentType = pickPaymentType(paymentTypes.values ?? []);
  const paidAmount = String(
    invoicedOrder.value.amountCurrencyOutstanding ?? invoicedOrder.value.amountOutstanding ?? amountExcludingVat,
  );
  await api<{ value: Invoice }>(
    `invoice/${invoiceId}/:payment`,
    { method: "PUT" },
    {
      paymentDate: taskDate,
      paymentTypeId: String(paymentType.id),
      paidAmount,
    },
  );

  const located = await api<{ values: Invoice[] }>("invoice", undefined, {
    invoiceDateFrom: "2000-01-01",
    invoiceDateTo: taskDate,
    count: "1000",
    sorting: "-invoiceDate",
    fields: "*,customer(*),orderLines(*),orders(*),postings(*,voucher(*),account(*),customer(*),closeGroup(*))",
  });
  const searchMatchedInvoice = pickInvoice(located.values ?? [], invoiceId);
  const locatedInvoice =
    searchMatchedInvoice ??
    (
      await api<{ value: Invoice }>(`invoice/${invoiceId}`, undefined, {
        fields: "*,customer(*),orderLines(*),orders(*,orderLines(*)),postings(*,voucher(*),account(*),customer(*),closeGroup(*))",
      })
    ).value;
  const paymentVoucherId = pickVoucherId(locatedInvoice);

  const reversed = await api<{ value?: { id?: number } }>(
    `ledger/voucher/${paymentVoucherId}/:reverse`,
    { method: "PUT" },
    { date: taskDate },
  );

  const verified = await api<{ value: Invoice }>(`invoice/${invoiceId}`, undefined, {
    fields: "*,postings(*,voucher(*),account(*))",
  });

  console.log(
    JSON.stringify(
      {
        fixture: {
          customerId: createdCustomer.value.id,
          orgNumber,
          productId: createdProduct.value.id,
          productVatPercentage: createdProduct.value.vatType?.percentage ?? null,
          paymentTypeId: paymentType.id,
          orderId: createdOrder.value.id,
          invoiceId,
          invoiceNumber: invoicedOrder.value.invoiceNumber,
        },
        locateProof: {
          searchMatchedInvoiceId: searchMatchedInvoice?.id ?? null,
          directReadFallbackUsed: searchMatchedInvoice === null,
          matchedInvoiceId: locatedInvoice.id,
          matchedOutstandingBeforeReverse:
            locatedInvoice.amountCurrencyOutstanding ?? locatedInvoice.amountOutstanding ?? null,
          paymentVoucherId,
        },
        reverseProof: {
          reverseVoucherId: reversed.value?.id ?? null,
          reopenedOutstanding:
            verified.value.amountCurrencyOutstanding ?? verified.value.amountOutstanding ?? null,
        },
      },
      null,
      2,
    ),
  );
}

await main();
