const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const sessionToken =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

function basicAuth(user: string, pass: string): string {
  return Buffer.from(`${user}:${pass}`).toString("base64");
}

async function api(path: string, init?: RequestInit) {
  const url = new URL(baseUrl.endsWith("/") ? `${baseUrl}${path}` : `${baseUrl}/${path}`);
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Basic ${basicAuth("0", sessionToken)}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const raw = await response.text();
  const data = raw ? JSON.parse(raw) : null;
  if (!response.ok) {
    throw new Error(`Tripletex error ${response.status} on ${path}: ${raw}`);
  }
  return data;
}

const vat = await api("ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*");
const productNumber = `1327-sbx-${Date.now()}`;
const created = await api("product", {
  method: "POST",
  body: JSON.stringify({
    name: "Maintenance sandbox proof",
    number: productNumber,
    priceExcludingVatCurrency: 3700,
  }),
});

console.log(
  JSON.stringify(
    {
      vatValues: vat?.values ?? [],
      created: created?.value ?? null,
    },
    null,
    2,
  ),
);
