const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const sessionToken =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const suffix = "cbae44a2";
const departments = [
  { name: `Lager Reflection ${suffix}` },
  { name: `Regnskap Reflection ${suffix}` },
  { name: `Kvalitetskontroll Reflection ${suffix}` },
];

const auth = Buffer.from(`0:${sessionToken}`).toString("base64");
const url = `${baseUrl.replace(/\/+$/, "")}/department/list`;

const response = await fetch(url, {
  method: "POST",
  headers: {
    Authorization: `Basic ${auth}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  },
  body: JSON.stringify(departments),
});

const raw = await response.text();
const body = raw ? JSON.parse(raw) : null;

if (
  response.status === 403 &&
  typeof body?.error === "string" &&
  (body.error === "Invalid or expired token" ||
    body.error.startsWith("Invalid or expired proxy token"))
) {
  throw new Error(`Blocked credentials: ${body.error}`);
}

if (!response.ok) {
  throw new Error(`HTTP ${response.status}: ${raw}`);
}

const values = Array.isArray(body?.values) ? body.values : [];
const returnedNames = values.map((value: { name?: string }) => value.name);
const expectedNames = departments.map((department) => department.name);

if (
  values.length !== departments.length ||
  expectedNames.some((name, index) => returnedNames[index] !== name)
) {
  throw new Error(`Unexpected response: ${raw}`);
}

console.log(
  JSON.stringify(
    {
      fullResultSize: body?.fullResultSize ?? null,
      values: values.map((value: { id: number; name: string }) => ({
        id: value.id,
        name: value.name,
      })),
    },
    null,
    2,
  ),
);
