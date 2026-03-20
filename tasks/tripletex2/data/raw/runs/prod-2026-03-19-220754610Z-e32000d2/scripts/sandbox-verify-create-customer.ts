const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const token =
  "REDACTED";

const weights = [3, 2, 7, 6, 5, 4, 3, 2];

function makeOrgNumber(seed: number): string {
  let candidate = seed;

  while (true) {
    const base = String(candidate).padStart(8, "1").slice(-8);
    const sum = base
      .split("")
      .reduce((acc, digit, index) => acc + Number(digit) * weights[index], 0);
    const remainder = sum % 11;
    const check = remainder === 0 ? 0 : 11 - remainder;
    if (check !== 10) {
      return `${base}${check}`;
    }
    candidate += 1;
  }
}

const ts = Date.now();
const organizationNumber = makeOrgNumber(ts % 100000000);

const payload = {
  name: `Codex Reflection Customer ${ts}`,
  organizationNumber,
  email: `codex-reflection-${ts}@example.com`,
  postalAddress: {
    addressLine1: "Sj\u00f8gata 51",
    postalCode: "9008",
    city: "Troms\u00f8",
  },
};

const auth = Buffer.from(`0:${token}`).toString("base64");

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
let data: unknown = null;

try {
  data = text ? JSON.parse(text) : null;
} catch {
  data = text;
}

if (!response.ok) {
  console.error(JSON.stringify({ status: response.status, data }, null, 2));
  process.exit(1);
}

const value = (data as { value?: Record<string, any> }).value;

if (
  !value ||
  value.name !== payload.name ||
  value.organizationNumber !== payload.organizationNumber ||
  value.email !== payload.email ||
  value.postalAddress?.addressLine1 !== payload.postalAddress.addressLine1 ||
  value.postalAddress?.postalCode !== payload.postalAddress.postalCode ||
  value.postalAddress?.city !== payload.postalAddress.city
) {
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
    },
    null,
    2,
  ),
);
