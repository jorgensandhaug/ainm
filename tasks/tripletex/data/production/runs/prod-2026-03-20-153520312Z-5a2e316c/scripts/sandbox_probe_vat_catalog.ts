const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const sessionToken =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const auth = `Basic ${Buffer.from(`0:${sessionToken}`).toString("base64")}`;

async function request(path: string): Promise<unknown> {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: {
      Authorization: auth,
      Accept: "application/json",
    },
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(JSON.stringify({ status: response.status, path, body: data }, null, 2));
  }

  return data;
}

const broad = (await request("/ledger/vatType?fields=*")) as { values?: Array<Record<string, unknown>> };
const fifteen = (broad.values ?? [])
  .filter((value) => Number(value.percentage) === 15)
  .map((value) => ({
    id: value.id,
    number: value.number,
    name: value.name,
    displayName: value.displayName,
    percentage: value.percentage,
    parentType: value.parentType,
  }));

console.log(JSON.stringify({ fifteenPercentVatTypes: fifteen }, null, 2));
