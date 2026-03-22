// Investigation: can we get company address via employee fields expansion?
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
  // Test 1: Can we expand company from employee?
  console.log("=== TEST 1: employee with company expansion ===");
  const r1 = await get("/employee?count=5&fields=*,company(*)");
  if (r1) {
    const emp = r1.values?.[0];
    console.log("  Company on employee:", JSON.stringify(emp?.company)?.slice(0,200));
  }

  // Test 2: Can we expand company.address from employee?
  console.log("\n=== TEST 2: employee with company.address expansion ===");
  const r2 = await get("/employee?count=5&fields=*,company(*,address(*))");
  if (r2) {
    const emp = r2.values?.[0];
    console.log("  Company:", JSON.stringify(emp?.company)?.slice(0,300));
    console.log("  Company address:", JSON.stringify(emp?.company?.address));
  }

  // Test 3: What does department look like on employee?
  console.log("\n=== TEST 3: employee department ===");
  const r3 = await get("/employee?count=5&fields=*,department(*)");
  if (r3) {
    const emp = r3.values?.[0];
    console.log("  Department:", JSON.stringify(emp?.department)?.slice(0,200));
  }

  // Test 4: Can we get costCategory and paymentType in a single query somehow?
  // No single endpoint combines them. But let's see if we need BOTH or if we can
  // hardcode one.
  // Actually, paymentType for travel expenses is almost always "Privat utlegg"
  // with showOnTravelExpenses=true. Let's see how many there are.
  console.log("\n=== TEST 4: paymentType list for travel ===");
  const r4 = await get("/travelExpense/paymentType?count=1000&fields=*");
  if (r4) {
    const travelPts = r4.values?.filter((p: any) => p.showOnTravelExpenses);
    console.log(`  Travel paymentTypes (${travelPts?.length}):`);
    for (const p of travelPts ?? []) {
      console.log(`    id=${p.id}, desc="${p.description}", isInactive=${p.isInactive}`);
    }
  }

  // Test 5: Can we get employee address by expanding address explicitly?
  console.log("\n=== TEST 5: employee with address expansion ===");
  const r5 = await get("/employee?count=5&fields=*,address(*)");
  if (r5) {
    const emp = r5.values?.[0];
    console.log("  Address:", JSON.stringify(emp?.address));
  }

  // Test 6: What does the default employee fields look like for address?
  console.log("\n=== TEST 6: employee default fields (address included in *?) ===");
  const r6 = await get("/employee?count=5&fields=*");
  if (r6) {
    const emp = r6.values?.[0];
    console.log("  Address:", JSON.stringify(emp?.address));
    console.log("  Has company field:", !!emp?.company);
    console.log("  Company:", JSON.stringify(emp?.company)?.slice(0,100));
  }
}

main().catch(e => { console.error(e); process.exit(1); });
