const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const sessionToken =
  "REDACTED";

const uniqueDigits = Date.now().toString().slice(-8);
const organizationNumber = `9${uniqueDigits}`;
const email = `reflection-${uniqueDigits}@example.no`;
const name = `Reflection Learning ${uniqueDigits} AS`;

const payload = {
  name,
  email,
  organizationNumber,
};

type CustomerResponse = {
  value?: {
    id?: number;
    name?: string;
    email?: string;
    organizationNumber?: string;
    invoiceSendMethod?: string;
    emailAttachmentType?: string;
  };
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
const body: CustomerResponse | Record<string, unknown> | null = text
  ? JSON.parse(text)
  : null;

if (response.status !== 201) {
  console.error(JSON.stringify({ status: response.status, body }, null, 2));
  process.exit(1);
}

const created = (body as CustomerResponse).value;

if (
  !created ||
  created.name !== payload.name ||
  created.email !== payload.email ||
  created.organizationNumber !== payload.organizationNumber
) {
  console.error(JSON.stringify({ status: response.status, body }, null, 2));
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      status: response.status,
      id: created.id,
      name: created.name,
      email: created.email,
      organizationNumber: created.organizationNumber,
      invoiceSendMethod: created.invoiceSendMethod,
      emailAttachmentType: created.emailAttachmentType,
    },
    null,
    2,
  ),
);
