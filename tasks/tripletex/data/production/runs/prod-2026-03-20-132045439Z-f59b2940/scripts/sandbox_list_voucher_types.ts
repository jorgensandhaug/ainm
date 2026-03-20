const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

async function main() {
  const response = await fetch(
    `${BASE_URL}/ledger/voucherType?fields=*&count=1000`,
    {
      headers: {
        Authorization: `Basic ${Buffer.from(`0:${TOKEN}`).toString("base64")}`,
        Accept: "application/json",
      },
    },
  );

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}\n${text}`);
  }

  const data = JSON.parse(text) as { values?: any[] };
  console.log(JSON.stringify(data.values ?? [], null, 2));
}

await main();
