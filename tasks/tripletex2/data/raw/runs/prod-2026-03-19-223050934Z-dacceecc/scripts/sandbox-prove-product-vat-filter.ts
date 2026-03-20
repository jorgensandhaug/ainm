const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const sessionToken =
  "REDACTED";

const authHeader = `Basic ${Buffer.from(`0:${sessionToken}`).toString("base64")}`;

type VatType = {
  id: number;
  number?: string;
  displayName?: string;
  percentage?: number;
};

type Product = {
  id: number;
  name?: string;
  number?: string;
  priceExcludingVatCurrency?: number;
  priceIncludingVatCurrency?: number;
  vatType?: { id?: number; url?: string } | null;
};

async function tripletex<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: authHeader,
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json; charset=utf-8" } : {}),
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${init?.method ?? "GET"} ${path} failed: ${response.status} ${text}`);
  }

  return (await response.json()) as T;
}

async function main() {
  const vatResponse = await tripletex<{ values?: VatType[] }>(
    "/ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-19&fields=*"
  );
  const vatTypes = vatResponse.values ?? [];
  const vatType = vatTypes[0];

  if (!vatType?.id) {
    throw new Error(`No OUTGOING VAT type returned: ${JSON.stringify(vatResponse)}`);
  }

  const suffix = `${Date.now()}`.slice(-8);
  const productResponse = await tripletex<{ value?: Product }>("/product", {
    method: "POST",
    body: JSON.stringify({
      name: `VAT Filter Proof ${suffix}`,
      number: `94${suffix}`,
      priceExcludingVatCurrency: 100,
      vatType: { id: vatType.id },
    }),
  });

  console.log(
    JSON.stringify(
      {
        vatType,
        createdProduct: productResponse.value,
      },
      null,
      2
    )
  );
}

await main();
