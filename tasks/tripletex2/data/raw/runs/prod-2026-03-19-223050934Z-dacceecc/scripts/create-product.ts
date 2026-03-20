const baseUrl = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const sessionToken = "REDACTED";

const authHeader = `Basic ${Buffer.from(`0:${sessionToken}`).toString("base64")}`;

type VatType = {
  id: number;
  name?: string;
  number?: string;
  displayName?: string;
  percentage?: number;
  parentType?: { id?: number } | null;
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
    `/ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-19&fields=*`
  );

  const vatTypes = vatResponse.values ?? [];
  const standardVatType =
    vatTypes.find((vatType) => vatType.percentage === 25 && !vatType.parentType) ??
    vatTypes.find((vatType) => vatType.percentage === 25);

  if (!standardVatType?.id) {
    throw new Error(`Could not find outgoing 25% VAT type. Response: ${JSON.stringify(vatTypes)}`);
  }

  const productPayload = {
    name: "Konsulenttimar",
    number: "3923",
    priceExcludingVatCurrency: 26400,
    vatType: { id: standardVatType.id },
  };

  const productResponse = await tripletex<{ value?: Record<string, unknown> }>("/product", {
    method: "POST",
    body: JSON.stringify(productPayload),
  });

  const product = productResponse.value;
  if (!product) {
    throw new Error(`Missing product in response: ${JSON.stringify(productResponse)}`);
  }

  console.log(
    JSON.stringify(
      {
        vatTypeUsed: standardVatType,
        product,
      },
      null,
      2
    )
  );
}

await main();
