const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const IDS = [2147527950, 2147527952, 2147528033];

async function main() {
  const out: any[] = [];
  for (const id of IDS) {
    const url = new URL(`${BASE_URL}/invoice/${id}`);
    url.searchParams.set("fields", "id,version,invoiceNumber,documentId,ehfSendStatus,changes");
    const response = await fetch(url, {
      headers: {
        Authorization: `Basic ${Buffer.from(`0:${TOKEN}`).toString("base64")}`,
        Accept: "application/json",
      },
    });
    const text = await response.text();
    const data = text ? JSON.parse(text) : null;
    out.push({ id, status: response.status, data });
  }
  console.log(JSON.stringify(out, null, 2));
}

await main();
