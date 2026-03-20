const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const sessionToken =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const departments = [
  { name: "Sandbox dept 214851051Z A" },
  { name: "Sandbox dept 214851051Z B" },
  { name: "Sandbox dept 214851051Z C" },
];

const auth = Buffer.from(`0:${sessionToken}`).toString("base64");
const url = new URL("department/list", `${baseUrl}/`);

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
let parsed: unknown = raw;

try {
  parsed = raw ? JSON.parse(raw) : null;
} catch {
  parsed = raw;
}

console.log(
  JSON.stringify(
    {
      status: response.status,
      body: parsed,
    },
    null,
    2,
  ),
);

if (!response.ok) {
  process.exit(1);
}
