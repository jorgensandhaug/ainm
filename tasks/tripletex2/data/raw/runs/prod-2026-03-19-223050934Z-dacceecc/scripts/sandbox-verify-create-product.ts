const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const sessionToken =
  "REDACTED";

const authHeader = `Basic ${Buffer.from(`0:${sessionToken}`).toString("base64")}`;

type VatType = {
  id: number;
  name?: string;
  number?: string;
  displayName?: string;
  percentage?: number;
  parentType?: { id?: number; url?: string } | null;
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

function resolveStandardOutgoing25(vatTypes: VatType[]): VatType {
  const exactNumber3 = vatTypes.find(
    (vatType) => vatType.number === "3" && vatType.percentage === 25
  );
  if (exactNumber3) {
    return exactNumber3;
  }

  const only25 = vatTypes.filter((vatType) => vatType.percentage === 25);
  if (only25.length === 1) {
    return only25[0];
  }

  throw new Error(`Could not resolve standard outgoing 25% VAT type: ${JSON.stringify(vatTypes)}`);
}

async function main() {
  const outgoingVatResponse = await tripletex<{ values?: VatType[] }>(
    "/ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-19&fields=*"
  );
  const allVatResponse = await tripletex<{ values?: VatType[] }>("/ledger/vatType?fields=*");

  const outgoingVatTypes = outgoingVatResponse.values ?? [];
  const allVatTypes = allVatResponse.values ?? [];
  const outgoing25 = outgoingVatTypes.filter((vatType) => vatType.percentage === 25);
  const all25 = allVatTypes.filter((vatType) => vatType.percentage === 25);
  const standardVatType = resolveStandardOutgoing25(allVatTypes);

  const uniqueDigits = `${Date.now()}`.slice(-8);
  const productPayload = {
    name: `Reflection Product ${uniqueDigits}`,
    number: `93${uniqueDigits}`,
    priceExcludingVatCurrency: 26400,
    vatType: { id: standardVatType.id },
  };

  const productResponse = await tripletex<{ value?: Product }>("/product", {
    method: "POST",
    body: JSON.stringify(productPayload),
  });

  if (!productResponse.value) {
    throw new Error(`Missing product in response: ${JSON.stringify(productResponse)}`);
  }

  console.log(
    JSON.stringify(
      {
        outgoingVatTypes,
        outgoing25,
        all25,
        standardVatType,
        createdProduct: productResponse.value,
      },
      null,
      2
    )
  );
}

await main();
