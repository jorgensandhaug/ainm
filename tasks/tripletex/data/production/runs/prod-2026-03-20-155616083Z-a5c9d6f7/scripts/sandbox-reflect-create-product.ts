const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const token =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const authHeader = `Basic ${Buffer.from(`0:${token}`).toString("base64")}`;
const vatDate = "2026-03-20";
const suffix = Date.now().toString().slice(-6);

type TripletexListResponse<T> = {
  values?: T[];
  fullResultSize?: number;
};

type TripletexValueResponse<T> = {
  value?: T;
};

type VatType = {
  id: number;
  number?: string | number;
  name?: string;
  displayName?: string;
  percentage?: number;
};

type Product = {
  id: number;
  name: string;
  number: string;
  priceExcludingVatCurrency: number;
  priceIncludingVatCurrency?: number;
  vatType?: {
    id: number;
    url?: string;
  };
};

async function call<T>(path: string, init?: RequestInit): Promise<{ status: number; data: T }> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: authHeader,
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json; charset=utf-8" } : {}),
    },
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  return {
    status: response.status,
    data: data as T,
  };
}

const vatResult = await call<TripletexListResponse<VatType>>(
  `/ledger/vatType?typeOfVat=OUTGOING&vatDate=${vatDate}&fields=*`,
  { method: "GET" },
);

const zeroVat = (vatResult.data.values ?? []).find((vat) => Number(vat.percentage) === 0);

if (!zeroVat) {
  console.log(
    JSON.stringify(
      {
        phase: "vat-lookup",
        vatResult,
        error: "No 0% outgoing VAT row in filtered result",
      },
      null,
      2,
    ),
  );
  process.exit(1);
}

const correctCreate = await call<TripletexValueResponse<Product>>("/product", {
  method: "POST",
  body: JSON.stringify({
    name: `Reflection Book VAT Product ${suffix}`,
    number: `92${suffix}`,
    priceExcludingVatCurrency: 5650,
    vatType: { id: zeroVat.id },
  }),
});

const noVatShortcut = await call<TripletexValueResponse<Product> | { message?: string; error?: unknown }>(
  "/product",
  {
    method: "POST",
    body: JSON.stringify({
      name: `Reflection Book VAT Product No VAT ${suffix}`,
      number: `93${suffix}`,
      priceExcludingVatCurrency: 5650,
    }),
  },
);

console.log(
  JSON.stringify(
    {
      vatLookup: vatResult,
      chosenZeroVat: zeroVat,
      correctCreate,
      noVatShortcut,
    },
    null,
    2,
  ),
);
