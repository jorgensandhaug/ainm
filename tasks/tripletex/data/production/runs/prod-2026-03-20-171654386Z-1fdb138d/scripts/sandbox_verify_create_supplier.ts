const baseUrl = process.env.TRIPLETEX_BASE_URL;
const sessionToken = process.env.TRIPLETEX_SESSION_TOKEN;

if (!baseUrl || !sessionToken) {
  console.error("Missing TRIPLETEX_BASE_URL or TRIPLETEX_SESSION_TOKEN");
  process.exit(1);
}

const payload = {
  name: "Codex Reflection Supplier Bergvik 321654386",
  organizationNumber: "321654386",
  email: "faktura-321654386@example.no",
};

const supplierUrl = new URL("supplier", baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);

const response = await fetch(supplierUrl, {
  method: "POST",
  headers: {
    Authorization: `Basic ${Buffer.from(`0:${sessionToken}`).toString("base64")}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  },
  body: JSON.stringify(payload),
});

const text = await response.text();

if (!response.ok) {
  console.error(`Tripletex error ${response.status}: ${text}`);
  process.exit(1);
}

const body = JSON.parse(text);
const value = body?.value;

if (
  !value ||
  value.name !== payload.name ||
  value.organizationNumber !== payload.organizationNumber ||
  value.email !== payload.email
) {
  console.error(`Unexpected response body: ${text}`);
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      id: value.id,
      name: value.name,
      organizationNumber: value.organizationNumber,
      email: value.email,
      invoiceEmail: value.invoiceEmail,
      ledgerAccountId: value.ledgerAccount?.id ?? null,
      postalAddress: value.postalAddress ?? null,
      physicalAddress: value.physicalAddress ?? null,
    },
    null,
    2,
  ),
);
