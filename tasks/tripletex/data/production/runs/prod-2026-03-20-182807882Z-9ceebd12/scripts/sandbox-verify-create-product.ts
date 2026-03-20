const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const sessionToken =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const auth = `Basic ${Buffer.from(`0:${sessionToken}`).toString("base64")}`;

const headers = {
  Authorization: auth,
  Accept: "application/json",
};

async function tripletex<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl}/${path}`, {
    ...init,
    headers: {
      ...headers,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    console.error(JSON.stringify({ path, status: response.status, data }, null, 2));
    process.exit(1);
  }

  return data as T;
}

type ListResponse<T> = { values: T[] };
type VatType = { id: number; number?: string; percentage?: number; displayName?: string; name?: string };
type ProductResponse = {
  value: {
    id: number;
    name: string;
    number: string;
    priceExcludingVatCurrency: number;
    priceIncludingVatCurrency: number;
    vatType?: { id: number; url?: string };
  };
};

const vatDate = "2026-03-20";
const productNumber = `8912${Date.now().toString().slice(-7)}`;

const vatTypes = await tripletex<ListResponse<VatType>>(
  `ledger/vatType?typeOfVat=OUTGOING&vatDate=${encodeURIComponent(vatDate)}&fields=*`,
);

const vat25 = vatTypes.values.find((entry) => entry.percentage === 25);

if (!vat25) {
  console.log(
    JSON.stringify(
      {
        blocked: true,
        reason: "No 25% OUTGOING VAT type on task date",
        vatDate,
        availableVatTypes: vatTypes.values.map((entry) => ({
          id: entry.id,
          number: entry.number,
          percentage: entry.percentage,
          name: entry.displayName ?? entry.name,
        })),
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

const product = await tripletex<ProductResponse>("product", {
  method: "POST",
  body: JSON.stringify({
    name: "Stockage cloud sandbox verification",
    number: productNumber,
    priceExcludingVatCurrency: 26850,
    vatType: { id: vat25.id },
  }),
});

console.log(
  JSON.stringify(
    {
      blocked: false,
      vatDate,
      selectedVatType: {
        id: vat25.id,
        number: vat25.number,
        percentage: vat25.percentage,
        name: vat25.displayName ?? vat25.name,
      },
      createdProduct: product.value,
    },
    null,
    2,
  ),
);
