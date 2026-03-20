const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const sessionToken =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const auth = `Basic ${Buffer.from(`0:${sessionToken}`).toString("base64")}`;

function url(path: string, query?: Record<string, string>) {
  const next = new URL(path.replace(/^\//, ""), `${baseUrl}/`);
  for (const [key, value] of Object.entries(query ?? {})) {
    next.searchParams.set(key, value);
  }
  return next.toString();
}

async function api<T>(path: string, query?: Record<string, string>): Promise<T> {
  const response = await fetch(url(path, query), {
    headers: {
      Authorization: auth,
      Accept: "application/json",
    },
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${path} ${JSON.stringify(body)}`);
  }
  return body as T;
}

const employees = await api<{
  values: Array<{
    id: number;
    email?: string;
    displayName?: string;
    allowInformationRegistration?: boolean;
    address?: {
      city?: string;
      addressLine1?: string;
      displayName?: string;
      addressAsString?: string;
    } | null;
    companyId?: number;
  }>;
}>("employee", {
  count: "1000",
  fields: "*",
});

const candidates = employees.values.filter(
  (employee) => employee.allowInformationRegistration === true && !employee.address && employee.companyId,
);

const results: Array<Record<string, unknown>> = [];

for (const employee of candidates.slice(0, 10)) {
  const company = await api<{ value: any }>(`company/${employee.companyId}`, {
    fields: "*,address(*)",
  });
  results.push({
    employeeId: employee.id,
    email: employee.email,
    displayName: employee.displayName,
    companyId: employee.companyId,
    companyAddress: company.value?.address ?? null,
  });
}

console.log(JSON.stringify({ candidateCount: candidates.length, results }, null, 2));
