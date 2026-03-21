// Test correct field names for voucher posting amounts
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
  const acRes = await api("GET", "/ledger/account?number=5000,2050&count=10&fields=*");
  const accts = acRes.data.values || [];
  const a5000 = accts.find((a: any) => a.number === 5000);
  const a2050 = accts.find((a: any) => a.number === 2050);
  const vtRes = await api("GET", "/ledger/voucherType?name=Lønnsbilag&count=1&fields=*");
  const vt = vtRes.data.values?.[0];

  // Test 1: All four amount fields
  console.log("\n=== TEST 1: amount + amountCurrency + amountGross + amountGrossCurrency ===");
  const vRes1 = await api("POST", "/ledger/voucher?sendToLedger=true", {
    voucherType: { id: vt.id },
    date: "2026-03-21",
    description: "Test all amount fields",
    postings: [
      { account: { id: a5000.id }, amount: 34950, amountCurrency: 34950, amountGross: 34950, amountGrossCurrency: 34950, description: "Fastlønn", row: 1 },
      { account: { id: a5000.id }, amount: 15450, amountCurrency: 15450, amountGross: 15450, amountGrossCurrency: 15450, description: "Bonus", row: 2 },
      { account: { id: a2050.id }, amount: -50400, amountCurrency: -50400, amountGross: -50400, amountGrossCurrency: -50400, description: "Lønn", row: 3 },
    ],
  });
  if (vRes1.status === 201) {
    const vid = vRes1.data.value?.id;
    const readRes = await api("GET", `/ledger/voucher/${vid}?fields=*,postings(*)`);
    const rp = readRes.data.value?.postings || [];
    console.log("Read-back postings:");
    for (const p of rp) {
      console.log(`  row=${p.row} amount=${p.amount} amountGross=${p.amountGross} amountCurrency=${p.amountCurrency} amountGrossCurrency=${p.amountGrossCurrency}`);
    }
  }

  // Test 2: Just amountGross + amountGrossCurrency
  console.log("\n=== TEST 2: amountGross + amountGrossCurrency only ===");
  const vRes2 = await api("POST", "/ledger/voucher?sendToLedger=true", {
    voucherType: { id: vt.id },
    date: "2026-03-21",
    description: "Test gross fields only",
    postings: [
      { account: { id: a5000.id }, amountGross: 34950, amountGrossCurrency: 34950, description: "Fastlønn", row: 1 },
      { account: { id: a5000.id }, amountGross: 15450, amountGrossCurrency: 15450, description: "Bonus", row: 2 },
      { account: { id: a2050.id }, amountGross: -50400, amountGrossCurrency: -50400, description: "Lønn", row: 3 },
    ],
  });
  if (vRes2.status === 201) {
    const vid2 = vRes2.data.value?.id;
    const readRes2 = await api("GET", `/ledger/voucher/${vid2}?fields=*,postings(*)`);
    const rp2 = readRes2.data.value?.postings || [];
    console.log("Read-back postings:");
    for (const p of rp2) {
      console.log(`  row=${p.row} amount=${p.amount} amountGross=${p.amountGross} amountCurrency=${p.amountCurrency} amountGrossCurrency=${p.amountGrossCurrency}`);
    }
  }

  // Test 3: Just amountCurrency + amountGrossCurrency
  console.log("\n=== TEST 3: amountCurrency + amountGrossCurrency only ===");
  const vRes3 = await api("POST", "/ledger/voucher?sendToLedger=true", {
    voucherType: { id: vt.id },
    date: "2026-03-21",
    description: "Test currency fields only",
    postings: [
      { account: { id: a5000.id }, amountCurrency: 34950, amountGrossCurrency: 34950, description: "Fastlønn", row: 1 },
      { account: { id: a5000.id }, amountCurrency: 15450, amountGrossCurrency: 15450, description: "Bonus", row: 2 },
      { account: { id: a2050.id }, amountCurrency: -50400, amountGrossCurrency: -50400, description: "Lønn", row: 3 },
    ],
  });
  if (vRes3.status === 201) {
    const vid3 = vRes3.data.value?.id;
    const readRes3 = await api("GET", `/ledger/voucher/${vid3}?fields=*,postings(*)`);
    const rp3 = readRes3.data.value?.postings || [];
    console.log("Read-back postings:");
    for (const p of rp3) {
      console.log(`  row=${p.row} amount=${p.amount} amountGross=${p.amountGross} amountCurrency=${p.amountCurrency} amountGrossCurrency=${p.amountGrossCurrency}`);
    }
  }
}

main().catch(console.error);
