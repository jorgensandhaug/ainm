// Sandbox verification: test dept-by-name trap + full Branch A on a date without bank reconciliation
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} → ${r.status}`);
  if (!r.ok) console.log("ERROR:", JSON.stringify(json).slice(0, 500));
  return { status: r.status, data: json };
}

async function main() {
  const acctId7360 = 424191174;
  const acctId1920 = 424190862;

  // Test: department by name on voucher posting (expected: silently null)
  console.log("=== TEST: dept by name on posting (no dept POST, just inline name) ===");

  // First find an existing department to test with
  const deptGet = await api("GET", "/department?isInactive=false&fields=id,name&count=5");
  console.log("Existing depts:", JSON.stringify(deptGet.data.values?.map((d:any) => ({id: d.id, name: d.name}))));
  const existingDept = deptGet.data.values?.[0];
  if (!existingDept) { console.log("No departments found"); return; }

  // Create voucher with department by name (should silently store null)
  const vByName = await api("POST", "/ledger/voucher?sendToLedger=true", {
    date: "2026-03-22",
    description: "Test dept-by-name reflection",
    postings: [
      {
        row: 1, date: "2026-03-22", description: "Test",
        account: { id: acctId7360 },
        department: { name: existingDept.name },
        amount: 25, amountCurrency: 25, amountGross: 25, amountGrossCurrency: 25,
      },
      {
        row: 2, date: "2026-03-22", description: "Test",
        account: { id: acctId1920 },
        amount: -25, amountCurrency: -25, amountGross: -25, amountGrossCurrency: -25,
      },
    ],
  });

  if (vByName.status === 201) {
    const vid = vByName.data.value.id;
    const rb = await api("GET", `/ledger/voucher/${vid}?fields=id,postings(department(id,name))`);
    const dept = rb.data.value.postings?.[0]?.department;
    console.log(`dept-by-name readback: department=${JSON.stringify(dept)}`);
    console.log(`RESULT: ${dept?.id ? 'name-based WORKS (unexpected!)' : 'name-based SILENTLY NULL (confirmed — must use { id })'}`);
  }

  // Create voucher with department by ID (should work)
  console.log("\n=== TEST: dept by ID on posting ===");
  const vById = await api("POST", "/ledger/voucher?sendToLedger=true", {
    date: "2026-03-22",
    description: "Test dept-by-id reflection",
    postings: [
      {
        row: 1, date: "2026-03-22", description: "Test",
        account: { id: acctId7360 },
        department: { id: existingDept.id },
        amount: 30, amountCurrency: 30, amountGross: 30, amountGrossCurrency: 30,
      },
      {
        row: 2, date: "2026-03-22", description: "Test",
        account: { id: acctId1920 },
        amount: -30, amountCurrency: -30, amountGross: -30, amountGrossCurrency: -30,
      },
    ],
  });

  if (vById.status === 201) {
    const vid = vById.data.value.id;
    const rb = await api("GET", `/ledger/voucher/${vid}?fields=id,postings(department(id,name))`);
    const dept = rb.data.value.postings?.[0]?.department;
    console.log(`dept-by-id readback: department=${JSON.stringify(dept)}`);
    console.log(`RESULT: ${dept?.id ? 'id-based WORKS (id=' + dept.id + ' name=' + dept.name + ')' : 'id-based FAILED (unexpected!)'}`);
  }

  console.log("\n=== CONCLUSIONS ===");
  console.log("1. account: { number } → 422 (confirmed in test 1)");
  console.log("2. department: { name } → silently null (confirmed above if applicable)");
  console.log("3. Both traps mean GET /ledger/account AND POST/GET /department are REQUIRED");
  console.log("4. Minimum scored calls for Branch A: 3 (POST dept, POST voucher, POST attachment)");
  console.log("5. Free calls: GET accounts, GET verify voucher, GET verify attachment");
  console.log("6. The production run achieved this minimum. No optimization possible.");
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
