const BASE_URL = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "uctBwIM0SEpWII1QvTCHzv33cDUBuut3VdDGMvetQno";
const INVOICE_ID = 2147527871;

async function main() {
  const url = new URL(`${BASE_URL}/invoice/${INVOICE_ID}/:send`);
  url.searchParams.set("sendType", "PAPER");

  const response = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Basic ${Buffer.from(`0:${TOKEN}`).toString("base64")}`,
      Accept: "application/json",
    },
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(JSON.stringify({ status: response.status, data }, null, 2));
  }

  console.log(JSON.stringify({ invoiceId: INVOICE_ID, sendType: "PAPER", status: response.status }, null, 2));
}

await main();
