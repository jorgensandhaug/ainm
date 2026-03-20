const baseUrl = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const sessionToken = "hCx_qH9VXK8VJe9182SSUiicbVdEcpjVPZAK1lOo-ss";
const accountId = 363115521;
const bankAccountNumber = "12345678903";

const authHeader = `Basic ${Buffer.from(`0:${sessionToken}`).toString("base64")}`;

const main = async () => {
  const response = await fetch(new URL(`ledger/account/${accountId}`, `${baseUrl}/`), {
    method: "PUT",
    headers: {
      Authorization: authHeader,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ bankAccountNumber }),
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : {};

  if (!response.ok) {
    throw new Error(JSON.stringify({ status: response.status, body }, null, 2));
  }

  console.log(JSON.stringify(body, null, 2));
};

await main();
