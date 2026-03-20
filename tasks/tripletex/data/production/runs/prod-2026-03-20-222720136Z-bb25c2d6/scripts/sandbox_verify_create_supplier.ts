const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const sessionToken =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const supplier = {
  name: "Cascade SARL Reflection 321000010",
  organizationNumber: "321000010",
  email: "faktura-321000010@cascadesarl.no",
  invoiceEmail: "faktura-321000010@cascadesarl.no",
};

const url = new URL("supplier", `${baseUrl}/`);
const auth = Buffer.from(`0:${sessionToken}`).toString("base64");

const response = await fetch(url, {
  method: "POST",
  headers: {
    Authorization: `Basic ${auth}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  },
  body: JSON.stringify(supplier),
});

const text = await response.text();
let body: unknown = null;
if (text) {
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
}

console.log(JSON.stringify({ status: response.status, body }, null, 2));

if (!response.ok) {
  process.exit(1);
}
