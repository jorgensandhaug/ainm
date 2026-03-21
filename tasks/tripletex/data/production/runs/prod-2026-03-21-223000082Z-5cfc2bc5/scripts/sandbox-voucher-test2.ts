// Test voucher amount storage with a date that doesn't conflict with bank reconciliation
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + Buffer.from("0:" + TOKEN).toString("base64");
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} → ${res.status}`);
  if (res.status >= 400) console.log(JSON.stringify(json, null, 2));
  return { status: res.status, data: json };
}

async function main() {
  // Get account ids - use 5000 and 2050 (a different liability account that might not be reconciled)
  const acRes = await api("GET", "/ledger/account?number=5000,2050&count=10&fields=*");
  const accts = acRes.data.values || [];
  const a5000 = accts.find((a: any) => a.number === 5000);
  const a2050 = accts.find((a: any) => a.number === 2050);
  console.log(`Account 5000: id=${a5000?.id}, Account 2050: id=${a2050?.id}`);

  // Test 1: Voucher with voucherType:null and amount field
  console.log("\n=== TEST 1: voucherType:null + amount field ===");
  const vRes1 = await api("POST", "/ledger/voucher?sendToLedger=true", {
    voucherType: null,
    date: "2026-03-21",
    description: "Test voucher null type amount field",
    postings: [
      { account: { id: a5000.id }, amount: 50400, description: "Test debit", row: 1 },
      { account: { id: a2050.id }, amount: -50400, description: "Test credit", row: 2 },
    ],
  });
  if (vRes1.status === 201) {
    const vid = vRes1.data.value?.id;
    console.log(`Created voucher: id=${vid}`);
    const postings1 = vRes1.data.value?.postings || [];
    console.log("Creation response postings:");
    for (const p of postings1) {
      console.log(`  row=${p.row} amount=${p.amount} amountGross=${p.amountGross} amountCurrency=${p.amountCurrency} amountGrossCurrency=${p.amountGrossCurrency}`);
    }
    // Read back
    const readRes = await api("GET", `/ledger/voucher/${vid}?fields=*,postings(*)`);
    if (readRes.status === 200) {
      const rp = readRes.data.value?.postings || [];
      console.log("Read-back postings:");
      for (const p of rp) {
        console.log(`  row=${p.row} account.number=${p.account?.number} amount=${p.amount} amountGross=${p.amountGross}`);
      }
    }
  }

  // Test 2: Voucher with Lønnsbilag voucherType and amount field (like the salary path does)
  console.log("\n=== TEST 2: Lønnsbilag voucherType + amount field ===");
  const vtRes = await api("GET", "/ledger/voucherType?name=Lønnsbilag&count=1&fields=*");
  const vt = vtRes.data.values?.[0];
  console.log(`Lønnsbilag voucherType: id=${vt?.id}`);

  if (vt) {
    const vRes2 = await api("POST", "/ledger/voucher?sendToLedger=true", {
      voucherType: { id: vt.id },
      date: "2026-03-21",
      description: "Test Lønnsbilag voucher amount field",
      postings: [
        { account: { id: a5000.id }, amount: 34950, description: "Fastlønn", row: 1 },
        { account: { id: a5000.id }, amount: 15450, description: "Bonus", row: 2 },
        { account: { id: a2050.id }, amount: -50400, description: "Lønn mars", row: 3 },
      ],
    });
    if (vRes2.status === 201) {
      const vid2 = vRes2.data.value?.id;
      console.log(`Created Lønnsbilag voucher: id=${vid2}`);
      const postings2 = vRes2.data.value?.postings || [];
      console.log("Creation response postings:");
      for (const p of postings2) {
        console.log(`  row=${p.row} amount=${p.amount} amountGross=${p.amountGross}`);
      }
      // Read back
      const readRes2 = await api("GET", `/ledger/voucher/${vid2}?fields=*,postings(*)`);
      if (readRes2.status === 200) {
        const rp2 = readRes2.data.value?.postings || [];
        console.log("Read-back postings:");
        for (const p of rp2) {
          console.log(`  row=${p.row} account.number=${p.account?.number} amount=${p.amount} amountGross=${p.amountGross}`);
        }
      }
    }
  }
}

main().catch(console.error);
