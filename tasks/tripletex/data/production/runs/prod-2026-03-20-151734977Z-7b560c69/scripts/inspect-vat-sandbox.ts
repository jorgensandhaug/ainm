const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const auth = Buffer.from(`0:${TOKEN}`).toString("base64");

const response = await fetch(
  `${BASE_URL}/ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*`,
  {
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
    },
  },
);

const text = await response.text();

if (!response.ok) {
  throw new Error(`HTTP ${response.status} ${response.statusText}\n${text}`);
}

console.log(text);
