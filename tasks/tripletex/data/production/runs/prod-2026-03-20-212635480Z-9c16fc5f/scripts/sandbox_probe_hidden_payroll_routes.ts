const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const authHeader = `Basic ${Buffer.from(`0:${TOKEN}`).toString("base64")}`;

const candidates = [
  "salary/v2/transaction?count=1&fields=*",
  "salary/v2/payment?count=1&fields=*",
  "salary/v2/type?count=1&fields=*",
  "salary/v2/modules?fields=*",
  "salary/v2/settings?fields=*",
  "salary/v2/employee?count=1&fields=*",
  "salary/v2/paymentType?count=1&fields=*",
  "salary/v2/voucher?count=1&fields=*",
  "salary/v2/voucherOverview?count=1&fields=*",
  "salary/v2/overviewData?fields=*",
  "salary/payment?count=1&fields=*",
  "salary/paymentType?count=1&fields=*",
  "salary/modules?fields=*",
  "salary/wageTransaction?count=1&fields=*",
  "salary/wagePeriodTransaction?count=1&fields=*",
  "wageTransaction?count=1&fields=*",
  "wagePeriodTransaction?count=1&fields=*",
];

async function probe(path: string) {
  const response = await fetch(`${BASE_URL}/${path}`, {
    headers: {
      Authorization: authHeader,
      Accept: "application/json",
    },
  });
  const text = await response.text();
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // Keep raw text.
  }
  return {
    path,
    status: response.status,
    ok: response.ok,
    body,
  };
}

const results = [];
for (const candidate of candidates) {
  results.push(await probe(candidate));
}

console.log(JSON.stringify(results, null, 2));
