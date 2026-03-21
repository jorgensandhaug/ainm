const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H = { "Content-Type": "application/json", Authorization: AUTH };

async function get(path: string) {
  const url = `${BASE}/${path}`;
  console.log(`GET ${url}`);
  const r = await fetch(url, { headers: H });
  const body = await r.text();
  console.log(`  ${r.status} ${body.slice(0, 2000)}`);
  return { status: r.status, data: JSON.parse(body) };
}

async function main() {
  // Read back the standard time by ID (from the previous test: id=44451, employee=18674672)
  console.log("=== Read standard time by ID ===");
  await get("employee/standardTime/44451");

  // Also try with fromDate filter
  console.log("\n=== Read standard time with fromDate filter ===");
  await get("employee/standardTime?employeeIds=18674672&fromDate=2026-07-13&fields=*");

  // Try without fromDate
  console.log("\n=== Read standard time without fromDate ===");
  await get("employee/standardTime?employeeIds=18674672&count=100&fields=*");

  // Try byDate endpoint
  console.log("\n=== Read standard time byDate ===");
  await get("employee/standardTime/byDate?employeeId=18674672&date=2026-07-13&fields=*");

  // Also check the first employee (no standard time set)
  console.log("\n=== Read standard time for first employee (no stdtime) ===");
  await get("employee/standardTime?employeeIds=18674511&count=100&fields=*");

  // Try reading the salary settings standard time (company-wide) to see if there's a default
  console.log("\n=== Company-wide standard time settings ===");
  await get("salary/settings/standardTime?fields=*");
}

main().catch((e) => { console.error(e); process.exit(1); });
