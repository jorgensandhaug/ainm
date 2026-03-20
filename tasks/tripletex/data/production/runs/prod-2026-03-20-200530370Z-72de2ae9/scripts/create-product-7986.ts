const baseUrl = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const sessionToken = "dwaPjSd5a39PXP6q1co5SfFKGHRyr1yz9c_W55sC5mM";

const payload = {
  name: "Softwarelizenz",
  number: 7986,
  priceExcludingVatCurrency: 24900,
};

const expectedGross = 31125;

function buildUrl(path: string): string {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(path, normalizedBase).toString();
}

async function main() {
  const auth = Buffer.from(`0:${sessionToken}`).toString("base64");
  const response = await fetch(buildUrl("product"), {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : null;

  if (!response.ok) {
    if (
      response.status === 403 &&
      body &&
      typeof body === "object" &&
      body.error === "Invalid or expired token"
    ) {
      throw new Error("Blocked: invalid or expired token");
    }
    throw new Error(
      `Tripletex error ${response.status}: ${text || response.statusText}`,
    );
  }

  const value = body?.value;
  if (!value) {
    throw new Error(`Missing response.value: ${text}`);
  }

  if (value.name !== payload.name) {
    throw new Error(`Unexpected name in response: ${JSON.stringify(value)}`);
  }

  if (Number(value.number) !== payload.number) {
    throw new Error(`Unexpected number in response: ${JSON.stringify(value)}`);
  }

  if (
    Number(value.priceExcludingVatCurrency) !== payload.priceExcludingVatCurrency
  ) {
    throw new Error(
      `Unexpected net price in response: ${JSON.stringify(value)}`,
    );
  }

  if (Number(value.priceIncludingVatCurrency) !== expectedGross) {
    throw new Error(
      `Unexpected gross price in response: ${JSON.stringify(value)}`,
    );
  }

  if (!value.vatType) {
    throw new Error(`Missing vatType in response: ${JSON.stringify(value)}`);
  }

  console.log(
    JSON.stringify(
      {
        id: value.id,
        name: value.name,
        number: value.number,
        priceExcludingVatCurrency: value.priceExcludingVatCurrency,
        priceIncludingVatCurrency: value.priceIncludingVatCurrency,
        vatType: value.vatType,
      },
      null,
      2,
    ),
  );
}

await main();
