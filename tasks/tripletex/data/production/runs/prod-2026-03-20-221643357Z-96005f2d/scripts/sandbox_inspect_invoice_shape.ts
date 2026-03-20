const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const SESSION_TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

async function api(path: string, query: Record<string, string> = {}) {
  const base = BASE_URL.endsWith("/") ? BASE_URL : `${BASE_URL}/`;
  const url = new URL(path, base);
  const params = new URLSearchParams(query);
  if ([...params.keys()].length > 0) {
    url.search = params.toString();
  }

  const response = await fetch(url, {
    headers: {
      Authorization: `Basic ${btoa(`0:${SESSION_TOKEN}`)}`,
      Accept: "application/json",
    },
  });
  const text = await response.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {}
  return { status: response.status, body };
}

const vat = await api("ledger/vatType", {
  typeOfVat: "OUTGOING",
  vatDate: "2026-03-20",
  fields: "*",
});

const accounts = await api("ledger/account", {
  isBankAccount: "true",
  fields: "*",
});

console.log(JSON.stringify({ vat, accounts }, null, 2));
