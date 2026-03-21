// Verify: Does POST /ledger/voucher need amountGross/amountGrossCurrency, or is amount sufficient?
// Also: Full 8-call path proof with amountGross

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
  console.log(`${method} ${path} → ${r.status}`);
  if (r.status >= 400) console.log(JSON.stringify(json, null, 2));
  return { status: r.status, data: json };
}

async function main() {
  // Get voucherType and accounts
  const [vtRes, accRes] = await Promise.all([
    api("GET", "/ledger/voucherType?name=Lønnsbilag&count=1&fields=*"),
    api("GET", "/ledger/account?number=5000,1920&count=10&fields=*"),
  ]);
  const vtId = vtRes.data.values[0].id;
  const acc5000 = accRes.data.values.find((a: any) => a.number === 5000);
  const acc1920 = accRes.data.values.find((a: any) => a.number === 1920);

  // TEST A: Voucher with ONLY `amount` field (no amountGross)
  console.log("\n=== TEST A: Voucher with only `amount` ===");
  const vA = await api("POST", "/ledger/voucher?sendToLedger=true", {
    voucherType: { id: vtId },
    date: "2026-06-15",
    description: "Test: amount only",
    postings: [
      { account: { id: acc5000.id }, amount: 5000, description: "Debit", row: 1 },
      { account: { id: acc1920.id }, amount: -5000, description: "Credit", row: 2 },
    ],
  });
  if (vA.status === 201) {
    const vId = vA.data.value.id;
    // Read it back to see what was stored
    const readback = await api("GET", `/ledger/voucher/${vId}?fields=*,postings(*)`);
    console.log("Postings stored:");
    readback.data.value.postings.forEach((p: any) => {
      console.log(`  row=${p.row} amount=${p.amount} amountGross=${p.amountGross} amountGrossCurrency=${p.amountGrossCurrency} amountCurrency=${p.amountCurrency}`);
    });
  }

  // TEST B: Voucher with `amountGross` and `amountGrossCurrency`
  console.log("\n=== TEST B: Voucher with amountGross + amountGrossCurrency ===");
  const vB = await api("POST", "/ledger/voucher?sendToLedger=true", {
    voucherType: { id: vtId },
    date: "2026-06-16",
    description: "Test: amountGross",
    postings: [
      { account: { id: acc5000.id }, amountGross: 5000, amountGrossCurrency: 5000, description: "Debit", row: 1 },
      { account: { id: acc1920.id }, amountGross: -5000, amountGrossCurrency: -5000, description: "Credit", row: 2 },
    ],
  });
  if (vB.status === 201) {
    const vId = vB.data.value.id;
    const readback = await api("GET", `/ledger/voucher/${vId}?fields=*,postings(*)`);
    console.log("Postings stored:");
    readback.data.value.postings.forEach((p: any) => {
      console.log(`  row=${p.row} amount=${p.amount} amountGross=${p.amountGross} amountGrossCurrency=${p.amountGrossCurrency} amountCurrency=${p.amountCurrency}`);
    });
  }

  // TEST C: Voucher with both `amount` AND `amountGross`
  console.log("\n=== TEST C: Voucher with amount + amountGross + amountGrossCurrency ===");
  const vC = await api("POST", "/ledger/voucher?sendToLedger=true", {
    voucherType: { id: vtId },
    date: "2026-06-17",
    description: "Test: all amount fields",
    postings: [
      { account: { id: acc5000.id }, amount: 5000, amountGross: 5000, amountGrossCurrency: 5000, description: "Debit", row: 1 },
      { account: { id: acc1920.id }, amount: -5000, amountGross: -5000, amountGrossCurrency: -5000, description: "Credit", row: 2 },
    ],
  });
  if (vC.status === 201) {
    const vId = vC.data.value.id;
    const readback = await api("GET", `/ledger/voucher/${vId}?fields=*,postings(*)`);
    console.log("Postings stored:");
    readback.data.value.postings.forEach((p: any) => {
      console.log(`  row=${p.row} amount=${p.amount} amountGross=${p.amountGross} amountGrossCurrency=${p.amountGrossCurrency} amountCurrency=${p.amountCurrency}`);
    });
  }

  // TEST D: Voucher by NAME (voucherType: { name: "Lønnsbilag" }) with amountGross
  console.log("\n=== TEST D: voucherType by name + amountGross ===");
  const vD = await api("POST", "/ledger/voucher?sendToLedger=true", {
    voucherType: { name: "Lønnsbilag" },
    date: "2026-06-18",
    description: "Test: name + amountGross",
    postings: [
      { account: { id: acc5000.id }, amountGross: 7500, amountGrossCurrency: 7500, description: "Debit", row: 1 },
      { account: { id: acc1920.id }, amountGross: -7500, amountGrossCurrency: -7500, description: "Credit", row: 2 },
    ],
  });
  if (vD.status === 201) {
    const vId = vD.data.value.id;
    const readback = await api("GET", `/ledger/voucher/${vId}?fields=*,postings(*)`);
    console.log("Postings stored:");
    readback.data.value.postings.forEach((p: any) => {
      console.log(`  row=${p.row} amount=${p.amount} amountGross=${p.amountGross} amountGrossCurrency=${p.amountGrossCurrency} amountCurrency=${p.amountCurrency}`);
    });
  }

  console.log("\n=== ALL TESTS COMPLETE ===");
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
