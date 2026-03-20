const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const TODAY = "2026-03-20";

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

function generateValidOrgNumber(seed: number): string {
  const digits = String(seed)
    .replace(/\D/g, "")
    .padStart(8, "0")
    .slice(-8)
    .split("")
    .map(Number);

  const weights = [3, 2, 7, 6, 5, 4, 3, 2];
  const sum = digits.reduce((acc, digit, index) => acc + digit * weights[index], 0);
  const remainder = sum % 11;
  const control = remainder === 0 ? 0 : 11 - remainder;

  if (control === 10) {
    return generateValidOrgNumber(seed + 1);
  }

  return `${digits.join("")}${control}`;
}

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function extractPaymentTypeId(paymentTypes: AnyRecord[]): number {
  const match = paymentTypes.find((paymentType) => {
    const debitNumber = String(paymentType.debitAccount?.number ?? "");
    return debitNumber.startsWith("19");
  });

  if (!match?.id) {
    throw new Error("No usable incoming customer payment type with a 19xx debit account");
  }

  return Number(match.id);
}

function extractPaymentVoucherId(invoice: AnyRecord): number {
  const postings = Array.isArray(invoice.postings) ? invoice.postings : [];

  const voucherIds = [
    ...new Set(
      postings
        .filter((posting: AnyRecord) =>
          ["INCOMING_PAYMENT", "INCOMING_PAYMENT_OPPOSITE"].includes(posting.type),
        )
        .map((posting: AnyRecord) => posting.voucher?.id)
        .filter((id: unknown): id is number => typeof id === "number"),
    ),
  ];

  if (voucherIds.length === 1) {
    return voucherIds[0];
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

  const postingSummary = postings.map((posting: AnyRecord) => ({
    id: posting.id,
    type: posting.type,
    amount: posting.amount,
    amountCurrency: posting.amountCurrency,
    amountGross: posting.amountGross,
    voucherId: posting.voucher?.id ?? null,
    accountNumber: posting.account?.number ?? null,
  }));

  throw new Error(
    `Expected exactly one payment voucher id, got preferred=${JSON.stringify(voucherIds)} fallback=${JSON.stringify(fallbackVoucherIds)} postings=${JSON.stringify(postingSummary)}`,
  );
}

async function main() {
  const unique = Date.now();
  const organizationNumber = generateValidOrgNumber(unique);
  const description = `Reflection reverse payment ${unique}`;
  const customerName = `Reflection Customer ${unique}`;
  const productName = `Reflection Product ${unique}`;

  const vatTypes = await api<{ values: AnyRecord[] }>(
    `/ledger/vatType?typeOfVat=OUTGOING&vatDate=${TODAY}&fields=*`,
  );
  const vatType = vatTypes.values[0];

  if (!vatType?.id) {
    throw new Error("No outgoing VAT type available");
  }

  const customer = await api<{ value: AnyRecord }>("/customer", {
    method: "POST",
    body: JSON.stringify({
      name: customerName,
      email: `reflection-${unique}@example.com`,
      organizationNumber,
    }),
  });

  const product = await api<{ value: AnyRecord }>("/product", {
    method: "POST",
    body: JSON.stringify({
      name: productName,
      number: String(unique).slice(-6),
      priceExcludingVatCurrency: 1000,
      vatType: { id: vatType.id },
    }),
  });

  const order = await api<{ value: AnyRecord }>("/order", {
    method: "POST",
    body: JSON.stringify({
      customer: { id: customer.value.id },
      orderDate: TODAY,
      deliveryDate: TODAY,
      orderLines: [
        {
          product: { id: product.value.id },
          description,
          count: 1,
          unitPriceExcludingVatCurrency: 1000,
        },
      ],
    }),
  });

  const invoice = await api<{ value: AnyRecord }>(
    `/order/${order.value.id}/:invoice?invoiceDate=${TODAY}&sendToCustomer=false`,
    { method: "PUT" },
  );

  const paymentTypes = await api<{ values: AnyRecord[] }>(
    "/invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)",
  );
  const paymentTypeId = extractPaymentTypeId(paymentTypes.values);

  const payment = await api<{ value: AnyRecord }>(
    `/invoice/${invoice.value.id}/:payment?paymentDate=${TODAY}&paymentTypeId=${paymentTypeId}&paidAmount=${invoice.value.amountCurrencyOutstanding}`,
    { method: "PUT" },
  );

  const locateParams = new URLSearchParams({
    invoiceDateFrom: "2000-01-01",
    invoiceDateTo: "2026-03-21",
    count: "1000",
    sorting: "-invoiceDate",
    fields:
      "*,customer(*),orderLines(*),orders(*,orderLines(*)),postings(*,voucher(*),account(*),customer(*),closeGroup(*))",
  });
  const locate = await api<{ values: AnyRecord[] }>(`/invoice?${locateParams.toString()}`);
  const matchedInvoices = locate.values.filter((candidate) => {
    if (candidate.customer?.organizationNumber !== organizationNumber) {
      return false;
    }

    if (Number(candidate.amountExcludingVatCurrency ?? candidate.amountExcludingVat) !== 1000) {
      return false;
    }

    if (Number(candidate.amountCurrencyOutstanding ?? candidate.amountOutstanding) !== 0) {
      return false;
    }

    const descriptions = [
      ...(Array.isArray(candidate.orderLines) ? candidate.orderLines : []),
      ...((Array.isArray(candidate.orders) ? candidate.orders : []).flatMap((orderRow: AnyRecord) =>
        Array.isArray(orderRow.orderLines) ? orderRow.orderLines : [],
      )),
    ].flatMap((line: AnyRecord) => [line.description, line.displayName]);

    return descriptions.some((value) => normalizeText(value) === normalizeText(description));
  });

  if (matchedInvoices.length !== 1) {
    throw new Error(`Expected one matched paid invoice, got ${matchedInvoices.length}`);
  }

  const locatedInvoice = matchedInvoices[0];
  const paymentVoucherId = extractPaymentVoucherId(locatedInvoice);
  const expectedReopenedOutstanding = Number(locatedInvoice.amountCurrency ?? locatedInvoice.amount);

  const reverse = await api<{ value: AnyRecord }>(
    `/ledger/voucher/${paymentVoucherId}/:reverse?date=${TODAY}`,
    { method: "PUT" },
  );

  const verifyParams = new URLSearchParams({
    invoiceDateFrom: "2000-01-01",
    invoiceDateTo: "2026-03-21",
    id: String(locatedInvoice.id),
    fields: "*,postings(*,voucher(*))",
  });
  const verify = await api<{ values: AnyRecord[] }>(`/invoice?${verifyParams.toString()}`);
  const verifiedInvoice = verify.values[0];
  const reopenedOutstanding = Number(
    verifiedInvoice.amountCurrencyOutstanding ?? verifiedInvoice.amountOutstanding,
  );

  if (reopenedOutstanding !== expectedReopenedOutstanding) {
    throw new Error(
      `Outstanding mismatch after reversal. expected=${expectedReopenedOutstanding} actual=${reopenedOutstanding}`,
    );
  }

  console.log(
    JSON.stringify(
      {
        vatTypeDisplayName: vatType.displayName,
        createdCustomerId: customer.value.id,
        createdProductId: product.value.id,
        orderId: order.value.id,
        invoiceId: invoice.value.id,
        exVatLookupAmount: 1000,
        grossInvoiceAmountBeforePayment: Number(invoice.value.amountCurrency ?? invoice.value.amount),
        outstandingAfterPaymentWrite: Number(
          payment.value.amountCurrencyOutstanding ?? payment.value.amountOutstanding,
        ),
        paymentVoucherId,
        reverseVoucherId: reverse.value.id,
        reopenedOutstanding,
      },
      null,
      2,
    ),
  );
}

await main();
