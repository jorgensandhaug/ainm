const baseUrl = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const sessionToken = "REDACTED";

const payload = {
  name: "Grünfeld GmbH",
  organizationNumber: "886669445",
  email: "post@grunfeld.no",
  postalAddress: {
    addressLine1: "Kirkegata 87",
    postalCode: "6003",
    city: "Ålesund",
  },
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
const data = text ? JSON.parse(text) : null;

if (!response.ok) {
  console.error(JSON.stringify({ status: response.status, data }, null, 2));
  process.exit(1);
}

const customer = data?.value;

if (!customer) {
  console.error(JSON.stringify({ error: "Missing response.value", data }, null, 2));
  process.exit(1);
}

const checks: Array<[string, unknown, unknown]> = [
  ["name", customer.name, payload.name],
  ["organizationNumber", customer.organizationNumber, payload.organizationNumber],
  ["email", customer.email, payload.email],
  ["postalAddress.addressLine1", customer.postalAddress?.addressLine1, payload.postalAddress.addressLine1],
  ["postalAddress.postalCode", customer.postalAddress?.postalCode, payload.postalAddress.postalCode],
  ["postalAddress.city", customer.postalAddress?.city, payload.postalAddress.city],
];

const mismatches = checks
  .filter(([, actual, expected]) => actual !== expected)
  .map(([field, actual, expected]) => ({ field, actual, expected }));

if (mismatches.length > 0) {
  console.error(JSON.stringify({ error: "Verification failed", mismatches, customer }, null, 2));
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      id: customer.id,
      name: customer.name,
      organizationNumber: customer.organizationNumber,
      email: customer.email,
      postalAddress: customer.postalAddress,
    },
    null,
    2,
  ),
);
