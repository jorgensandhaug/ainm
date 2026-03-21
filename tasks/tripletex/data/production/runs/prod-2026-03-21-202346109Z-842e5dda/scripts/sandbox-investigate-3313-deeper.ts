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
  // STYRK-08 3313 could map to STYRK-98 groups: 3432, 4121
  // Let's check ALL codes starting with 3432 and 4121

  // 3432 group codes
  console.log("=== Codes containing '3432' ===");
  const res1 = await api("GET", "employee/employment/occupationCode?code=3432&count=50&fields=id,nameNO,code");
  console.log("Results:", JSON.stringify(res1.values, null, 2));
  console.log("Full result size:", res1.fullResultSize);

  // 4121 group codes
  console.log("\n=== Codes containing '4121' ===");
  const res2 = await api("GET", "employee/employment/occupationCode?code=4121&count=50&fields=id,nameNO,code");
  console.log("Results:", JSON.stringify(res2.values, null, 2));
  console.log("Full result size:", res2.fullResultSize);

  // Also check what the mapping between STYRK-08 3313 and STYRK-98/Tripletex codes is
  // Try searching for common terms: "bokholder" (bookkeeper)
  console.log("\n=== nameNO=bokholder ===");
  const res3 = await api("GET", "employee/employment/occupationCode?nameNO=bokholder&count=10&fields=id,nameNO,code");
  console.log("Results:", JSON.stringify(res3.values, null, 2));

  // Also try "revisor" (auditor - related to accounting)
  console.log("\n=== nameNO=revisor ===");
  const res4 = await api("GET", "employee/employment/occupationCode?nameNO=revisor&count=10&fields=id,nameNO,code");
  console.log("Results:", JSON.stringify(res4.values, null, 2));

  // Try "kasserer" (cashier - STYRK 3313 subcategory)
  console.log("\n=== nameNO=kasserer ===");
  const res5 = await api("GET", "employee/employment/occupationCode?nameNO=kasserer&count=10&fields=id,nameNO,code");
  console.log("Results:", JSON.stringify(res5.values, null, 2));

  // Check if there's a direct "3313" in any nameNO
  console.log("\n=== nameNO=3313 ===");
  const res6 = await api("GET", "employee/employment/occupationCode?nameNO=3313&count=10&fields=id,nameNO,code");
  console.log("Results:", JSON.stringify(res6.values, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
