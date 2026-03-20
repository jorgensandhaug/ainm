const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const SESSION_TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const TODAY = "2026-03-20";

const auth = Buffer.from(`0:${SESSION_TOKEN}`).toString("base64");

type Json = Record<string, any>;

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const text = await res.text();
  const body = text ? JSON.parse(text) : null;

  if (!res.ok) {
    throw new Error(
      `${init?.method ?? "GET"} ${path} failed: ${res.status} ${res.statusText}\n${JSON.stringify(body, null, 2)}`,
    );
  }

  return body as T;
}

function getPaymentTypeId(paymentTypes: Json[]): number {
  const ranked = [...paymentTypes].sort((a, b) => {
    const score = (value: Json) => {
      const debit = String(value.debitAccount?.number ?? "");
      return Number(debit.startsWith("19")) * 4 + Number(value.debitAccount?.isBankAccount) * 2 + Number(value.debitAccount?.isInvoiceAccount);
    };
    return score(b) - score(a);
  });

  const picked = ranked[0];
  if (!picked?.id) {
    throw new Error(`No usable payment type in ${JSON.stringify(paymentTypes, null, 2)}`);
  }
  return picked.id;
}

function getPaymentVoucherId(invoice: Json): number {
  const ids = new Set<number>();

  for (const posting of invoice.postings ?? []) {
    const voucherId = posting?.voucher?.id;
    const type = posting?.type;
    const amount = posting?.amount;
    if (
      typeof voucherId === "number" &&
      (type === "INCOMING_PAYMENT" || type === "INCOMING_PAYMENT_OPPOSITE" || (typeof amount === "number" && amount < 0))
    ) {
      ids.add(voucherId);
    }
  }

  if (ids.size !== 1) {
    throw new Error(`Expected one payment voucher, got ${ids.size}: ${JSON.stringify([...ids])}`);
  }

  return [...ids][0]!;
}

async function main() {
  const unique = `r${Date.now()}`;

  const vatTypes = await api<{ values: Json[] }>(
    `/ledger/vatType?typeOfVat=OUTGOING&vatDate=${TODAY}&fields=*`,
  );
  const vatType = vatTypes.values?.[0];
  if (!vatType?.id) {
    throw new Error(`No outgoing vat type returned: ${JSON.stringify(vatTypes, null, 2)}`);
  }

  const product = await api<{ value: Json }>("/product", {
    method: "POST",
    body: JSON.stringify({
      name: `Reverse Payment Product ${unique}`,
      number: unique,
      priceExcludingVatCurrency: 1000,
      vatType: { id: vatType.id },
    }),
  });

  const customer = await api<{ value: Json }>("/customer", {
    method: "POST",
    body: JSON.stringify({
      name: `Reverse Payment Customer ${unique}`,
      email: `${unique}@example.com`,
    }),
  });

  const order = await api<{ value: Json }>("/order", {
    method: "POST",
    body: JSON.stringify({
      customer: { id: customer.value.id },
      orderDate: TODAY,
      deliveryDate: TODAY,
      orderLines: [
        {
          product: { id: product.value.id },
          description: `Reverse Payment Service ${unique}`,
          count: 1,
          unitPriceExcludingVatCurrency: 1000,
        },
      ],
    }),
  });

  const invoiced = await api<{ value: Json }>(
    `/order/${order.value.id}/:invoice?invoiceDate=${TODAY}&sendToCustomer=false`,
    { method: "PUT" },
  );

  const paymentTypes = await api<{ values: Json[] }>(
    `/invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)`,
  );
  const paymentTypeId = getPaymentTypeId(paymentTypes.values ?? []);

  const paid = await api<{ value: Json }>(
    `/invoice/${invoiced.value.id}/:payment?paymentDate=${TODAY}&paymentTypeId=${paymentTypeId}&paidAmount=${invoiced.value.amountCurrencyOutstanding ?? invoiced.value.amountOutstanding}`,
    { method: "PUT" },
  );

  const located = await api<{ values: Json[] }>(
    `/invoice?invoiceDateFrom=2026-01-01&invoiceDateTo=2027-01-01&id=${invoiced.value.id}&fields=${encodeURIComponent(
      "*,customer(*),orderLines(*),orders(*),postings(*,voucher(*),account(*),customer(*),closeGroup(*))",
    )}`,
  );
  const invoice = located.values?.[0];
  if (!invoice) {
    throw new Error(`Invoice ${invoiced.value.id} not found in verification read`);
  }

  const paymentVoucherId = getPaymentVoucherId(invoice);

  const reversed = await api<{ value: Json }>(
    `/ledger/voucher/${paymentVoucherId}/:reverse?date=${TODAY}`,
    { method: "PUT" },
  );

  const reopened = await api<{ values: Json[] }>(
    `/invoice?invoiceDateFrom=2026-01-01&invoiceDateTo=2027-01-01&id=${invoiced.value.id}&fields=${encodeURIComponent(
      "*,postings(*,voucher(*))",
    )}`,
  );

  const verified = reopened.values?.[0];
  if (!verified) {
    throw new Error(`Invoice ${invoiced.value.id} missing after reversal`);
  }

  const outstandingAfter = verified.amountCurrencyOutstanding ?? verified.amountOutstanding;
  const expectedOutstanding = invoiced.value.amountCurrencyOutstanding ?? invoiced.value.amountOutstanding;
  if (outstandingAfter !== expectedOutstanding) {
    throw new Error(
      `Outstanding mismatch after reversal. Expected ${expectedOutstanding}, got ${outstandingAfter}\n${JSON.stringify(verified, null, 2)}`,
    );
  }

  console.log(
    JSON.stringify(
      {
        customerId: customer.value.id,
        productId: product.value.id,
        orderId: order.value.id,
        invoiceId: invoiced.value.id,
        invoiceNumber: invoiced.value.invoiceNumber,
        paymentTypeId,
        paymentVoucherId,
        reverseVoucherId: reversed.value.id,
        outstandingAfter,
        paidOutstanding: paid.value.amountCurrencyOutstanding ?? paid.value.amountOutstanding,
      },
      null,
      2,
    ),
  );
}

await main();
