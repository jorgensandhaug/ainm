const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const sessionToken =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const organizationNumber = "889157917";
const supplierName = "Elvdal AS";

type Supplier = {
  id?: number;
  name?: string;
  organizationNumber?: string;
  supplierNumber?: number;
  ledgerAccount?: { id?: number; number?: number | string } | null;
};

type ListResponse<T> = {
  values?: T[];
  fullResultSize?: number;
};

function makeUrl(path: string, params?: Record<string, string>): string {
  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const url = new URL(path, base);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.append(key, value);
    }
  }
  return url.toString();
}

async function request<T>(path: string, params?: Record<string, string>): Promise<T> {
  const response = await fetch(makeUrl(path, params), {
    headers: {
      Authorization: `Basic ${Buffer.from(`0:${sessionToken}`).toString("base64")}`,
      Accept: "application/json",
    },
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : undefined;
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${JSON.stringify(data ?? text)}`);
  }
  return data as T;
}

const result = await request<ListResponse<Supplier>>("supplier", {
  organizationNumber,
  fields: "*",
});

const matches = (result.values ?? []).filter(
  (supplier) =>
    String(supplier.organizationNumber ?? "") === organizationNumber &&
    String(supplier.name ?? "") === supplierName,
);

console.log(
  JSON.stringify(
    {
      queryOrganizationNumber: organizationNumber,
      fullResultSize: result.fullResultSize ?? null,
      values: (result.values ?? []).map((supplier) => ({
        id: supplier.id ?? null,
        name: supplier.name ?? null,
        organizationNumber: supplier.organizationNumber ?? null,
        supplierNumber: supplier.supplierNumber ?? null,
        ledgerAccountId: supplier.ledgerAccount?.id ?? null,
        ledgerAccountNumber: supplier.ledgerAccount?.number ?? null,
      })),
      exactNameOrgMatches: matches.map((supplier) => ({
        id: supplier.id ?? null,
        name: supplier.name ?? null,
        organizationNumber: supplier.organizationNumber ?? null,
        ledgerAccountId: supplier.ledgerAccount?.id ?? null,
      })),
    },
    null,
    2,
  ),
);
