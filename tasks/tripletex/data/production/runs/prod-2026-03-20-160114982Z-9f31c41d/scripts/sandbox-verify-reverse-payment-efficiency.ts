const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const TODAY = "2026-03-20";
const WIDE_FROM = "2000-01-01";
const WIDE_TO = "2026-03-21";
const CUSTOMER_ORG = "864062245";
const PRODUCT_NUMBER = "6749";
const UNIT_PRICE_EX_VAT = 1000;
const UNIQUE_TAG = `reverse-efficiency-${Date.now()}`;
const DESCRIPTION = `Maintenance ${UNIQUE_TAG}`;

const auth = `Basic ${Buffer.from(`0:${TOKEN}`).toString("base64")}`;

type JsonRecord = Record<string, any>;

let callCount = 0;

function n(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function s(value: unknown): string {
  return String(value ?? "");
}

function norm(value: unknown): string {
  return s(value).trim().toLowerCase();
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  callCount += 1;
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: auth,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new Error(
      `HTTP ${res.status} ${res.statusText} on ${path}\n${JSON.stringify(data, null, 2)}`
    );
  }
  return data as T;
}

function choosePaymentType(values: JsonRecord[]): JsonRecord {
  const bankLike = values.filter((value) => {
    const debit = s(value?.debitAccount?.number);
    return debit.startsWith("19");
  });
  const exact = bankLike.find((value) => norm(value?.name).includes("betalt til bank"));
  return exact ?? bankLike[0] ?? values[0]!;
}

function collectTexts(invoice: JsonRecord): string[] {
  const texts: string[] = [];
  const push = (value: unknown) => {
    const v = norm(value);
    if (v) texts.push(v);
  };

  push(invoice.description);
  push(invoice.invoiceComment);
  for (const line of invoice.orderLines ?? []) {
    push(line?.description);
    push(line?.displayName);
  }
  for (const order of invoice.orders ?? []) {
    push(order?.invoiceComment);
    for (const line of order?.orderLines ?? []) {
      push(line?.description);
      push(line?.displayName);
    }
  }
  return texts;
}

function choosePaymentVoucherId(invoice: JsonRecord): number {
  const preferred = new Set<number>();
  for (const posting of invoice.postings ?? []) {
    const voucherId = n(posting?.voucher?.id);
    const type = s(posting?.type);
    if (!voucherId) continue;
    if (type === "INCOMING_PAYMENT" || type === "INCOMING_PAYMENT_OPPOSITE") {
      preferred.add(voucherId);
    }
  }
  if (preferred.size === 1) return [...preferred][0]!;

  const fallback = new Set<number>();
  for (const posting of invoice.postings ?? []) {
    const voucherId = n(posting?.voucher?.id);
    const amount = n(posting?.amountCurrency) ?? n(posting?.amount);
    const accountNumber = s(posting?.account?.number);
    const text = norm([posting?.description, posting?.text].filter(Boolean).join(" "));
    if (!voucherId || amount === null) continue;
    if (amount < 0 && accountNumber === "1500" && text.includes("betaling")) {
      fallback.add(voucherId);
    }
  }
  if (fallback.size === 1) return [...fallback][0]!;

  throw new Error(
    `Could not isolate payment voucher\n${JSON.stringify(
      (invoice.postings ?? []).map((posting: JsonRecord) => ({
        id: posting.id,
        type: posting.type,
        amount: posting.amount,
        amountCurrency: posting.amountCurrency,
        description: posting.description,
        accountNumber: posting.account?.number,
        voucherId: posting.voucher?.id,
      })),
      null,
      2
    )}`
  );
}

