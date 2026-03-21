const baseUrl = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const sessionToken = "JPABFZGlrjz_CPu-wq4MBX6hW_UrJIWFrIi9FiPzcP0";

const departments = [
  { name: "IT" },
  { name: "Kvalitetskontroll" },
  { name: "Regnskap" },
];

function unwrapResponse(json: any) {
  if (json?.values !== undefined) return json.values;
  if (json?.value !== undefined) return json.value;
  return json;
}

async function main() {
  const url = `${baseUrl.replace(/\/+$/, "")}/department/list`;
  const auth = Buffer.from(`0:${sessionToken}`).toString("base64");

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(departments),
  });

  const text = await response.text();
  const json = text ? JSON.parse(text) : null;

  if (!response.ok) {
    console.error(JSON.stringify({ status: response.status, body: json }, null, 2));
    process.exit(1);
  }

  console.log(
    JSON.stringify(
      {
        status: response.status,
        created: unwrapResponse(json),
      },
      null,
      2,
    ),
  );
}

await main();
