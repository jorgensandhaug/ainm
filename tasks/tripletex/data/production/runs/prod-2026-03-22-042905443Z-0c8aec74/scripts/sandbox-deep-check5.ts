const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H = { "Content-Type": "application/json", Authorization: AUTH };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}/${path}`;
  const opts: RequestInit = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  if (!r.ok) {
    console.log(`${method} ${path} → ${r.status}: ${text.substring(0, 500)}`);
    return null;
  }
  return JSON.parse(text);
}

async function main() {
  // Get full employment details with ALL fields for emp 18736763 (NOT_CHOSEN)
  console.log("=== FULL employment details (fields=*) ===");
  const details = await api("GET", "employee/employment/details?employmentId=2868689&fields=*");
  if (details?.values?.[0]) {
    const d = details.values[0];
    for (const [k, v] of Object.entries(d)) {
      console.log(`  ${k}:`, JSON.stringify(v));
    }
  }

  // Get full employee object with ALL fields
  console.log("\n=== FULL employee object (fields=*) ===");
  const emp = await api("GET", "employee/18736763?fields=*");
  if (emp?.value) {
    for (const [k, v] of Object.entries(emp.value)) {
      if (k === "employments") {
        console.log(`  employments: (array of ${(v as any[]).length})`);
        for (const e of v as any[]) {
          console.log(`    employment:`, JSON.stringify(e));
        }
      } else {
        console.log(`  ${k}:`, JSON.stringify(v));
      }
    }
  }

  // Get employment object
  console.log("\n=== FULL employment object (fields=*) ===");
  const employment = await api("GET", "employee/employment?employeeId=18736763&fields=*");
  if (employment?.values?.[0]) {
    for (const [k, v] of Object.entries(employment.values[0])) {
      console.log(`  ${k}:`, JSON.stringify(v));
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
