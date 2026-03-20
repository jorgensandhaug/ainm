const baseUrl = process.env.TRIPLETEX_BASE_URL;
const sessionToken = process.env.TRIPLETEX_SESSION_TOKEN;

if (!baseUrl || !sessionToken) {
  console.error("Missing TRIPLETEX_BASE_URL or TRIPLETEX_SESSION_TOKEN");
  process.exit(1);
}

const payload = {
  name: "Codex Reflection Supplier InvoiceOnly 321654388",
  organizationNumber: "321654388",
  invoiceEmail: "faktura-321654388@example.no",
};

const url = new URL("supplier", baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);

const response = await fetch(url, {
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

console.log(
  JSON.stringify(
    {
      id: value?.id ?? null,
      name: value?.name ?? null,
      organizationNumber: value?.organizationNumber ?? null,
      email: value?.email ?? null,
      invoiceEmail: value?.invoiceEmail ?? null,
    },
    null,
    2,
  ),
);
