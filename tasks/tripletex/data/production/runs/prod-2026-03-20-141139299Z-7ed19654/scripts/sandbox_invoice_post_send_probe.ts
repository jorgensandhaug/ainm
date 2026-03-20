const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const CUSTOMER_ID = 108245853;
const INVOICE_DATE = "2026-03-20";
const INVOICE_DUE_DATE = "2026-04-03";

async function api(method: string, path: string, opts: { query?: Record<string, string>; body?: unknown } = {}) {
  const url = new URL(`${BASE_URL}${path}`);
  for (const [key, value] of Object.entries(opts.query ?? {})) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Basic ${Buffer.from(`0:${TOKEN}`).toString("base64")}`,
      Accept: "application/json",
      ...(opts.body ? { "Content-Type": "application/json; charset=utf-8" } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(JSON.stringify({ status: response.status, data }, null, 2));
  }
  return data;
}

async function main() {
  const vatTypes = await api("GET", "/ledger/vatType", {
    query: { typeOfVat: "OUTGOING", vatDate: INVOICE_DATE, fields: "*" },
  });
  const vatType =
    vatTypes.values.find((item: any) => Number(item.percentage) === 25) ??
    vatTypes.values[0];

  const invoice = await api("POST", "/invoice", {
    body: {
      invoiceDate: INVOICE_DATE,
      invoiceDueDate: INVOICE_DUE_DATE,
      customer: { id: CUSTOMER_ID },
      orders: [
        {
          customer: { id: CUSTOMER_ID },
          orderDate: INVOICE_DATE,
          deliveryDate: INVOICE_DATE,
          orderLines: [
            {
              description: `Reflection post-send probe ${Date.now()}`,
              count: 1,
              unitPriceExcludingVatCurrency: 103,
              vatType: { id: vatType.id },
            },
          ],
        },
      ],
    },
  });

  console.log(JSON.stringify(invoice, null, 2));
}

await main();
