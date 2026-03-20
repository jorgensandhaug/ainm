const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const sessionToken =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const today = "2026-03-20";

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
      "Content-Type": "application/json",
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

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asRecord(value: unknown): AnyRecord {
  return value && typeof value === "object" ? (value as AnyRecord) : {};
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.toLowerCase() : "";
}

function num(record: AnyRecord, ...keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number") return value;
  }
  return null;
}

function uniqNumber(prefix: string) {
  return `${prefix}${Date.now().toString().slice(-6)}`;
}

async function main() {
  const uniqueSuffix = Date.now().toString().slice(-6);
  const organizationNumber = `89${uniqueSuffix}1`;
  const customerName = `Sandbox Reverse ${uniqueSuffix} GmbH`;
  const customerEmail = `sandbox-reverse-${uniqueSuffix}@example.com`;
  const productNumber = uniqNumber("RP");
  const serviceText = `Softwarelizenz ${uniqueSuffix}`;
  const exVatAmount = 1234;

  const customer = await api<{ value: AnyRecord }>("customer", {
    method: "POST",
    body: JSON.stringify({
      name: customerName,
      organizationNumber,
      email: customerEmail,
      postalAddress: {
        addressLine1: "Teststrasse 1",
        postalCode: "0150",
        city: "Oslo",
      },
    }),
  });

  const product = await api<{ value: AnyRecord }>("product", {
    method: "POST",
    body: JSON.stringify({
      name: serviceText,
      number: productNumber,
      priceExcludingVatCurrency: exVatAmount,
    }),
  });

  const order = await api<{ value: AnyRecord }>("order", {
    method: "POST",
    body: JSON.stringify({
      customer: { id: customer.value.id },
      orderDate: today,
      deliveryDate: today,
      orderLines: [
        {
          product: { id: product.value.id },
          description: serviceText,
          count: 1,
          unitPriceExcludingVatCurrency: exVatAmount,
        },
      ],
    }),
  });

  const invoice = await api<{ value: AnyRecord }>(
    `order/${order.value.id}/:invoice`,
    { method: "PUT" },
    { invoiceDate: today, sendToCustomer: "false" },
  );

  const paymentTypes = await api<{ values: AnyRecord[] }>("invoice/paymentType", undefined, {
    count: "1000",
    fields: "*,debitAccount(*),creditAccount(*)",
  });

  const paymentType = paymentTypes.values.find((candidate) => {
    const name = normalizeText(candidate.name);
    const debitAccount = asRecord(candidate.debitAccount);
    const debitAccountNumber = `${debitAccount.number ?? ""}`;
    return name.includes("betalt til bank") || debitAccountNumber.startsWith("19");
  });

  if (!paymentType) {
    throw new Error("No usable payment type found");
  }

  const outstandingBeforePayment =
    num(invoice.value, "amountCurrencyOutstanding", "amountOutstanding") ??
    (() => {
      throw new Error("Invoice write response missing outstanding amount");
    })();

  await api(
    `invoice/${invoice.value.id}/:payment`,
    { method: "PUT" },
    {
      paymentDate: today,
      paymentTypeId: String(paymentType.id),
      paidAmount: String(outstandingBeforePayment),
    },
  );

  const locate = await api<{ values: AnyRecord[]; fullResultSize?: number }>("invoice", undefined, {
    invoiceDateFrom: "2000-01-01",
    invoiceDateTo: today,
    count: "1000",
    sorting: "-invoiceDate",
    fields:
      "*,customer(*),orderLines(*,product(*)),orders(*,orderLines(*,product(*))),postings(*,voucher(*),account(*),customer(*),closeGroup(*))",
  });

  const directRead = await api<{ value: AnyRecord }>(`invoice/${invoice.value.id}`, undefined, {
    fields:
      "*,customer(*),orderLines(*,product(*)),orders(*,orderLines(*,product(*))),postings(*,voucher(*),account(*),customer(*),closeGroup(*))",
  });

  const createdInvoiceRead = directRead.value;
  if (!createdInvoiceRead) {
    throw new Error(`Created invoice ${invoice.value.id} not found by direct invoice read`);
  }

  const candidates = [createdInvoiceRead].filter((candidate) => {
    const customerRecord = asRecord(candidate.customer);
    if (customerRecord.organizationNumber !== organizationNumber) return false;
    if (num(candidate, "amountExcludingVatCurrency", "amountExcludingVat") !== exVatAmount) return false;
    if (num(candidate, "amountCurrencyOutstanding", "amountOutstanding") !== 0) return false;

    const topLevelTexts = asArray(candidate.orderLines)
      .map((line) => asRecord(line))
      .flatMap((line) => [line.description, line.displayName, asRecord(line.product).name])
      .filter((value): value is string => typeof value === "string");
    const orderTexts = asArray(candidate.orders)
      .map((orderValue) => asRecord(orderValue))
      .flatMap((orderValue) =>
        asArray(orderValue.orderLines)
          .map((line) => asRecord(line))
          .flatMap((line) => [line.description, line.displayName, asRecord(line.product).name]),
      )
      .filter((value): value is string => typeof value === "string");

    return [...topLevelTexts, ...orderTexts].some((text) => normalizeText(text).includes(normalizeText(serviceText)));
  });

  if (candidates.length !== 1) {
    throw new Error(
      JSON.stringify(
        {
          message: `Expected exactly one candidate, found ${candidates.length}`,
          broadLocateFullResultSize: locate.fullResultSize ?? null,
          broadLocateReturnedCount: locate.values.length,
          createdInvoiceRead,
        },
        null,
        2,
      ),
    );
  }

  const matchedInvoice = candidates[0];
  const postings = asArray(matchedInvoice.postings).map((posting) => asRecord(posting));
  const paymentPosting =
    postings.find((posting) => posting.type === "INCOMING_PAYMENT" || posting.type === "INCOMING_PAYMENT_OPPOSITE") ??
    postings.find((posting) => {
      const account = asRecord(posting.account);
      return (num(posting, "amountCurrency", "amount") ?? 0) < 0 && account.number === 1500;
    });

  if (!paymentPosting) {
    throw new Error("No payment posting found in locate read");
  }

  const paymentVoucherId = asRecord(paymentPosting.voucher).id;
  if (typeof paymentVoucherId !== "number") {
    throw new Error("Payment posting voucher id missing");
  }

  const reverse = await api<{ value: AnyRecord }>(
    `ledger/voucher/${paymentVoucherId}/:reverse`,
    { method: "PUT" },
    { date: today },
  );

  const verify = await api<{ value: AnyRecord }>(`invoice/${matchedInvoice.id}`, undefined, {
    fields: "*,postings(*,voucher(*))",
  });

  const verifiedInvoice = verify.value;

  console.log(
    JSON.stringify(
      {
        fixture: {
          customerId: customer.value.id,
          organizationNumber,
          productId: product.value.id,
          orderId: order.value.id,
          invoiceId: invoice.value.id,
          invoiceNumber: invoice.value.invoiceNumber,
          serviceText,
          exVatAmount,
        },
        locateEvidence: {
          broadLocateFullResultSize: locate.fullResultSize ?? null,
          broadLocateReturnedCount: locate.values.length,
          broadLocateContainsCreatedInvoice: locate.values.some((candidate) => candidate.id === invoice.value.id),
          invoiceId: matchedInvoice.id,
          amountExcludingVatCurrency: matchedInvoice.amountExcludingVatCurrency,
          amountCurrencyOutstanding: matchedInvoice.amountCurrencyOutstanding,
          topLevelOrderLines: matchedInvoice.orderLines,
          nestedOrders: matchedInvoice.orders,
          paymentPosting: {
            type: paymentPosting.type ?? null,
            amountCurrency: paymentPosting.amountCurrency ?? null,
            description: paymentPosting.description ?? null,
            accountNumber: asRecord(paymentPosting.account).number ?? null,
            voucherId: paymentVoucherId,
          },
        },
        reverseEvidence: {
          reverseVoucherId: reverse.value.id ?? null,
          reopenedOutstanding:
            verifiedInvoice?.amountCurrencyOutstanding ?? verifiedInvoice?.amountOutstanding ?? null,
        },
      },
      null,
      2,
    ),
  );
}

await main();
