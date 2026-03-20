const baseUrl = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const sessionToken = "GfNhrIN1mnpk3lZk6hstyEgJ91GNb3w2IcQuaMwK_Lo";
const vatDate = "2026-03-20";

const auth = `Basic ${Buffer.from(`0:${sessionToken}`).toString("base64")}`;

type JsonObject = Record<string, unknown>;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: auth,
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json; charset=utf-8" } : {}),
      ...(init?.headers ?? {}),
    },
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(
      JSON.stringify(
        {
          status: response.status,
          path,
          body: data,
        },
        null,
        2,
      ),
    );
  }

  return data as T;
}

function pickVatType(values: JsonObject[]): JsonObject {
  const matches = values.filter((value) => Number(value.percentage) === 15);
  if (matches.length === 0) {
    throw new Error(`No OUTGOING VAT type with percentage 15 found: ${JSON.stringify(values, null, 2)}`);
  }

  matches.sort((a, b) => {
    const aNumber = String(a.number ?? "");
    const bNumber = String(b.number ?? "");
    const aNumeric = /^\d+$/.test(aNumber) ? 0 : 1;
    const bNumeric = /^\d+$/.test(bNumber) ? 0 : 1;
    if (aNumeric !== bNumeric) return aNumeric - bNumeric;
    return aNumber.localeCompare(bNumber, "en");
  });

  return matches[0]!;
}

const vatResponse = await request<{ values?: JsonObject[] }>(
  `/ledger/vatType?typeOfVat=OUTGOING&vatDate=${encodeURIComponent(vatDate)}&fields=*`,
);

const vatValues = vatResponse.values ?? [];
const vatType = pickVatType(vatValues);
const vatTypeId = Number(vatType.id);

const createResponse = await request<{ value?: JsonObject }>("/product", {
  method: "POST",
  body: JSON.stringify({
    name: "Pão integral",
    number: "1871",
    priceExcludingVatCurrency: 28350,
    vatType: { id: vatTypeId },
  }),
});

const product = createResponse.value ?? {};

console.log(
  JSON.stringify(
    {
      id: product.id,
      name: product.name,
      number: product.number,
      priceExcludingVatCurrency: product.priceExcludingVatCurrency,
      priceIncludingVatCurrency: product.priceIncludingVatCurrency,
      vatType: product.vatType,
    },
    null,
    2,
  ),
);
