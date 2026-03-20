const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const token =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const uniqueSuffix = "269241";
const payload = {
  name: `Codex Reflection ${uniqueSuffix} AS`,
  organizationNumber: `999${uniqueSuffix}`,
  email: `codex-reflection-${uniqueSuffix}@example.no`,
  postalAddress: {
    addressLine1: "Sjøgata 85",
    postalCode: "7010",
    city: "Trondheim",
  },
};

const auth = Buffer.from(`0:${token}`).toString("base64");

const response = await fetch(`${baseUrl}/customer`, {
  method: "POST",
  headers: {
    Authorization: `Basic ${auth}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  },
  body: JSON.stringify(payload),
});

const text = await response.text();
const data = text ? JSON.parse(text) : null;

if (!response.ok) {
  console.error(JSON.stringify({ status: response.status, body: data }, null, 2));
  process.exit(1);
}

const value = data?.value;

const checks = [
  value?.name === payload.name,
  value?.organizationNumber === payload.organizationNumber,
  value?.email === payload.email,
  value?.postalAddress?.addressLine1 === payload.postalAddress.addressLine1,
  value?.postalAddress?.postalCode === payload.postalAddress.postalCode,
  value?.postalAddress?.city === payload.postalAddress.city,
  value?.physicalAddress?.id != null,
  value?.physicalAddress?.url != null,
];

if (checks.includes(false)) {
  console.error(JSON.stringify({ error: "Verification failed", value }, null, 2));
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      id: value.id,
      name: value.name,
      organizationNumber: value.organizationNumber,
      email: value.email,
      postalAddress: value.postalAddress,
      physicalAddress: value.physicalAddress,
      invoiceSendMethod: value.invoiceSendMethod,
      emailAttachmentType: value.emailAttachmentType,
    },
    null,
    2,
  ),
);
