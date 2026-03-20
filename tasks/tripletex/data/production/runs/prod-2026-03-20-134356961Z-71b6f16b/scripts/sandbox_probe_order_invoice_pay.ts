const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const SESSION_TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const authHeader = `Basic ${Buffer.from(`0:${SESSION_TOKEN}`).toString("base64")}`;

type TripletexList<T> = { values?: T[]; fullResultSize?: number };

type Customer = { id: number; customerName?: string; organizationNumber?: string };
type Product = { id: number; name?: string; productNumber?: string | number; number?: string | number };

async function api<T>(path: string, query: Record<string, string | number | boolean | Array<string | number>>): Promise<T> {
  const url = new URL(path, `${BASE_URL}/`);
  for (const [key, raw] of Object.entries(query)) {
    if (Array.isArray(raw)) {
      for (const value of raw) url.searchParams.append(key, String(value));
    } else {
      url.searchParams.set(key, String(raw));
    }
  }

  const response = await fetch(url, {
    headers: {
      Authorization: authHeader,
      Accept: "application/json",
    },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${response.status} ${url.pathname}${url.search}: ${text}`);
  return JSON.parse(text) as T;
}

const customer = await api<TripletexList<Customer>>("customer", {
  organizationNumber: "911511053",
  fields: "*",
});

const products = await api<TripletexList<Product>>("product", {
  productNumber: ["7579", "2292"],
  fields: "*",
});

console.log(JSON.stringify({ customer, products }, null, 2));