async function main() {
  const customerRes = await api<{ values?: JsonRecord[] }>(
    `/customer?organizationNumber=${encodeURIComponent(CUSTOMER_ORG)}&count=10&fields=*`
  );
  const customer = (customerRes.values ?? []).find(
    (value) => s(value.organizationNumber) === CUSTOMER_ORG
  );
  if (!customer?.id) throw new Error("Customer not found");

  const productRes = await api<{ values?: JsonRecord[] }>(
    `/product?productNumber=${encodeURIComponent(PRODUCT_NUMBER)}&count=10&fields=*`
  );
  const product = (productRes.values ?? []).find(
    (value) => s(value.productNumber) === PRODUCT_NUMBER || s(value.number) === PRODUCT_NUMBER
  );
  if (!product?.id) throw new Error("Product not found");

  const orderRes = await api<{ value?: JsonRecord }>("/order", {
    method: "POST",
    body: JSON.stringify({
      customer: { id: customer.id },
      orderDate: TODAY,
      deliveryDate: TODAY,
      orderLines: [
        {
          product: { id: product.id },
          description: DESCRIPTION,
          count: 1,
          unitPriceExcludingVatCurrency: UNIT_PRICE_EX_VAT,
        },
      ],
    }),
  });
  const orderId = n(orderRes.value?.id);
  if (!orderId) throw new Error("Order create missing id");

  const invoiceRes = await api<{ value?: JsonRecord }>(
    `/order/${orderId}/:invoice?invoiceDate=${encodeURIComponent(TODAY)}&sendToCustomer=false`,
    { method: "PUT" }
  );
  const invoiceId = n(invoiceRes.value?.id);
  const invoiceOutstanding =
    n(invoiceRes.value?.amountCurrencyOutstanding) ?? n(invoiceRes.value?.amountOutstanding);
  if (!invoiceId || invoiceOutstanding === null) {
    throw new Error("Invoice write missing id or outstanding amount");
  }

  const paymentTypesRes = await api<{ values?: JsonRecord[] }>(
    "/invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)"
  );
  const paymentType = choosePaymentType(paymentTypesRes.values ?? []);
  if (!paymentType?.id) throw new Error("Payment type not found");

  const paymentRes = await api<{ value?: JsonRecord }>(
    `/invoice/${invoiceId}/:payment?paymentDate=${encodeURIComponent(TODAY)}&paymentTypeId=${paymentType.id}&paidAmount=${invoiceOutstanding}`,
    { method: "PUT" }
  );
  const afterPaymentOutstanding =
    n(paymentRes.value?.amountCurrencyOutstanding) ?? n(paymentRes.value?.amountOutstanding);
  if (afterPaymentOutstanding !== 0) {
    throw new Error(`Invoice not fully paid: ${afterPaymentOutstanding}`);
  }

  const locateRes = await api<{ values?: JsonRecord[] }>(
    `/invoice?invoiceDateFrom=${encodeURIComponent(WIDE_FROM)}&invoiceDateTo=${encodeURIComponent(
      WIDE_TO
    )}&count=1000&sorting=-invoiceDate&fields=${encodeURIComponent(
      "*,customer(*),orderLines(*),orders(*,orderLines(*)),postings(*,voucher(*),account(*),customer(*),closeGroup(*))"
    )}`
  );
  const matches = (locateRes.values ?? []).filter((invoice) => {
    const org = s(invoice.customer?.organizationNumber) === CUSTOMER_ORG;
    const exVat =
      (n(invoice.amountExcludingVatCurrency) ?? n(invoice.amountExcludingVat)) === UNIT_PRICE_EX_VAT;
    const outstanding =
      (n(invoice.amountCurrencyOutstanding) ?? n(invoice.amountOutstanding)) === 0;
    const text = collectTexts(invoice).some((value) => value.includes(norm(DESCRIPTION)));
    return org && exVat && outstanding && text;
  });
  if (matches.length !== 1) {
    throw new Error(`Expected one located invoice, got ${matches.length}`);
  }

  const locatedInvoice = matches[0]!;
  const paymentVoucherId = choosePaymentVoucherId(locatedInvoice);
  const expectedReopenedOutstanding =
    n(locatedInvoice.amountCurrency) ?? n(locatedInvoice.amount);
  if (expectedReopenedOutstanding === null) {
    throw new Error("Missing expected reopened outstanding");
  }

  const reverseRes = await api<{ value?: JsonRecord }>(
    `/ledger/voucher/${paymentVoucherId}/:reverse?date=${encodeURIComponent(TODAY)}`,
    { method: "PUT" }
  );

  const verifyRes = await api<{ values?: JsonRecord[] }>(
    `/invoice?id=${invoiceId}&invoiceDateFrom=${encodeURIComponent(
      WIDE_FROM
    )}&invoiceDateTo=${encodeURIComponent(WIDE_TO)}&fields=${encodeURIComponent("*,postings(*,voucher(*),account(*))")}`
  );
  const verified = (verifyRes.values ?? [])[0];
  const reopenedOutstanding =
    n(verified?.amountCurrencyOutstanding) ?? n(verified?.amountOutstanding);

  console.log(
    JSON.stringify(
      {
        setupCallCount: 5,
        reverseFlowCallCountWithVerification: 3,
        reverseFlowCallCountScoreOptimized: 2,
        created: {
          customerId: customer.id,
          productId: product.id,
          orderId,
          invoiceId,
          invoiceNumber: invoiceRes.value?.invoiceNumber ?? null,
          description: DESCRIPTION,
          paymentTypeId: paymentType.id,
        },
        locatedInvoice: {
          invoiceId: locatedInvoice.id,
          invoiceNumber: locatedInvoice.invoiceNumber,
          amountExcludingVatCurrency: locatedInvoice.amountExcludingVatCurrency,
          amountCurrency: locatedInvoice.amountCurrency,
          amountCurrencyOutstanding: locatedInvoice.amountCurrencyOutstanding,
        },
        paymentPostingSummary: (locatedInvoice.postings ?? []).map((posting: JsonRecord) => ({
          postingId: posting.id,
          type: posting.type ?? null,
          amountCurrency: posting.amountCurrency ?? null,
          description: posting.description ?? null,
          accountNumber: posting.account?.number ?? null,
          voucherId: posting.voucher?.id ?? null,
        })),
        extractedPaymentVoucherId: paymentVoucherId,
        reverseVoucherId: reverseRes.value?.id ?? null,
        reopenedOutstanding,
        expectedReopenedOutstanding,
      },
      null,
      2
    )
  );
}

await main();
