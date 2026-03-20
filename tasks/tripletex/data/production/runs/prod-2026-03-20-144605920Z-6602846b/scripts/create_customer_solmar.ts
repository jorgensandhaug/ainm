const baseUrl = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const sessionToken = "V7RoMKVpWfy3v68gQWZBdAS50-1h2DNoarawBsNltXE";

const payload = {
  name: "Solmar SL",
  email: "post@solmar.no",
  organizationNumber: "879505631",
  postalAddress: {
    addressLine1: "Parkveien 49",
    postalCode: "4611",
    city: "Kristiansand",
  },
};

const response = await fetch(`${baseUrl}/customer`, {
  method: "POST",
  headers: {
    Authorization: `Basic ${Buffer.from(`0:${sessionToken}`).toString("base64")}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  },
  body: JSON.stringify(payload),
});

const text = await response.text();
if (!response.ok) {
  throw new Error(`POST /customer failed: ${response.status} ${text}`);
}

const data = JSON.parse(text) as { value?: any };
const customer = data.value;

if (!customer) {
  throw new Error("Missing response.value");
}

const checks: Array<[string, unknown, unknown]> = [
  ["name", customer.name, payload.name],
  ["email", customer.email, payload.email],
  ["organizationNumber", customer.organizationNumber, payload.organizationNumber],
  ["postalAddress.addressLine1", customer.postalAddress?.addressLine1, payload.postalAddress.addressLine1],
  ["postalAddress.postalCode", customer.postalAddress?.postalCode, payload.postalAddress.postalCode],
  ["postalAddress.city", customer.postalAddress?.city, payload.postalAddress.city],
];

for (const [field, actual, expected] of checks) {
  if (actual !== expected) {
    throw new Error(`Verification failed for ${field}: expected ${expected}, got ${actual}`);
  }
}

console.log(
  JSON.stringify(
    {
      id: customer.id,
      name: customer.name,
      email: customer.email,
      organizationNumber: customer.organizationNumber,
      postalAddress: customer.postalAddress,
    },
    null,
    2,
  ),
);
