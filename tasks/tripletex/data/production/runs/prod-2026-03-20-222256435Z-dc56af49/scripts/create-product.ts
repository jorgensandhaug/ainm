const baseUrl = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const sessionToken = "RLfVwUocSeqcvltKcyBPX0MpZUorVJRYXk_PsSR7Luw";

const expectedIncludingVat = 46312.5;
const auth = Buffer.from(`0:${sessionToken}`).toString("base64");
const url = new URL("product", `${baseUrl}/`);

const payload = {
  name: "Sessão de formação",
  number: "6378",
  priceExcludingVatCurrency: 37050,
};

const response = await fetch(url, {
  method: "POST",
  headers: {
    Authorization: `Basic ${auth}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  },
  body: JSON.stringify(payload),
});

const text = await response.text();
let data: unknown = null;

if (text) {
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
}

if (!response.ok) {
  console.error(`HTTP ${response.status}`);
  if (data !== null) console.error(JSON.stringify(data, null, 2));
  process.exit(1);
}

const value = (data as { value?: Record<string, unknown> })?.value;

if (!value) {
  console.error("Missing response.value");
  if (data !== null) console.error(JSON.stringify(data, null, 2));
  process.exit(1);
}

const priceIncludingVatCurrency = Number(value.priceIncludingVatCurrency);
const vatTypeId = value.vatType && typeof value.vatType === "object"
  ? Number((value.vatType as { id?: unknown }).id)
  : NaN;

if (priceIncludingVatCurrency !== expectedIncludingVat || Number.isNaN(vatTypeId)) {
  console.error("Unexpected product create response");
  console.error(JSON.stringify(data, null, 2));
  process.exit(1);
}

console.log(JSON.stringify(data, null, 2));
