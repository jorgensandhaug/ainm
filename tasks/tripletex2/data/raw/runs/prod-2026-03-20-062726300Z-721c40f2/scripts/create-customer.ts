const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const sessionToken =
  "REDACTED";

const payload = {
  name: "Random Followup Probe AS",
  email: "probe-20260320@example.no",
  organizationNumber: "999777666",
};

type CustomerResponse = {
  value?: {
    id?: number;
    name?: string;
    email?: string;
    organizationNumber?: string;
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

const created = (body as CustomerResponse)?.value;

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
      id: created.id,
      name: created.name,
      email: created.email,
      organizationNumber: created.organizationNumber,
    },
    null,
    2,
  ),
);
