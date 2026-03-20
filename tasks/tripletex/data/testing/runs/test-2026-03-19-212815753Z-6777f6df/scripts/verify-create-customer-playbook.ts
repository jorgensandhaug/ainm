const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const sessionToken =
  "REDACTED";

function generateValidOrgNumber(seed: number): string {
  const digits = String(seed).padStart(8, "0").slice(-8).split("").map(Number);
  const weights = [3, 2, 7, 6, 5, 4, 3, 2];
  const weightedSum = digits.reduce((sum, digit, index) => sum + digit * weights[index], 0);
  const remainder = weightedSum % 11;
  const checksum = remainder === 0 ? 0 : 11 - remainder;

  if (checksum === 10) {
    return generateValidOrgNumber(seed + 1);
  }

  return `${digits.join("")}${checksum}`;
}

const suffix = Date.now();
const payload = {
  name: `Playbook Verification AS ${suffix}`,
  email: `playbook-${suffix}@example.no`,
  organizationNumber: generateValidOrgNumber(suffix),
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

if (response.status !== 201) {
  throw new Error(`Expected 201, got ${response.status}: ${text}`);
}

const customer = (data as { value?: Record<string, unknown> } | null)?.value;

if (!customer) {
  throw new Error(`Missing response value: ${text}`);
}

if (
  customer.name !== payload.name ||
  customer.email !== payload.email ||
  customer.organizationNumber !== payload.organizationNumber
) {
  throw new Error(`Returned customer fields do not match payload: ${JSON.stringify(customer)}`);
}

console.log(
  JSON.stringify(
    {
      id: customer.id,
      name: customer.name,
      email: customer.email,
      organizationNumber: customer.organizationNumber,
      invoiceSendMethod: customer.invoiceSendMethod,
      emailAttachmentType: customer.emailAttachmentType,
    },
    null,
    2,
  ),
);
