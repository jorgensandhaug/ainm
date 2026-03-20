import { Buffer } from "node:buffer";

const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const authHeader = `Basic ${Buffer.from(`0:${TOKEN}`).toString("base64")}`;

async function api(path: string) {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: {
      Authorization: authHeader,
      Accept: "application/json",
    },
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`${response.status} ${path} ${text}`);
  }
  return body;
}

async function main() {
  const dates = [
    "2026-03-20",
    "2026-03-19",
    "2025-03-20",
    "2024-03-20",
    "2023-03-20",
    "2022-03-20",
  ];

  const vatByDate: Record<string, any[]> = {};
  for (const date of dates) {
    const params = new URLSearchParams({
      typeOfVat: "OUTGOING",
      vatDate: date,
      fields: "*",
    });
    const payload = await api(`/ledger/vatType?${params.toString()}`);
    vatByDate[date] = payload.values ?? [];
  }

  const customer = await api(
    `/customer?${new URLSearchParams({
      organizationNumber: "919172657",
      fields: "*",
    }).toString()}`,
  );

  const productParams = new URLSearchParams({ fields: "*" });
  for (const ref of ["4783", "3343", "4380"]) {
    productParams.append("productNumber", ref);
  }
  const products = await api(`/product?${productParams.toString()}`);

  console.log(
    JSON.stringify(
      {
        vatByDate: Object.fromEntries(
          Object.entries(vatByDate).map(([date, values]) => [
            date,
            values.map((vatType) => ({
              id: vatType.id,
              number: vatType.number,
              name: vatType.name,
              percentage: vatType.percentage,
            })),
          ]),
        ),
        customer: customer.values ?? [],
        products: products.values ?? [],
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(String(error));
  process.exit(1);
});
