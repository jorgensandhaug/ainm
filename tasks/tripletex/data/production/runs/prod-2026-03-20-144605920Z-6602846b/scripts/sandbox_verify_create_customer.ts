const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const sessionToken =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const payload = {
  name: "Solmar Reflection 6602846b AS",
  email: "post-reflection-6602846b@solmar.no",
  organizationNumber: "999660284",
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
      physicalAddress: customer.physicalAddress,
      invoiceSendMethod: customer.invoiceSendMethod,
      emailAttachmentType: customer.emailAttachmentType,
    },
    null,
    2,
  ),
);
