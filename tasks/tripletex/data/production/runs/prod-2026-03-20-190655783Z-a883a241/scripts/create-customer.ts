const baseUrl = process.env.TRIPLETEX_BASE_URL;
const token = process.env.TRIPLETEX_SESSION_TOKEN;

if (!baseUrl || !token) {
  throw new Error("Missing TRIPLETEX_BASE_URL or TRIPLETEX_SESSION_TOKEN");
}

const endpoint = new URL("customer", baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
const auth = Buffer.from(`0:${token}`).toString("base64");

const payload = {
  name: "Nordlys AS",
  email: "post@nordlys.no",
  organizationNumber: "951285463",
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
let body: any = null;

if (raw) {
  try {
    body = JSON.parse(raw);
  } catch {
    body = raw;
  }
}

if (!response.ok) {
  if (
    response.status === 403 &&
    body &&
    typeof body === "object" &&
    body.error === "Invalid or expired token"
  ) {
    throw new Error(`Blocked by unusable token: ${JSON.stringify(body)}`);
  }

  throw new Error(`Tripletex error ${response.status}: ${typeof body === "string" ? body : JSON.stringify(body)}`);
}

const value = body?.value;

if (!value) {
  throw new Error(`Missing response.value: ${JSON.stringify(body)}`);
}

if (
  value.name !== payload.name ||
  value.email !== payload.email ||
  value.organizationNumber !== payload.organizationNumber ||
  value.postalAddress?.addressLine1 !== payload.postalAddress.addressLine1 ||
  value.postalAddress?.postalCode !== payload.postalAddress.postalCode ||
  value.postalAddress?.city !== payload.postalAddress.city
) {
  throw new Error(`Created customer does not match requested state: ${JSON.stringify(value)}`);
}

console.log(JSON.stringify({
  id: value.id,
  name: value.name,
  email: value.email,
  organizationNumber: value.organizationNumber,
  postalAddress: value.postalAddress,
}, null, 2));
