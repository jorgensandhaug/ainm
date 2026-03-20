const baseUrl = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const sessionToken = "0Ex3FmbuTdMUA5wrhQN9oxnClqEbiF3XOX8QVYZZGTo";

const expected = {
  name: "Maintenance",
  number: "1327",
  priceExcludingVatCurrency: 3700,
  priceIncludingVatCurrency: 4625,
};

function basicAuth(user: string, pass: string): string {
  return Buffer.from(`${user}:${pass}`).toString("base64");
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const productUrl = new URL(baseUrl.endsWith("/") ? `${baseUrl}product` : `${baseUrl}/product`);

const response = await fetch(productUrl, {
  method: "POST",
  headers: {
    Authorization: `Basic ${basicAuth("0", sessionToken)}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  },
  body: JSON.stringify({
    name: expected.name,
    number: Number(expected.number),
    priceExcludingVatCurrency: expected.priceExcludingVatCurrency,
  }),
});

const raw = await response.text();
const data = raw ? JSON.parse(raw) : null;

if (!response.ok) {
  const errorText = typeof data?.error === "string" ? data.error : raw;
  if (
    response.status === 403 &&
    (errorText === "Invalid or expired token" ||
      errorText ===
        "Invalid or expired proxy token. Each submission receives a unique token - do not reuse tokens from previous submissions.")
  ) {
    throw new Error(`Blocked credentials: ${errorText}`);
  }
  throw new Error(`Tripletex error ${response.status}: ${raw}`);
}

const value = data?.value;
assert(value, "Missing response.value");
assert(String(value.name) === expected.name, `Unexpected name: ${value.name}`);
assert(String(value.number) === expected.number, `Unexpected number: ${value.number}`);
assert(
  Number(value.priceExcludingVatCurrency) === expected.priceExcludingVatCurrency,
  `Unexpected ex VAT price: ${value.priceExcludingVatCurrency}`,
);
assert(
  Number(value.priceIncludingVatCurrency) === expected.priceIncludingVatCurrency,
  `Unexpected inc VAT price: ${value.priceIncludingVatCurrency}`,
);
assert(value.vatType, "Missing vatType on created product");

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
