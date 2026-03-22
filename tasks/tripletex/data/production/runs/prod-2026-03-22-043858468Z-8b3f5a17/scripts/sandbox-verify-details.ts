const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string) {
  const url = `${BASE}${path}`;
  const res = await fetch(url, { method, headers: H });
  const text = await res.text();
  return JSON.parse(text);
}

async function main() {
  // Get the employment details for the employee created above
  const details = await api("GET", "/employee/employment/details?employmentId=2869237&fields=*");
  console.log("Employment details:");
  for (const d of details.values) {
    console.log(JSON.stringify(d, null, 2));
  }
}

main().catch(e => { console.error(e); process.exit(1); });
