const baseUrl = process.env.TRIPLETEX_BASE_URL;
const sessionToken = process.env.TRIPLETEX_SESSION_TOKEN;

if (!baseUrl || !sessionToken) {
  console.error("Missing TRIPLETEX_BASE_URL or TRIPLETEX_SESSION_TOKEN");
  process.exit(1);
}

const supplierPayload = {
  name: "Bergvik AS",
  organizationNumber: "852000139",
  email: "faktura@bergvik.no",
};

const normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
const supplierUrl = new URL("supplier", normalizedBaseUrl);

const response = await fetch(supplierUrl, {
  method: "POST",
  headers: {
    Authorization: `Basic ${Buffer.from(`0:${sessionToken}`).toString("base64")}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  },
  body: JSON.stringify(supplierPayload),
});

const responseText = await response.text();

if (!response.ok) {
  if (
    response.status === 403 &&
    responseText.includes("Invalid or expired token")
  ) {
    console.error("Blocked: invalid or expired Tripletex token");
    process.exit(1);
  }

  console.error(`Tripletex error ${response.status}: ${responseText}`);
  process.exit(1);
}

const parsed = responseText ? JSON.parse(responseText) : null;
const created = parsed?.value;

if (
  !created ||
  created.name !== supplierPayload.name ||
  created.organizationNumber !== supplierPayload.organizationNumber ||
  created.email !== supplierPayload.email
) {
  console.error(`Unexpected response: ${responseText}`);
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      id: created.id,
      name: created.name,
      organizationNumber: created.organizationNumber,
      email: created.email,
    },
    null,
    2,
  ),
);
