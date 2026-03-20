const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const SESSION_TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH_HEADER = `Basic ${Buffer.from(`0:${SESSION_TOKEN}`).toString("base64")}`;

async function request(path: string, query?: URLSearchParams | Record<string, string | number | boolean>) {
  const url = new URL(`${BASE_URL}${path}`);
  if (query instanceof URLSearchParams) {
    url.search = query.toString();
  } else if (query) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      params.append(key, String(value));
    }
    url.search = params.toString();
  }

  const response = await fetch(url, {
    headers: {
      Authorization: AUTH_HEADER,
      Accept: "application/json",
    },
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    console.error(JSON.stringify({ path: `${url.pathname}${url.search}`, status: response.status, data }, null, 2));
    process.exit(1);
  }
  return data;
}

const productQuery = new URLSearchParams();
for (const ref of ["6744", "2584", "3739"]) {
  productQuery.append("productNumber", ref);
}
productQuery.append("fields", "*");

const customer = await request("/customer", {
  organizationNumber: "827304212",
  fields: "*",
});

const products = await request("/product", productQuery);

const vatTypes = await request("/ledger/vatType", {
  typeOfVat: "OUTGOING",
  vatDate: "2026-03-20",
  fields: "*",
});

console.log(
  JSON.stringify(
    {
      customer,
      products,
      vatTypes,
    },
    null,
    2,
  ),
);
