const baseUrl = process.env.TRIPLETEX_BASE_URL;
const token = process.env.TRIPLETEX_SESSION_TOKEN;

if (!baseUrl || !token) {
  throw new Error("Missing TRIPLETEX_BASE_URL or TRIPLETEX_SESSION_TOKEN");
}

const suffix = `${Date.now()}`.slice(-6);
const endpoint = new URL("customer", baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
const auth = Buffer.from(`0:${token}`).toString("base64");

const payload = {
  name: `Nordlys Reflection ${suffix} AS`,
  email: `post-reflection-${suffix}@nordlys.no`,
  organizationNumber: `999${suffix}`,
  postalAddress: {
    addressLine1: "Parkveien 45",
    postalCode: "5003",
    city: "Bergen",
  },
};

const response = await fetch(endpoint, {
  method: "POST",
  headers: {
    Authorization: `Basic ${auth}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  },
  body: JSON.stringify(payload),
});

const raw = await response.text();
const body = raw ? JSON.parse(raw) : null;

if (!response.ok) {
  throw new Error(`Tripletex error ${response.status}: ${JSON.stringify(body)}`);
}

const value = body?.value;

if (
  !value ||
  value.name !== payload.name ||
  value.email !== payload.email ||
  value.organizationNumber !== payload.organizationNumber ||
  value.postalAddress?.addressLine1 !== payload.postalAddress.addressLine1 ||
  value.postalAddress?.postalCode !== payload.postalAddress.postalCode ||
  value.postalAddress?.city !== payload.postalAddress.city
) {
  throw new Error(`Unexpected create response: ${JSON.stringify(body)}`);
}

console.log(JSON.stringify({
  id: value.id,
  name: value.name,
  email: value.email,
  organizationNumber: value.organizationNumber,
  postalAddress: {
    addressLine1: value.postalAddress.addressLine1,
    postalCode: value.postalAddress.postalCode,
    city: value.postalAddress.city,
  },
  physicalAddress: value.physicalAddress ?? null,
}, null, 2));
