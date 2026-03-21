const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const res = await fetch(url, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  console.log(`${method} ${path} → ${res.status}`);
  if (!res.ok) { console.log(JSON.stringify(data, null, 2)); }
  return { status: res.status, data };
}

async function main() {
  // Verify HR-rådgiver hardcoded mapping id 4169
  console.log("=== Verify occupation code id 4169 ===");
  const occRes = await api("GET", "/employee/employment/occupationCode?id=4169&fields=*");
  if (occRes.data.count > 0) {
    const occ = occRes.data.values[0];
    console.log(`id=${occ.id} nameNO=${occ.nameNO} code=${occ.code}`);
  }

  // Confirm nameNO=HR-rådgiver returns 0 results
  console.log("\n=== nameNO=HR-rådgiver (should be 0) ===");
  const hrRes = await api("GET", "/employee/employment/occupationCode?nameNO=HR-r%C3%A5dgiver&count=10&fields=id,nameNO");
  console.log(`count=${hrRes.data.count}`);

  // Confirm nameNO=personalrådgiver returns exactly 1 result (id 4169)
  console.log("\n=== nameNO=personalrådgiver (should be 1, id 4169) ===");
  const prRes = await api("GET", "/employee/employment/occupationCode?nameNO=personalr%C3%A5dgiver&count=10&fields=id,nameNO");
  console.log(`count=${prRes.data.count}`);
  if (prRes.data.count > 0) {
    for (const v of prRes.data.values) console.log(`  id=${v.id} nameNO=${v.nameNO}`);
  }

  // Test: can POST /employee with department name inline (speculative shortcut)?
  console.log("\n=== Test: department by name inline (should fail) ===");
  const specRes = await api("POST", "/employee", {
    firstName: "Test",
    lastName: "Shortcut",
    dateOfBirth: "1990-01-01",
    userType: "NO_ACCESS",
    department: { name: "TestDeptInline" },
    employments: [{ startDate: "2026-06-01" }],
  });
  console.log(`Result: ${specRes.status}`);

  console.log("\n=== Done ===");
}

main().catch((e) => { console.error(e); process.exit(1); });
