const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const sessionToken =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const departments = [
  { name: "IT Reflection 20260321-134807" },
  { name: "Kvalitetskontroll Reflection 20260321-134807" },
  { name: "Regnskap Reflection 20260321-134807" },
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

  console.log(
    JSON.stringify(
      {
        status: response.status,
        body: json,
        unwrapped: unwrapResponse(json),
      },
      null,
      2,
    ),
  );

  if (!response.ok) process.exit(1);
}

await main();
