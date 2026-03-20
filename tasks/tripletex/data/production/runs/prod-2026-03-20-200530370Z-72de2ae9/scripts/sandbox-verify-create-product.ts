const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const sessionToken =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const testProduct = {
  name: "Reflection Sandbox Softwarelizenz 72de2ae9",
  number: `72de2ae9-${Date.now()}`,
  priceExcludingVatCurrency: 24900,
};

function buildUrl(path: string): string {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(path, normalizedBase).toString();
}

async function request(path: string, init?: RequestInit) {
  const auth = Buffer.from(`0:${sessionToken}`).toString("base64");
  const response = await fetch(buildUrl(path), {
    ...init,
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(
      `Tripletex error ${response.status} on ${path}: ${text || response.statusText}`,
    );
  }
  return body;
}

async function main() {
  const vatRead = await request(
    "ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*",
  );
  const vatRows = Array.isArray(vatRead?.values) ? vatRead.values : [];

  const createBody = await request("product", {
    method: "POST",
    body: JSON.stringify(testProduct),
  });
  const created = createBody?.value;
  if (!created) {
    throw new Error(`Missing product response.value: ${JSON.stringify(createBody)}`);
  }

  console.log(
    JSON.stringify(
      {
        outgoingVatTypes: vatRows.map((row: any) => ({
          id: row.id,
          number: row.number,
          name: row.name,
          percentage: row.percentage,
        })),
        createdProduct: {
          id: created.id,
          name: created.name,
          number: created.number,
          priceExcludingVatCurrency: created.priceExcludingVatCurrency,
          priceIncludingVatCurrency: created.priceIncludingVatCurrency,
          vatType: created.vatType,
        },
      },
      null,
      2,
    ),
  );
}

await main();
