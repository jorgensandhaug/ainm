const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const sessionToken =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

type IdRef = { id: number };
type Supplier = {
  id: number;
  name?: string;
  organizationNumber?: string;
  ledgerAccount?: IdRef | null;
};
type ListResponse<T> = { values?: T[]; fullResultSize?: number };

function makeUrl(path: string, params?: Record<string, string>): string {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const url = new URL(path, normalizedBase);
  for (const [key, value] of Object.entries(params ?? {})) {
    url.searchParams.append(key, value);
  }
  return url.toString();
}

async function main() {
  const response = await fetch(
    makeUrl("supplier", {
      organizationNumber: "889157917",
      fields: "*",
    }),
    {
      headers: {
        Authorization: `Basic ${Buffer.from(`0:${sessionToken}`).toString("base64")}`,
        Accept: "application/json",
      },
    },
  );
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${text}`);
  }
  const payload = JSON.parse(text) as ListResponse<Supplier>;
  console.log(JSON.stringify(payload, null, 2));
}

await main();
