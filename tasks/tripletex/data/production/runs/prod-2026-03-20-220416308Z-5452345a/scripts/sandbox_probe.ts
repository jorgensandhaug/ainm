const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2/";
const SESSION_TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

function authHeader() {
  return `Basic ${Buffer.from(`0:${SESSION_TOKEN}`).toString("base64")}`;
}

async function api(path: string, query: Record<string, string | string[]> = {}) {
  const url = new URL(path, BASE_URL);
  for (const [key, value] of Object.entries(query)) {
    if (Array.isArray(value)) {
      for (const item of value) url.searchParams.append(key, item);
    } else {
      url.searchParams.set(key, value);
    }
  }
  const response = await fetch(url, {
    headers: {
      Authorization: authHeader(),
      Accept: "application/json",
    },
  });
  const text = await response.text();
  return {
    status: response.status,
    body: text ? JSON.parse(text) : null,
  };
}

const [customer, products, vatTypes] = await Promise.all([
  api("customer", { organizationNumber: "861379760", fields: "*" }),
  api("product", {
    productNumber: ["2109", "1175", "9974"],
    fields: "*",
  }),
  api("ledger/vatType", {
    typeOfVat: "OUTGOING",
    vatDate: "2026-03-20",
    fields: "*",
  }),
]);

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
