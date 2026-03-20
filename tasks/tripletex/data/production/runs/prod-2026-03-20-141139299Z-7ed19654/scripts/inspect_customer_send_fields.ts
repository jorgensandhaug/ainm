const BASE_URL = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "uctBwIM0SEpWII1QvTCHzv33cDUBuut3VdDGMvetQno";
const ORG_NUMBER = "841254546";

async function main() {
  const url = new URL(`${BASE_URL}/customer`);
  url.searchParams.set("organizationNumber", ORG_NUMBER);
  url.searchParams.set("fields", "*");

  const response = await fetch(url, {
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

  const customer = (data?.values ?? [])[0];
  console.log(
    JSON.stringify(
      {
        id: customer?.id,
        name: customer?.name,
        organizationNumber: customer?.organizationNumber,
        invoiceSendMethod: customer?.invoiceSendMethod,
        email: customer?.email,
        invoiceEmail: customer?.invoiceEmail,
        postalAddress: customer?.postalAddress,
        physicalAddress: customer?.physicalAddress,
      },
      null,
      2,
    ),
  );
}

await main();
