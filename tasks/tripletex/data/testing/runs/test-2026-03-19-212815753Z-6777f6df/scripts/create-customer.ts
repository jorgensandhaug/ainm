const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const sessionToken =
  "REDACTED";

const payload = {
  name: "Race Smoke Test AS",
  email: "post@race-smoke.no",
  organizationNumber: "999888777",
};

const auth = Buffer.from(`0:${sessionToken}`).toString("base64");

const response = await fetch(`${baseUrl}/customer`, {
  method: "POST",
  headers: {
    Authorization: `Basic ${auth}`,
    "Content-Type": "application/json; charset=utf-8",
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
    // Leave body as raw text handling via thrown error below.
  }
}

if (!response.ok) {
  throw new Error(
    `Tripletex create customer failed: ${response.status} ${response.statusText}\n${text}`,
  );
}

const customer = (data as { value?: Record<string, unknown> } | null)?.value;

if (!customer) {
  throw new Error(`Missing customer in response body: ${text}`);
}

if (
  customer.name !== payload.name ||
  customer.email !== payload.email ||
  customer.organizationNumber !== payload.organizationNumber
) {
  throw new Error(`Customer mismatch in response body: ${JSON.stringify(customer)}`);
}

console.log(
  JSON.stringify(
    {
      id: customer.id,
      name: customer.name,
      email: customer.email,
      organizationNumber: customer.organizationNumber,
    },
    null,
    2,
  ),
);
