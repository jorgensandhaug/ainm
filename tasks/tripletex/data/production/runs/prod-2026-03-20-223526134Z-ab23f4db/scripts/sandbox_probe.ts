const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const sessionToken =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const auth = Buffer.from(`0:${sessionToken}`).toString("base64");

function endpoint(pathAndQuery: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/${pathAndQuery}`;
}

async function get(pathAndQuery: string) {
  const res = await fetch(endpoint(pathAndQuery), {
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
    },
  });
  const text = await res.text();
  let data: any = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
  }
  console.log(JSON.stringify({ pathAndQuery, status: res.status, data }));
}

await get("customer?organizationNumber=970769994&fields=*");
await get("product?productNumber=3237&productNumber=4609&fields=*");
await get("customer?organizationNumber=975687821&fields=*");
await get("product?productNumber=4366&productNumber=3402&fields=*");
