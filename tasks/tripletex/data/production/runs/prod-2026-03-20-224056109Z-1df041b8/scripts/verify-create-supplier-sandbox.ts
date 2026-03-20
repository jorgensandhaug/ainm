const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const sessionToken =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const url = `${baseUrl.replace(/\/+$/, "")}/supplier`;
const auth = Buffer.from(`0:${sessionToken}`).toString("base64");

const payload = {
  name: "Northwave Reflection Supplier 321000011",
  organizationNumber: "321000011",
  email: "faktura-321000011@northwaveltd.no",
  invoiceEmail: "faktura-321000011@northwaveltd.no",
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

const rawBody = await response.text();
let body: unknown = null;

try {
  body = rawBody ? JSON.parse(rawBody) : null;
} catch {
  body = rawBody;
}

if (!response.ok) {
  throw new Error(`Sandbox verification failed: ${response.status} ${rawBody}`);
}

console.log(JSON.stringify(body, null, 2));
