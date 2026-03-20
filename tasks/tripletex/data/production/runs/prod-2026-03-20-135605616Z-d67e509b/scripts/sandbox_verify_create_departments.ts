const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const sessionToken =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const suffix = "reflection-20260320";
const payload = [
  { name: `Dept ${suffix} A` },
  { name: `Dept ${suffix} B` },
  { name: `Dept ${suffix} C` },
];

const auth = Buffer.from(`0:${sessionToken}`).toString("base64");

const response = await fetch(`${baseUrl}/department/list`, {
  method: "POST",
  headers: {
    Authorization: `Basic ${auth}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  },
  body: JSON.stringify(payload),
});

const bodyText = await response.text();

if (!response.ok) {
  throw new Error(`HTTP ${response.status} ${response.statusText}\n${bodyText}`);
}

const body = JSON.parse(bodyText) as {
  values?: Array<{
    id?: number;
    name?: string;
    displayName?: string;
    isInactive?: boolean;
  }>;
  fullResultSize?: number;
  count?: number;
  from?: number;
};

if (!Array.isArray(body.values) || body.values.length !== payload.length) {
  throw new Error(`Unexpected response shape: ${bodyText}`);
}

for (const [index, department] of body.values.entries()) {
  const expectedName = payload[index]?.name;
  if (
    !department.id ||
    department.name !== expectedName ||
    department.displayName !== expectedName ||
    department.isInactive !== false
  ) {
    throw new Error(`Verification failed: ${bodyText}`);
  }
}

console.log(JSON.stringify(body));
