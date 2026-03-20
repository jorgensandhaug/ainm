const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const authHeader = `Basic ${Buffer.from(`0:${TOKEN}`).toString("base64")}`;

async function api(path: string, query: Array<[string, string]> = []) {
  const url = new URL(`${BASE_URL}${path}`);
  for (const [key, value] of query) url.searchParams.append(key, value);
  const response = await fetch(url, {
    headers: {
      Authorization: authHeader,
      Accept: "application/json",
    },
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    console.error(JSON.stringify({ path: url.pathname + url.search, status: response.status, body }, null, 2));
    process.exit(1);
  }
  return body;
}

const customer = await api("/customer", [
  ["organizationNumber", "909579791"],
  ["fields", "*"],
]);

const products = await api("/product", [
  ["productNumber", "6481"],
  ["productNumber", "2618"],
  ["productNumber", "8754"],
  ["fields", "*"],
]);

const outgoingVat = await api("/ledger/vatType", [
  ["typeOfVat", "OUTGOING"],
  ["vatDate", "2026-03-20"],
  ["fields", "*"],
]);

const allVat = await api("/ledger/vatType", [["fields", "*"]]);

console.log(
  JSON.stringify(
    {
      customer,
      products: {
        fullResultSize: products?.fullResultSize ?? null,
        values: (products?.values ?? []).map((product: any) => ({
          id: product?.id ?? null,
          number: product?.number ?? null,
          name: product?.name ?? null,
          priceExcludingVatCurrency: product?.priceExcludingVatCurrency ?? null,
          vatType: product?.vatType
            ? {
                id: product.vatType.id ?? null,
                number: product.vatType.number ?? null,
                percentage: product.vatType.percentage ?? null,
                name: product.vatType.name ?? null,
              }
            : null,
        })),
      },
      outgoingVat: (outgoingVat?.values ?? []).map((vatType: any) => ({
        id: vatType?.id ?? null,
        number: vatType?.number ?? null,
        percentage: vatType?.percentage ?? null,
        name: vatType?.name ?? null,
      })),
      allVat: (allVat?.values ?? []).map((vatType: any) => ({
        id: vatType?.id ?? null,
        number: vatType?.number ?? null,
        percentage: vatType?.percentage ?? null,
        name: vatType?.name ?? null,
      })),
    },
    null,
    2,
  ),
);
