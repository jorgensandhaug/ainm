const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const token =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const targetOrgNumber = "999536075";
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
  return { status: response.status, ok: response.ok, data };
}

function normalize(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function getNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function pickOutstanding(invoice: Record<string, unknown>) {
  return getNumber(invoice.amountCurrencyOutstanding) ?? getNumber(invoice.amountOutstanding);
}

function pickExVat(invoice: Record<string, unknown>) {
  return getNumber(invoice.amountExcludingVatCurrency) ?? getNumber(invoice.amountExcludingVat);
}

function texts(invoice: Record<string, unknown>) {
  const out = new Set<string>();
  const push = (value: unknown) => {
    const text = normalize(value);
    if (text) out.add(text);
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
  return [...out];
}

async function main() {
  const invoiceResult = await txFetch("invoice", undefined, {
    invoiceDateFrom: "2024-01-01",
    invoiceDateTo: "2027-12-31",
    count: "1000",
    sorting: "-invoiceDate",
    fields: "*,customer(*),orderLines(*),orders(*,orderLines(*))",
  });
  if (!invoiceResult.ok) {
    throw new Error(JSON.stringify(invoiceResult, null, 2));
  }

  const invoices = Array.isArray(invoiceResult.data?.values) ? invoiceResult.data.values : [];
  const matches = invoices.filter((invoice: Record<string, unknown>) => {
    const customer =
      invoice.customer && typeof invoice.customer === "object"
        ? (invoice.customer as Record<string, unknown>)
        : {};
    return (
      normalize(customer.organizationNumber) === targetOrgNumber &&
      pickExVat(invoice) === targetExVatAmount &&
      (pickOutstanding(invoice) ?? 0) > 0 &&
      texts(invoice).some((text) => text.includes(targetText))
    );
  });

  if (matches.length !== 1) {
    throw new Error(`Expected one match, got ${matches.length}\n${JSON.stringify(matches, null, 2)}`);
  }

  const invoice = matches[0];
  const invoiceId = getNumber(invoice.id);
  const outstanding = pickOutstanding(invoice);
  if (invoiceId === null || outstanding === null) {
    throw new Error(`Missing invoice id or outstanding\n${JSON.stringify(invoice, null, 2)}`);
  }

  const paymentResult = await txFetch(
    `invoice/${invoiceId}/:payment`,
    { method: "PUT" },
    {
      paymentDate,
      paidAmount: String(outstanding),
    },
  );

  console.log(
    JSON.stringify(
      {
        invoiceId,
        outstanding,
        paymentResult,
      },
      null,
      2,
    ),
  );
}

await main();
