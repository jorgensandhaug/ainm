const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const sessionToken =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const suffix = "321000003";
const payload = {
  name: `Codex Reflection Supplier Faktura ${suffix}`,
  organizationNumber: suffix,
  email: `faktura-${suffix}@example.no`,
};

const auth = Buffer.from(`0:${sessionToken}`).toString("base64");

const response = await fetch(`${baseUrl}/supplier`, {
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
  console.error(JSON.stringify({ status: response.status, data }, null, 2));
  process.exit(1);
}

const supplier = (data as { value?: Record<string, unknown> } | null)?.value;

if (
  !supplier ||
  supplier.name !== payload.name ||
  supplier.organizationNumber !== payload.organizationNumber ||
  supplier.email !== payload.email
) {
  console.error(JSON.stringify({ status: response.status, data }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ status: response.status, supplier }, null, 2));
