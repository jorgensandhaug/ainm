// Investigate: what other employee fields can we set that we haven't tried?
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`\n${method} ${path} → ${r.status}`);
  if (!r.ok) console.error(JSON.stringify(json, null, 2));
  return { status: r.status, ok: r.ok, json };
}

async function main() {
  // 1. Check if employeeCategory exists / can be set
  const catSearch = await api("GET", "/employee/category?count=100&fields=*");
  console.log("Employee categories:", JSON.stringify(catSearch.json, null, 2));

  // 2. Try setting address on employee
  const empId = 18779794; // sandbox employee
  const updateAddr = await api("PUT", `/employee/${empId}`, {
    id: empId,
    version: 1,
    firstName: "TestSandbox",
    lastName: "Verify",
    dateOfBirth: "1990-01-15",
    address: {
      addressLine1: "Testgata 1",
      postalCode: "0123",
      city: "Oslo",
      country: { id: 161 }
    }
  });
  console.log("Update with address:", JSON.stringify(updateAddr.json, null, 2));

  // 3. Check what employee/employment fields we haven't explored
  // Try: maritimeEmployment, shiftDurationHours on employment details
  const detailSearch = await api("GET", `/employee/employment/details?employmentId=2889069&fields=*`);
  if (detailSearch.json?.values?.[0]) {
    const d = detailSearch.json.values[0];
    console.log("\nAll employment detail fields:");
    for (const [k, v] of Object.entries(d)) {
      console.log(`  ${k}: ${JSON.stringify(v)}`);
    }
  }

  // 4. Check if there's a salary/type endpoint that tells us salary configurations
  const salaryTypes = await api("GET", "/salary/type?employeeId=18779794&count=100&fields=*");
  console.log("Salary types for employee:", salaryTypes.json?.fullResultSize);

  // 5. Check employment - is there an employmentId field that should be set?
  const employment = await api("GET", "/employee/employment/2889069?fields=*");
  if (employment.json?.value) {
    console.log("\nAll employment fields:");
    for (const [k, v] of Object.entries(employment.json.value)) {
      console.log(`  ${k}: ${JSON.stringify(v)}`);
    }
  }

  console.log("\n=== Hypothesis investigation complete ===");
}

main().catch(e => { console.error(e); process.exit(1); });
