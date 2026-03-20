const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const token =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const payload = {
  name: "Río Verde SL Reflection 321000004",
  organizationNumber: "321000004",
  email: "faktura-321000004@example.no",
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
let body: unknown = null;

try {
  body = text ? JSON.parse(text) : null;
} catch {
  body = text;
}

if (!response.ok) {
  console.error(JSON.stringify({ status: response.status, body }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ status: response.status, body }, null, 2));
