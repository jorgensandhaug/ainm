const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const token =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const url = new URL("supplier", baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
const auth = Buffer.from(`0:${token}`).toString("base64");
const payload = {
  name: "Northwave Reflection Supplier 321000009",
  organizationNumber: "321000009",
  email: "faktura-321000009@northwaveltd.no",
  invoiceEmail: "faktura-321000009@northwaveltd.no",
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
const body = text ? JSON.parse(text) : null;

if (!response.ok) {
  throw new Error(`HTTP ${response.status}: ${JSON.stringify(body)}`);
}

const value = body?.value;
if (!value) {
  throw new Error(`Missing response.value: ${JSON.stringify(body)}`);
}

for (const [key, expected] of Object.entries(payload)) {
  if (value[key] !== expected) {
    throw new Error(
      `Unexpected ${key}: got ${JSON.stringify(value[key])}, expected ${JSON.stringify(expected)}`,
    );
  }
}

console.log(JSON.stringify(value, null, 2));
