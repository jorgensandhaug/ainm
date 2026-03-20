const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const sessionToken =
  "REDACTED";

const payload = {
  name: "Same Pane Auto Submit Test AS",
  email: "autopane@example.no",
  organizationNumber: "999888776",
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
const body = text ? JSON.parse(text) : null;

if (response.status !== 201) {
  console.error(JSON.stringify({ status: response.status, body }, null, 2));
  process.exit(1);
}

const customer = body?.value;

if (
  customer?.name !== payload.name ||
  customer?.email !== payload.email ||
  customer?.organizationNumber !== payload.organizationNumber
) {
  console.error(JSON.stringify({ message: "Verification failed", body }, null, 2));
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      id: customer.id,
      name: customer.name,
      email: customer.email,
      organizationNumber: customer.organizationNumber,
    },
    null,
    2,
  ),
);
