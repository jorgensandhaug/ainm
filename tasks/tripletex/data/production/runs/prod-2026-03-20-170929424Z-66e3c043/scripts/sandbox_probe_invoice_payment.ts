const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const token =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const auth = Buffer.from(`0:${token}`).toString("base64");

function endpoint(path: string, query?: Record<string, string>) {
  const url = new URL(path, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

async function txFetch(path: string, query?: Record<string, string>) {
  const response = await fetch(endpoint(path, query), {
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
    },
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}\n${JSON.stringify(data, null, 2)}`);
  }
  return data;
}

function normalize(value: unknown) {
  return String(value ?? "").trim();
}

function getNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function collectDescriptions(invoice: Record<string, unknown>) {
  const descriptions: string[] = [];
  const push = (value: unknown) => {
    const text = normalize(value);
    if (text) descriptions.push(text);
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

  return [...new Set(descriptions)];
}

async function main() {
  const result = await txFetch("invoice", {
    invoiceDateFrom: "2024-01-01",
    invoiceDateTo: "2027-12-31",
    count: "1000",
    sorting: "-invoiceDate",
    fields: "*,customer(*),currency(*),orderLines(*),orders(*,orderLines(*))",
  });

  const values = Array.isArray(result?.values) ? result.values : [];
  const unpaid = values
    .map((invoice: Record<string, unknown>) => {
      const customer =
        invoice.customer && typeof invoice.customer === "object"
          ? (invoice.customer as Record<string, unknown>)
          : {};
      const outstanding =
        getNumber(invoice.amountCurrencyOutstanding) ?? getNumber(invoice.amountOutstanding);
      const exVat =
        getNumber(invoice.amountExcludingVatCurrency) ?? getNumber(invoice.amountExcludingVat);
      return {
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        invoiceDate: invoice.invoiceDate,
        orgNumber: customer.organizationNumber ?? null,
        customerName: customer.name ?? null,
        exVat,
        outstanding,
        descriptions: collectDescriptions(invoice),
      };
    })
    .filter((invoice) => typeof invoice.id === "number" && typeof invoice.orgNumber === "string" && invoice.outstanding && invoice.outstanding > 0 && invoice.descriptions.length > 0)
    .slice(0, 20);

  console.log(JSON.stringify(unpaid, null, 2));
}

await main();
