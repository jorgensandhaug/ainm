const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const SESSION_TOKEN =
  "REDACTED";
const AUTH = `Basic ${Buffer.from(`0:${SESSION_TOKEN}`).toString("base64")}`;

const response = await fetch(
  `${BASE_URL}/ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-19&fields=*`,
  {
    headers: {
      Authorization: AUTH,
      Accept: "application/json",
    },
  },
);

if (!response.ok) {
  throw new Error(`HTTP ${response.status} ${response.statusText}\n${await response.text()}`);
}

console.log(await response.text());
