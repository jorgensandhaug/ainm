const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const sessionToken =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const auth = Buffer.from(`0:${sessionToken}`).toString("base64");

function apiUrl(path: string, search?: Record<string, string>) {
  const url = new URL(path, `${baseUrl}/`);
  if (search) {
    for (const [key, value] of Object.entries(search)) url.searchParams.set(key, value);
  }
  return url;
}

async function api<T>(path: string, init?: RequestInit, search?: Record<string, string>): Promise<T> {
  const response = await fetch(apiUrl(path, search), {
    ...init,
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    console.error(`HTTP ${response.status}`);
    console.error(JSON.stringify(data, null, 2));
    process.exit(1);
  }

  return data as T;
}

type VatType = { id: number; number?: string; percentage?: number; description?: string };
type VatList = { values: VatType[] };
type ProductValue = {
  id: number;
  name: string;
  number: string;
  priceExcludingVatCurrency: number;
  priceIncludingVatCurrency: number;
  vatType?: { id: number };
};
type ProductResponse = { value: ProductValue };

const vatList = await api<VatList>("ledger/vatType", undefined, {
  typeOfVat: "OUTGOING",
  vatDate: "2026-03-20",
  fields: "*",
});

const uniqueNumber = `96${Date.now().toString().slice(-6)}`;

const product = await api<ProductResponse>(
  "product",
  {
    method: "POST",
    body: JSON.stringify({
      name: "Sessão de formação sandbox proof",
      number: uniqueNumber,
      priceExcludingVatCurrency: 37050,
    }),
  },
);

console.log(
  JSON.stringify(
    {
      outgoingVatRows: vatList.values.map((row) => ({
        id: row.id,
        number: row.number,
        percentage: row.percentage,
        description: row.description,
      })),
      createdProduct: product.value,
    },
    null,
    2,
  ),
);
