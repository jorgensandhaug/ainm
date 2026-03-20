const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const sessionToken =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const email = "faktura-321000006@skogheim.no";
const payload = {
  name: "Skogheim Reflection Supplier 321000006",
  organizationNumber: "321000006",
  email,
  invoiceEmail: email,
};

const auth = Buffer.from(`0:${sessionToken}`).toString("base64");
const url = new URL("supplier", `${baseUrl}/`);

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
