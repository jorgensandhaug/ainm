const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const token =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const auth = `Basic ${Buffer.from(`0:${token}`).toString("base64")}`;

type WrappedList<T> = { values: T[]; count?: number; fullResultSize?: number };

async function api<T>(path: string): Promise<T> {
  const res = await fetch(`${baseUrl}/${path}`, {
    headers: {
      Authorization: auth,
      Accept: "application/json",
    },
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`FAIL ${res.status} ${path}`);
    console.error(text);
    throw new Error(`Tripletex request failed: ${res.status}`);
  }
  return JSON.parse(text) as T;
}

const employeeId = 18564428;
const dateFrom = "2026-08-20";
const dateTo = "2026-08-21";

const postings = await api<WrappedList<any>>(
  `ledger/posting?dateFrom=${dateFrom}&dateTo=${dateTo}&employeeId=${employeeId}&type=WAGE&count=1000&fields=*`,
);
const vouchers = await api<WrappedList<any>>(
  `ledger/voucher?dateFrom=${dateFrom}&dateTo=${dateTo}&count=1000&fields=*`,
);

console.log(
  JSON.stringify(
    {
      postingsCount: postings.values.length,
      postings: postings.values,
      vouchersCount: vouchers.values.length,
      vouchers: vouchers.values,
    },
    null,
    2,
  ),
);
