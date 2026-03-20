const baseUrl = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const token = "sFicaLYg2Cl5EnGym9INV_lAt31p6jRb8IZrIVSDlGU";

const endpoint = `${baseUrl.replace(/\/+$/, "")}/product`;
const payload = {
  name: "Mantenimiento",
  number: "7266",
  priceExcludingVatCurrency: 650,
};

const auth = Buffer.from(`0:${token}`).toString("base64");

const response = await fetch(endpoint, {
  method: "POST",
  headers: {
    Authorization: `Basic ${auth}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  },
  body: JSON.stringify(payload),
});

const raw = await response.text();
let data: any = null;
try {
  data = raw ? JSON.parse(raw) : null;
} catch {
  data = raw;
}

if (response.status === 403) {
  const error = data?.error;
  if (
    error === "Invalid or expired token" ||
    error ===
      "Invalid or expired proxy token. Each submission receives a unique token - do not reuse tokens from previous submissions."
  ) {
    throw new Error(`Blocked credentials: ${JSON.stringify(data)}`);
  }
}

if (!response.ok) {
  throw new Error(`HTTP ${response.status}: ${JSON.stringify(data)}`);
}

const value = data?.value;
if (!value) {
  throw new Error(`Missing value in response: ${JSON.stringify(data)}`);
}

const expectedIncludingVat = 812.5;
if (value.priceIncludingVatCurrency !== expectedIncludingVat || !value.vatType) {
  throw new Error(`Unexpected VAT result: ${JSON.stringify(value)}`);
}

console.log(JSON.stringify(value, null, 2));
