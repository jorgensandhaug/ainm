const baseUrl = process.env.TRIPLETEX_BASE_URL;
const token = process.env.TRIPLETEX_TOKEN;

if (!baseUrl || !token) {
  throw new Error("Missing TRIPLETEX_BASE_URL or TRIPLETEX_TOKEN");
}

const payload = {
  name: "Bergwerk GmbH",
  organizationNumber: "903944145",
  email: "post@bergwerk.no",
  postalAddress: {
    addressLine1: "Solveien 52",
    postalCode: "9008",
    city: "Tromsø",
  },
};

const response = await fetch(`${baseUrl}/customer`, {
  method: "POST",
  headers: {
    Authorization: `Basic ${Buffer.from(`0:${token}`).toString("base64")}`,
    Accept: "application/json",
    "Content-Type": "application/json; charset=utf-8",
  },
  body: JSON.stringify(payload),
});

const rawBody = await response.text();
const body = rawBody ? JSON.parse(rawBody) : null;

if (!response.ok) {
  console.error(JSON.stringify({ status: response.status, body }, null, 2));
  process.exit(1);
}

const customer = body?.value;
if (!customer) {
  throw new Error("Missing response.value");
}

const checks = [
  customer.name === payload.name,
  customer.organizationNumber === payload.organizationNumber,
  customer.email === payload.email,
  customer.postalAddress?.addressLine1 === payload.postalAddress.addressLine1,
  customer.postalAddress?.postalCode === payload.postalAddress.postalCode,
  customer.postalAddress?.city === payload.postalAddress.city,
];

if (checks.some((ok) => !ok)) {
  console.error(JSON.stringify({ message: "Verification failed", customer }, null, 2));
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
