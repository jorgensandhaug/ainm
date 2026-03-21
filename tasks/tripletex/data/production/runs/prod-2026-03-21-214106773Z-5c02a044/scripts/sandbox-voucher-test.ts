const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const headers: Record<string, string> = { Authorization: AUTH, "Content-Type": "application/json" };

async function get(path: string) {
  const url = `${BASE}/${path}`;
  const r = await fetch(url, { headers });
  const j = await r.json();
  return j;
}

async function post(path: string, body: any) {
  const url = `${BASE}/${path}`;
  console.log("POST", url);
  const r = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  const j = await r.json();
  console.log("  ->", r.status, JSON.stringify(j).slice(0, 1000));
  return { status: r.status, data: j, ok: r.ok };
}

async function main() {
  // Get accounts
  const acctRes = await get("ledger/account?number=1920,2400,2600,7770,8050&fields=*");
  const accounts = acctRes.values || [];
  const acctMap: Record<number, number> = {};
  for (const a of accounts) acctMap[a.number] = a.id;
  console.log("Account map:", acctMap);

  // Get suppliers
  const supRes = await get("supplier?count=10&fields=id,name");
  const suppliers = supRes.values || [];
  console.log("Suppliers:", suppliers.map((s: any) => `${s.id}:${s.name}`).join(", "));

  const suppId = suppliers[0]?.id;
  if (!suppId) { console.log("No suppliers found"); return; }

  // Test 1: Voucher with only amountGross fields (current approach)
  console.log("\n=== Test 1: amountGross only (current approach) ===");
  const v1 = await post("ledger/voucher", {
    date: "2026-01-25",
    description: "Test voucher - amountGross only",
    postings: [
      { row: 1, date: "2026-01-25", description: "Test supplier payment", account: { id: acctMap[2400] }, amountGross: 1000, amountGrossCurrency: 1000, supplier: { id: suppId } },
      { row: 2, date: "2026-01-25", description: "Test supplier payment", account: { id: acctMap[1920] }, amountGross: -1000, amountGrossCurrency: -1000 },
    ],
  });

  // Test 2: Voucher with ALL 4 amount fields
  console.log("\n=== Test 2: All 4 amount fields ===");
  const v2 = await post("ledger/voucher", {
    date: "2026-01-25",
    description: "Test voucher - all amount fields",
    postings: [
      { row: 1, date: "2026-01-25", description: "Test supplier payment 2", account: { id: acctMap[2400] }, amount: 1000, amountCurrency: 1000, amountGross: 1000, amountGrossCurrency: 1000, supplier: { id: suppId } },
      { row: 2, date: "2026-01-25", description: "Test supplier payment 2", account: { id: acctMap[1920] }, amount: -1000, amountCurrency: -1000, amountGross: -1000, amountGrossCurrency: -1000 },
    ],
  });

  // Now read back both vouchers and compare their postings
  if (v1.ok && v2.ok) {
    const id1 = v1.data.value?.id;
    const id2 = v2.data.value?.id;
    console.log("\n=== Compare voucher postings ===");

    const vd1 = await get(`ledger/voucher/${id1}?fields=*`);
    const vd2 = await get(`ledger/voucher/${id2}?fields=*`);

    console.log("\nVoucher 1 (amountGross only):");
    for (const p of (vd1.value?.postings || [])) {
      console.log(`  Row ${p.row}: amount=${p.amount} amountCurrency=${p.amountCurrency} amountGross=${p.amountGross} amountGrossCurrency=${p.amountGrossCurrency}`);
    }

    console.log("\nVoucher 2 (all fields):");
    for (const p of (vd2.value?.postings || [])) {
      console.log(`  Row ${p.row}: amount=${p.amount} amountCurrency=${p.amountCurrency} amountGross=${p.amountGross} amountGrossCurrency=${p.amountGrossCurrency}`);
    }
  }
}

main().catch(e => console.error("FATAL:", e.message));
