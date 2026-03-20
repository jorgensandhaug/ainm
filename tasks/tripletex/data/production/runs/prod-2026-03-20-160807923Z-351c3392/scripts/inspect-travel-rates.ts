const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const token =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const auth = Buffer.from(`0:${token}`).toString("base64");

async function api(path: string) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
    },
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${path}\n${text}`);
  }
  return data;
}

const rates = await api(
  "/travelExpense/rate?type=PER_DIEM&isValidDomestic=true&dateFrom=2026-03-16&dateTo=2026-03-20&count=1000&fields=*",
);

const categories = await api(
  "/travelExpense/rateCategory?type=PER_DIEM&isValidDomestic=true&dateFrom=2026-03-16&dateTo=2026-03-20&count=1000&fields=*",
);

console.log(JSON.stringify({ rates, categories }, null, 2));
