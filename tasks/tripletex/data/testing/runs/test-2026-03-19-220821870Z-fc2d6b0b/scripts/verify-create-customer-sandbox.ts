const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const sessionToken =
  "REDACTED";

const payload = {
  name: "Codex Reflection Verify 20260319T221101Z AS",
  email: "verify-20260319t221101z@same-agent-prompt.no",
  organizationNumber: "910000004",
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
  console.error(JSON.stringify({ status: response.status, body: data }, null, 2));
  process.exit(1);
}

const customer = data?.value;

if (
  !customer ||
  customer.name !== payload.name ||
  customer.email !== payload.email ||
  customer.organizationNumber !== payload.organizationNumber
) {
  console.error(JSON.stringify({ status: response.status, body: data }, null, 2));
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      id: customer.id,
      customerNumber: customer.customerNumber,
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
