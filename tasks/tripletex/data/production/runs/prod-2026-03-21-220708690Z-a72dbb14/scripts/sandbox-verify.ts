const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H = { "Authorization": AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  console.log(`\n${method} ${path} → ${r.status}`);
  if (!r.ok) console.log("ERROR:", text);
  return { status: r.status, data: r.ok ? JSON.parse(text) : text };
}

async function main() {
  // Test 1: POST voucher WITHOUT row fields → expect 422
  console.log("=== TEST 1: POST voucher without row field ===");
  // First get account IDs
  const accts = await api("GET", "/ledger/account?number=7360,1920&fields=id,number");
  const a7360 = accts.data.values.find((a: any) => a.number === 7360);
  const a1920 = accts.data.values.find((a: any) => a.number === 1920);
  console.log("7360 id:", a7360.id, "1920 id:", a1920.id);

  // Get existing dept
  const depts = await api("GET", "/department?name=Drift&isInactive=false&fields=id,name");
  const driftDept = depts.data.values?.find((d: any) => d.name === "Drift");
  let deptId: number;
  if (driftDept) {
    deptId = driftDept.id;
    console.log("Found dept Drift:", deptId);
  } else {
    const nd = await api("POST", "/department", { name: "Drift" });
    deptId = nd.data.value.id;
    console.log("Created dept Drift:", deptId);
  }

  const GROSS = 14050 * 1.25; // 17562.50

  // Without row
  const r1 = await api("POST", "/ledger/voucher?sendToLedger=true", {
    date: "2026-05-01",
    description: "Test no row",
    postings: [
      {
        date: "2026-05-01", description: "Test no row",
        account: { id: a7360.id }, department: { id: deptId },
        amount: GROSS, amountCurrency: GROSS, amountGross: GROSS, amountGrossCurrency: GROSS,
      },
      {
        date: "2026-05-01", description: "Test no row",
        account: { id: a1920.id },
        amount: -GROSS, amountCurrency: -GROSS, amountGross: -GROSS, amountGrossCurrency: -GROSS,
      },
    ],
  });
  console.log("Without row:", r1.status);

  // Test 2: POST voucher WITH row fields → expect 201
  console.log("\n=== TEST 2: POST voucher with row field ===");
  const r2 = await api("POST", "/ledger/voucher?sendToLedger=true", {
    date: "2026-05-02",
    description: "Test with row",
    postings: [
      {
        row: 1, date: "2026-05-02", description: "Test with row",
        account: { id: a7360.id }, department: { id: deptId },
        amount: GROSS, amountCurrency: GROSS, amountGross: GROSS, amountGrossCurrency: GROSS,
      },
      {
        row: 2, date: "2026-05-02", description: "Test with row",
        account: { id: a1920.id },
        amount: -GROSS, amountCurrency: -GROSS, amountGross: -GROSS, amountGrossCurrency: -GROSS,
      },
    ],
  });
  console.log("With row:", r2.status);
  if (r2.status === 201) {
    console.log("Voucher id:", r2.data.value.id);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
