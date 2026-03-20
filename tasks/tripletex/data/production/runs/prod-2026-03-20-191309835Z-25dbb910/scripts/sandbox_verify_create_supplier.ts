const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const token =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const payload = {
  name: "Bergvik Reflection Supplier 321000007",
  organizationNumber: "321000007",
  email: "faktura-321000007@bergvik.no",
  invoiceEmail: "faktura-321000007@bergvik.no",
};

function buildUrl(base: string, path: string): string {
  return new URL(path, base.endsWith("/") ? base : `${base}/`).toString();
}

async function main() {
  const response = await fetch(buildUrl(baseUrl, "supplier"), {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`0:${token}`).toString("base64")}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${text}`);
  }

  const value = data?.value;
  if (!value) {
    throw new Error(`Missing response.value: ${text}`);
  }

  for (const field of ["name", "organizationNumber", "email", "invoiceEmail"] as const) {
    if (value[field] !== payload[field]) {
      throw new Error(
        `Unexpected ${field}: expected ${JSON.stringify(payload[field])}, got ${JSON.stringify(value[field])}`
      );
    }
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
      },
      null,
      2
    )
  );
}

await main();
