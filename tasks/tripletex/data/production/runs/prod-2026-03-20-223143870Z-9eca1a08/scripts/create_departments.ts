const baseUrl = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const sessionToken = "zYaCWIMYS7Mbt_cF_JUU8rg1-PrSKr7hvUKiLbBpobY";

const departments = [
  { name: "Lager" },
  { name: "Økonomi" },
  { name: "Drift" },
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

const text = await response.text();
const body = text ? JSON.parse(text) : null;

if (!response.ok) {
  console.error(JSON.stringify({ status: response.status, body }, null, 2));
  process.exit(1);
}

const values = body?.values;
if (!Array.isArray(values) || values.length !== departments.length) {
  console.error(JSON.stringify({ status: response.status, body }, null, 2));
  process.exit(1);
}

const expected = new Set(departments.map((department) => department.name));
const actual = new Set(values.map((department: { name?: string }) => department.name));

if (expected.size !== actual.size || [...expected].some((name) => !actual.has(name))) {
  console.error(JSON.stringify({ status: response.status, body }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify(values, null, 2));
