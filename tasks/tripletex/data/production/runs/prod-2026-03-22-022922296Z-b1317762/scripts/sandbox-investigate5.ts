// Check employee fields for company reference + test combined query approach
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function get(path: string) {
  const r = await fetch(`${BASE}${path}`, { headers: H });
  const t = await r.text();
  console.log(`GET ${path} → ${r.status}`);
  if (!r.ok) { console.log(`  Error: ${t.slice(0,400)}`); return null; }
  return JSON.parse(t);
}

async function main() {
  // Check all fields on employee for company-related ones
  const r = await get("/employee?count=1&fields=*");
  const emp = r?.values?.[0];
  if (emp) {
    // List all top-level keys
    console.log("Employee keys:", Object.keys(emp).join(", "));
    // Check company-related fields
    for (const k of Object.keys(emp)) {
      if (k.toLowerCase().includes("company") || k.toLowerCase().includes("org")) {
        console.log(`  ${k}:`, JSON.stringify(emp[k]));
      }
    }
  }

  // Now let's think about the optimal path:
  // If we MUST do: GET employee + GET costCategory + GET paymentType + (maybe GET company) + POST + PUT deliver
  // That's 5-6 calls minimum.
  //
  // Can we reduce by combining any lookups?
  // Let's check if there's a /company endpoint that gives us the company ID without
  // needing the employee lookup first (since we know this is a single-company account)
  console.log("\n=== Test: GET /company with no filter ===");
  const compRes = await get("/company?count=1&fields=*,address(*)");
  if (compRes) {
    const comp = compRes?.values?.[0] ?? compRes?.value;
    console.log("  Company:", JSON.stringify(comp)?.slice(0,400));
  }

  // Can we use /token/session to get company info?
  console.log("\n=== Test: GET /token/session ===");
  const sessRes = await get("/token/session/>whoAmI?fields=*");
  if (sessRes) {
    console.log("  Session:", JSON.stringify(sessRes)?.slice(0,400));
  }

  // Test: GET /company without ID
  console.log("\n=== Test: GET /company (list) ===");
  const compList = await get("/company?fields=*,address(*)");
  if (compList) {
    const c = compList?.values?.[0] ?? compList?.value;
    console.log("  Company city:", c?.address?.city);
    console.log("  Company id:", c?.id);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
