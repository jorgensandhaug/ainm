const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const token =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const targetOrgNumber = "999508724";
const targetExVatAmount = 28500;
const targetText = "system development";
const paymentDate = "2026-03-20";

const auth = Buffer.from(`0:${token}`).toString("base64");

function endpoint(path: string, query?: Record<string, string>) {
  const url = new URL(path, `${baseUrl}/`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

async function txFetch(path: string, init?: RequestInit, query?: Record<string, string>) {
  const response = await fetch(endpoint(path, query), {
    ...init,
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}\n${JSON.stringify(data, null, 2)}`);
  }
  return data;
}

function getNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalize(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function collectTexts(invoice: Record<string, unknown>) {
  const texts = new Set<string>();
  const push = (value: unknown) => {
    const text = normalize(value);
    if (text) texts.add(text);
  };

  const orderLines = Array.isArray(invoice.orderLines) ? invoice.orderLines : [];
  for (const line of orderLines) {
    if (!line || typeof line !== "object") continue;
    const row = line as Record<string, unknown>;
    push(row.description);
    push(row.displayName);
    push(row.productName);
  }

  const orders = Array.isArray(invoice.orders) ? invoice.orders : [];
  for (const order of orders) {
    if (!order || typeof order !== "object") continue;
    const row = order as Record<string, unknown>;
    push(row.comment);
    push(row.invoiceComment);
    const nestedLines = Array.isArray(row.orderLines) ? row.orderLines : [];
    for (const line of nestedLines) {
      if (!line || typeof line !== "object") continue;
      const nested = line as Record<string, unknown>;
      push(nested.description);
      push(nested.displayName);
      push(nested.productName);
    }
  }

  return [...texts];
}

function pickOutstanding(invoice: Record<string, unknown>) {
  return getNumber(invoice.amountCurrencyOutstanding) ?? getNumber(invoice.amountOutstanding);
}

function pickExVat(invoice: Record<string, unknown>) {
  return getNumber(invoice.amountExcludingVatCurrency) ?? getNumber(invoice.amountExcludingVat);
}

function pickPaymentType(types: Array<Record<string, unknown>>) {
  const ranked = types
    .map((paymentType) => {
      const debit =
        paymentType.debitAccount && typeof paymentType.debitAccount === "object"
          ? (paymentType.debitAccount as Record<string, unknown>)
          : null;
      const name = normalize(paymentType.name);
      const number = String(debit?.number ?? "").replace(/\D/g, "");
      let score = 0;
      if (number.startsWith("19")) score += 10;
      if (debit?.isBankAccount === true) score += 5;
      if (debit?.isInvoiceAccount === true) score += 3;
      if (name.includes("bank")) score += 2;
      if (name.includes("betalt")) score += 1;
      return { paymentType, score };
    })
    .sort((a, b) => b.score - a.score);

  if (!ranked.length || ranked[0].score <= 0) {
    throw new Error(`No usable payment type\n${JSON.stringify(types, null, 2)}`);
  }
  return ranked[0].paymentType;
}

async function main() {
  const invoiceResult = await txFetch("invoice", undefined, {
    invoiceDateFrom: "2024-01-01",
    invoiceDateTo: "2027-12-31",
    count: "1000",
    sorting: "-invoiceDate",
    fields: "*,customer(*),currency(*),orderLines(*),orders(*,orderLines(*))",
  });

  const invoices = Array.isArray(invoiceResult?.values) ? invoiceResult.values : [];
  const matches = invoices.filter((invoice: Record<string, unknown>) => {
    const customer =
      invoice.customer && typeof invoice.customer === "object"
        ? (invoice.customer as Record<string, unknown>)
        : {};
    const org = normalize(customer.organizationNumber);
    const exVat = pickExVat(invoice);
    const outstanding = pickOutstanding(invoice);
    return (
      org === targetOrgNumber &&
      exVat === targetExVatAmount &&
      typeof outstanding === "number" &&
      outstanding > 0 &&
      collectTexts(invoice).some((text) => text.includes(targetText))
    );
  });

  if (matches.length !== 1) {
    throw new Error(`Expected 1 invoice match, got ${matches.length}\n${JSON.stringify(matches, null, 2)}`);
  }

  const invoice = matches[0];
  const invoiceId = getNumber(invoice.id);
  const outstanding = pickOutstanding(invoice);
  if (invoiceId === null || outstanding === null) {
    throw new Error(`Missing invoice id/outstanding\n${JSON.stringify(invoice, null, 2)}`);
  }

  const paymentTypeResult = await txFetch("invoice/paymentType", undefined, {
    count: "1000",
    fields: "*,debitAccount(*),creditAccount(*)",
  });
  const paymentTypes = Array.isArray(paymentTypeResult?.values) ? paymentTypeResult.values : [];
  const paymentType = pickPaymentType(paymentTypes);
  const paymentTypeId = getNumber(paymentType.id);
  if (paymentTypeId === null) {
    throw new Error(`Missing paymentType id\n${JSON.stringify(paymentType, null, 2)}`);
  }

  const paymentResult = await txFetch(
    `invoice/${invoiceId}/:payment`,
    { method: "PUT" },
    {
      paymentDate,
      paymentTypeId: String(paymentTypeId),
      paidAmount: String(outstanding),
    },
  );

  const paidInvoice =
    paymentResult && typeof paymentResult === "object" && "value" in paymentResult
      ? (paymentResult as { value: Record<string, unknown> }).value
      : (paymentResult as Record<string, unknown>);
  const remainingOutstanding =
    pickOutstanding(paidInvoice) ?? getNumber((paidInvoice as Record<string, unknown>).remainingOutstanding);

  console.log(
    JSON.stringify(
      {
        invoiceId,
        paymentTypeId,
        paidAmount: outstanding,
        remainingOutstanding,
      },
      null,
      2,
    ),
  );

  if (remainingOutstanding !== 0) {
    throw new Error(`Payment failed\n${JSON.stringify(paidInvoice, null, 2)}`);
  }
}

await main();
