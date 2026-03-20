const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const sessionToken =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
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

function chooseVatType(values: JsonObject[]): JsonObject {
  const matches = values.filter((value) => Number(value.percentage) === 15);
  if (matches.length === 0) {
    throw new Error(`No 15% OUTGOING VAT type in result: ${JSON.stringify(values, null, 2)}`);
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
const vatType = chooseVatType(vatValues);
const vatTypeId = Number(vatType.id);
const uniqueNumber = `reflection-${Date.now()}`;

const createResponse = await request<{ value?: JsonObject }>("/product", {
  method: "POST",
  body: JSON.stringify({
    name: "Reflection product 15%",
    number: uniqueNumber,
    priceExcludingVatCurrency: 28350,
    vatType: { id: vatTypeId },
  }),
});

console.log(
  JSON.stringify(
    {
      vatCandidates: vatValues.map((value) => ({
        id: value.id,
        number: value.number,
        name: value.name,
        percentage: value.percentage,
      })),
      chosenVatType: {
        id: vatType.id,
        number: vatType.number,
        name: vatType.name,
        percentage: vatType.percentage,
      },
      createdProduct: createResponse.value,
    },
    null,
    2,
  ),
);
