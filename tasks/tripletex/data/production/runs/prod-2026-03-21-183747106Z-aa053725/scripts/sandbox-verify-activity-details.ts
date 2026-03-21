const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string) {
  const url = `${BASE}${path}`;
  console.log(`${method} ${url}`);
  const res = await fetch(url, { method, headers: H });
  const data = await res.json();
  return data;
}

// Check projectActivity 19804424 with expanded activity
const pa1 = await api("GET", "/project/projectActivity/19804424?fields=*,activity(*)");
console.log("\nProjectActivity 19804424:");
console.log(JSON.stringify(pa1, null, 2));

// Check projectActivity 19804425 with expanded activity
const pa2 = await api("GET", "/project/projectActivity/19804425?fields=*,activity(*)");
console.log("\nProjectActivity 19804425:");
console.log(JSON.stringify(pa2, null, 2));
