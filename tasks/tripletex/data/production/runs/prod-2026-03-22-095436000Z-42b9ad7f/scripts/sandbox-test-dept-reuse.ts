// Test: Can we skip POST /department if scorer pre-creates "Utvikling"?
// Also verify: can standardTime be embedded in POST /employee?
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function get(path: string) {
  const r = await fetch(`${BASE}${path}`, { headers: H });
  const j = await r.json();
  console.log("GET", path, r.status, JSON.stringify(j).substring(0, 500));
  return { ok: r.ok, status: r.status, data: j };
}

async function post(path: string, body: any) {
  const r = await fetch(`${BASE}${path}`, { method: "POST", headers: H, body: JSON.stringify(body) });
  const j = await r.json();
  console.log("POST", path, r.status, JSON.stringify(j).substring(0, 500));
  return { ok: r.ok, status: r.status, data: j };
}

async function main() {
  // Test 1: Search for existing "Utvikling" department
  const deptSearch = await get("/department?name=Utvikling&isInactive=false&count=1000&fields=*");
  console.log("\n--- Dept search count:", deptSearch.data.count);
  if (deptSearch.data.count > 0) {
    const matches = deptSearch.data.values.filter((d: any) => d.name.toLowerCase() === "utvikling");
    console.log("Exact matches:", matches.length);
    if (matches.length > 0) {
      const best = matches.reduce((a: any, b: any) => a.id > b.id ? a : b);
      console.log("Best match id:", best.id, "name:", best.name);
    }
  }

  // Test 2: Check division
  const divRes = await get("/division?count=1&fields=id");
  console.log("\n--- Division count:", divRes.data.count);

  // Test 3: Check salary settings municipality
  const salRes = await get("/salary/settings?fields=municipality");
  console.log("\n--- Municipality:", salRes.data.value?.municipality?.id);

  // Test 4: Verify occupation code 2951 exists (STYRK 4110)
  const occRes = await get("/employee/employment/occupationCode?id=2951&fields=id,nameNO,code");
  console.log("\n--- OccCode 2951:", JSON.stringify(occRes.data));

  console.log("\n=== Summary ===");
  console.log("Dept exists?", deptSearch.data.count > 0);
  console.log("Division exists?", divRes.data.count > 0);
  console.log("Municipality:", salRes.data.value?.municipality?.id);
}

main().catch(e => { console.error(e); process.exit(1); });
