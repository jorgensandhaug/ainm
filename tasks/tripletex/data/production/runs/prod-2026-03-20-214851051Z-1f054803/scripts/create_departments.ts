const baseUrl = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const sessionToken = "DrGmjeGKQrlRobyJYZ-1av9wWXVxm2gBBvB8liD8gZg";

const departments = [
  { name: "Utvikling" },
  { name: "Innkjøp" },
  { name: "Økonomi" },
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

if (!response.ok) {
  console.error(
    JSON.stringify(
      {
        status: response.status,
        body: parsed,
      },
      null,
      2,
    ),
  );
  process.exit(1);
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
