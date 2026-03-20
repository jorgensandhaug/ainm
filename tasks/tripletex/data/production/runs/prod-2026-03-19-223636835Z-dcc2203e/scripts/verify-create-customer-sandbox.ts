const baseUrl = process.env.TRIPLETEX_BASE_URL;
const token = process.env.TRIPLETEX_TOKEN;

if (!baseUrl || !token) {
  throw new Error("Missing TRIPLETEX_BASE_URL or TRIPLETEX_TOKEN");
}

function generateValidOrgNumber(seed: number): string {
  const weights = [3, 2, 7, 6, 5, 4, 3, 2];

  for (let value = seed; value < seed + 100_000; value += 1) {
    const digits = `9${value.toString().padStart(7, "0")}`.split("").map(Number);
    const sum = digits.reduce((acc, digit, index) => acc + digit * weights[index], 0);
    const remainder = sum % 11;
    const checkDigit = remainder === 0 ? 0 : 11 - remainder;

    if (checkDigit !== 10) {
      return `${digits.join("")}${checkDigit}`;
    }
  }

  throw new Error("Unable to generate a valid organization number");
}

const timestamp = Date.now();
const orgNumber = generateValidOrgNumber(timestamp % 10_000_000);
const suffix = `${timestamp}`.slice(-8);
const payload = {
  name: `Reflection Bergverk ${suffix} AS`,
  organizationNumber: orgNumber,
  email: `reflection-${suffix}@example.com`,
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

if (response.status !== 201) {
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
  customer.invoiceSendMethod === "EMAIL",
  customer.emailAttachmentType === "ATTACHMENT",
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
      invoiceSendMethod: customer.invoiceSendMethod,
      emailAttachmentType: customer.emailAttachmentType,
      postalAddress: customer.postalAddress,
    },
    null,
    2,
  ),
);
