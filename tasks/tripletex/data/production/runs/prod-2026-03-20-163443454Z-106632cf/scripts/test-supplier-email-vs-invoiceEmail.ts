const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const token =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const payload = {
  name: "Río Verde SL Reflection 321000005",
  organizationNumber: "321000005",
  email: "faktura-321000005@example.no",
  invoiceEmail: "faktura-321000005@example.no",
};

const response = await fetch(`${baseUrl}/supplier`, {
  method: "POST",
  headers: {
    Authorization: `Basic ${Buffer.from(`0:${token}`).toString("base64")}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  },
  body: JSON.stringify(payload),
});

const text = await response.text();
let body: unknown;

try {
  body = text ? JSON.parse(text) : null;
} catch {
  body = text;
}

console.log(JSON.stringify({ status: response.status, body }, null, 2));

if (!response.ok) process.exit(1);
