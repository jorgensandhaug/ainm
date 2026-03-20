const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN =
  "REDACTED";

const suffix = Date.now().toString().slice(-6);
const organizationNumber = `9${suffix}${suffix.slice(0, 2)}`;
const payload = {
  name: `Reflection Learning ${suffix} AS`,
  email: `post+${suffix}@reflection-learning.no`,
  organizationNumber,
};

const auth = `Basic ${Buffer.from(`0:${TOKEN}`).toString("base64")}`;

type Customer = {
  id: number;
  name?: string;
  email?: string;
  organizationNumber?: string;
  invoiceSendMethod?: string;
  emailAttachmentType?: string;
};

const response = await fetch(`${BASE_URL}/customer`, {
  method: "POST",
  headers: {
    Accept: "application/json",
    Authorization: auth,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(payload),
});

const text = await response.text();
const body = text ? JSON.parse(text) : null;

if (!response.ok) {
  console.error(JSON.stringify({ status: response.status, body }, null, 2));
  process.exit(1);
}

const customer = (body?.value ?? null) as Customer | null;

if (
  !customer ||
  customer.name !== payload.name ||
  customer.email !== payload.email ||
  customer.organizationNumber !== payload.organizationNumber
) {
  console.error(
    JSON.stringify(
      {
        error: "Unexpected response payload",
        payload,
        customer,
      },
      null,
      2,
    ),
  );
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      verified: true,
      payload,
      customer: {
        id: customer.id,
        name: customer.name,
        email: customer.email,
        organizationNumber: customer.organizationNumber,
        invoiceSendMethod: customer.invoiceSendMethod,
        emailAttachmentType: customer.emailAttachmentType,
      },
    },
    null,
    2,
  ),
);
