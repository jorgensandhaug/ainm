const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H = { "Content-Type": "application/json", Authorization: AUTH };

async function api(method: string, path: string) {
  const url = `${BASE}/${path}`;
  const r = await fetch(url, { method, headers: H });
  const json = await r.json();
  console.log(`${method} /${path} → ${r.status}`);
  return json;
}

async function main() {
  // Employee 18664032 was created WITHOUT standard worktime setting
  // Check if it has any employee-specific standard time
  console.log("=== Employee 18664032 (NO standard time set) ===");
  const res1 = await api("GET", "employee/standardTime?employeeId=18664032&fields=*");
  console.log("Standard time:", JSON.stringify(res1.values, null, 2));
  console.log("Count:", res1.fullResultSize);

  // Employee 18664764 was created WITH standard worktime 7.5h
  console.log("\n=== Employee 18664764 (WITH standard time 7.5h) ===");
  const res2 = await api("GET", "employee/standardTime?employeeId=18664764&fields=*");
  console.log("Standard time:", JSON.stringify(res2.values, null, 2));
  console.log("Count:", res2.fullResultSize);

  // Check company-level effective standard time for the start date
  console.log("\n=== Company standard time effective at 2026-11-24 ===");
  const res3 = await api("GET", "salary/settings/standardTime/byDate?date=2026-11-24&fields=*");
  console.log("Company time:", JSON.stringify(res3, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
