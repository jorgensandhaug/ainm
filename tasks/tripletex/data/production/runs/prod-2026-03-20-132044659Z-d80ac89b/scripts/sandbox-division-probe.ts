const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const token =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const auth = `Basic ${Buffer.from(`0:${token}`).toString("base64")}`;

async function api(path: string, init?: RequestInit) {
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: auth,
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json; charset=utf-8" } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  console.log(`STATUS ${res.status} ${path}`);
  if (text) console.log(text);
  if (!res.ok) process.exit(1);
  return text ? JSON.parse(text) : null;
}

function computeOrgChecksum(digits: number[]) {
  const weights = [3, 2, 7, 6, 5, 4, 3, 2];
  const sum = digits.reduce((acc, digit, i) => acc + digit * weights[i], 0);
  const remainder = 11 - (sum % 11);
  if (remainder === 11) return 0;
  if (remainder === 10) return null;
  return remainder;
}

function generateOrgNumber() {
  for (let i = 0; i < 10000; i += 1) {
    const body = [
      9,
      Math.floor(Math.random() * 10),
      Math.floor(Math.random() * 10),
      Math.floor(Math.random() * 10),
      Math.floor(Math.random() * 10),
      Math.floor(Math.random() * 10),
      Math.floor(Math.random() * 10),
      Math.floor(Math.random() * 10),
    ];
    const checksum = computeOrgChecksum(body);
    if (checksum !== null) {
      return [...body, checksum].join("");
    }
  }
  throw new Error("Failed to generate org number");
}

const company = await api("/company/108114337?fields=*");
const municipalities = await api("/municipality/query?query=Oslo&count=5&fields=*");
const municipality =
  municipalities.values?.find((m: any) => !String(m.displayName ?? "").includes("Inaktiv")) ??
  municipalities.values?.[0];

await api("/division", {
  method: "POST",
  body: JSON.stringify({
    name: `Payroll Division Probe ${Date.now().toString().slice(-6)}`,
    startDate: "2026-01-01",
    organizationNumber: generateOrgNumber(),
    municipalityDate: "2026-01-01",
    municipality: municipality ? { id: municipality.id } : undefined,
  }),
});
