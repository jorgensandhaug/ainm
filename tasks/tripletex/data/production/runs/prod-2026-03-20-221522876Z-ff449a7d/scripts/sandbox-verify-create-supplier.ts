const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const sessionToken =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const url = new URL(baseUrl.endsWith("/") ? `${baseUrl}supplier` : `${baseUrl}/supplier`);
const auth = Buffer.from(`0:${sessionToken}`).toString("base64");

const payload = {
  name: "Silveroak Reflection Supplier 321000008",
  organizationNumber: "321000008",
  email: "faktura-321000008@silveroakltd.no",
  invoiceEmail: "faktura-321000008@silveroakltd.no",
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

if (!response.ok) {
  console.error(text);
  process.exit(1);
}

console.log(text);
