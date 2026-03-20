const baseUrl = process.env.TRIPLETEX_BASE_URL;
const token = process.env.TRIPLETEX_TOKEN;

if (!baseUrl || !token) {
  throw new Error("Missing TRIPLETEX_BASE_URL or TRIPLETEX_TOKEN");
}

function buildValidOrgNumber(seed: number): string {
  const digits = String(seed).padStart(8, "0").slice(-8).split("").map(Number);
  const weights = [3, 2, 7, 6, 5, 4, 3, 2];
  const sum = digits.reduce((acc, digit, index) => acc + digit * weights[index], 0);
  const remainder = sum % 11;
  const checkDigit = remainder === 0 ? 0 : 11 - remainder;

  if (checkDigit === 10) {
    return buildValidOrgNumber(seed + 1);
  }

  return `${digits.join("")}${checkDigit}`;
}

const now = Date.now();
const orgNumber = buildValidOrgNumber(now % 100_000_000);
const payload = {
  name: `Codex Reflection Supplier ${orgNumber}`,
  organizationNumber: orgNumber,
  email: `supplier-${orgNumber}@example.no`,
};

const auth = Buffer.from(`0:${token}`).toString("base64");
const response = await fetch(`${baseUrl}/supplier`, {
  method: "POST",
  headers: {
    Authorization: `Basic ${auth}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  },
  body: JSON.stringify(payload),
});

const text = await response.text();

if (!response.ok) {
  console.error(text);
  throw new Error(`Tripletex request failed with ${response.status}`);
}

const data = text ? JSON.parse(text) : null;
const value = data?.value;

if (
  !value ||
  value.name !== payload.name ||
  value.organizationNumber !== payload.organizationNumber ||
  value.email !== payload.email ||
  !value.ledgerAccount?.id
) {
  console.error(JSON.stringify(data, null, 2));
  throw new Error("Supplier create response missing expected fields");
}

console.log(
  JSON.stringify(
    {
      id: value.id,
      name: value.name,
      organizationNumber: value.organizationNumber,
      email: value.email,
      ledgerAccountId: value.ledgerAccount.id,
      postalAddress: value.postalAddress ?? null,
      physicalAddress: value.physicalAddress ?? null,
    },
    null,
    2,
  ),
);
