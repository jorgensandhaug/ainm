// Test amountGross vs amount using December 2026 date (avoid reconciled periods)
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
  const [vtRes, accRes] = await Promise.all([
    api("GET", "/ledger/voucherType?name=Lønnsbilag&count=1&fields=*"),
    api("GET", "/ledger/account?number=5000,1920&count=10&fields=*"),
  ]);
  const vtId = vtRes.data.values[0].id;
  const acc5000 = accRes.data.values.find((a: any) => a.number === 5000);
  const acc1920 = accRes.data.values.find((a: any) => a.number === 1920);
  console.log(`VT=${vtId}, 5000=${acc5000.id}, 1920=${acc1920.id}`);

  // TEST A: amount only (Dec 2026)
  console.log("\n=== TEST A: amount only ===");
  const vA = await api("POST", "/ledger/voucher?sendToLedger=true", {
    voucherType: { id: vtId },
    date: "2026-12-15",
    description: "Test: amount only",
    postings: [
      { account: { id: acc5000.id }, amount: 5000, description: "Debit", row: 1 },
      { account: { id: acc1920.id }, amount: -5000, description: "Credit", row: 2 },
    ],
  });
  if (vA.status === 201) {
    const vId = vA.data.value.id;
    const rb = await api("GET", `/ledger/voucher/${vId}?fields=*,postings(*)`);
    console.log("Postings (amount only):");
    rb.data.value.postings.forEach((p: any) => {
      console.log(`  row=${p.row} desc=${p.description} amount=${p.amount} amountGross=${p.amountGross} amountGrossCurrency=${p.amountGrossCurrency} amountCurrency=${p.amountCurrency}`);
    });
  }

  // TEST B: amountGross + amountGrossCurrency only
  console.log("\n=== TEST B: amountGross + amountGrossCurrency only ===");
  const vB = await api("POST", "/ledger/voucher?sendToLedger=true", {
    voucherType: { id: vtId },
    date: "2026-12-16",
    description: "Test: amountGross only",
    postings: [
      { account: { id: acc5000.id }, amountGross: 5000, amountGrossCurrency: 5000, description: "Debit", row: 1 },
      { account: { id: acc1920.id }, amountGross: -5000, amountGrossCurrency: -5000, description: "Credit", row: 2 },
    ],
  });
  if (vB.status === 201) {
    const vId = vB.data.value.id;
    const rb = await api("GET", `/ledger/voucher/${vId}?fields=*,postings(*)`);
    console.log("Postings (amountGross only):");
    rb.data.value.postings.forEach((p: any) => {
      console.log(`  row=${p.row} desc=${p.description} amount=${p.amount} amountGross=${p.amountGross} amountGrossCurrency=${p.amountGrossCurrency} amountCurrency=${p.amountCurrency}`);
    });
  }

  // TEST C: all fields
  console.log("\n=== TEST C: amount + amountGross + amountGrossCurrency ===");
  const vC = await api("POST", "/ledger/voucher?sendToLedger=true", {
    voucherType: { id: vtId },
    date: "2026-12-17",
    description: "Test: all amounts",
    postings: [
      { account: { id: acc5000.id }, amount: 5000, amountGross: 5000, amountGrossCurrency: 5000, description: "Debit", row: 1 },
      { account: { id: acc1920.id }, amount: -5000, amountGross: -5000, amountGrossCurrency: -5000, description: "Credit", row: 2 },
    ],
  });
  if (vC.status === 201) {
    const vId = vC.data.value.id;
    const rb = await api("GET", `/ledger/voucher/${vId}?fields=*,postings(*)`);
    console.log("Postings (all fields):");
    rb.data.value.postings.forEach((p: any) => {
      console.log(`  row=${p.row} desc=${p.description} amount=${p.amount} amountGross=${p.amountGross} amountGrossCurrency=${p.amountGrossCurrency} amountCurrency=${p.amountCurrency}`);
    });
  }

  // TEST D: voucherType by name + amountGross
  console.log("\n=== TEST D: voucherType by name + amountGross ===");
  const vD = await api("POST", "/ledger/voucher?sendToLedger=true", {
    voucherType: { name: "Lønnsbilag" },
    date: "2026-12-18",
    description: "Test: name + amountGross",
    postings: [
      { account: { id: acc5000.id }, amountGross: 7500, amountGrossCurrency: 7500, description: "Debit", row: 1 },
      { account: { id: acc1920.id }, amountGross: -7500, amountGrossCurrency: -7500, description: "Credit", row: 2 },
    ],
  });
  if (vD.status === 201) {
    const vId = vD.data.value.id;
    const rb = await api("GET", `/ledger/voucher/${vId}?fields=*,postings(*)`);
    console.log("Postings (name + amountGross):");
    rb.data.value.postings.forEach((p: any) => {
      console.log(`  row=${p.row} desc=${p.description} amount=${p.amount} amountGross=${p.amountGross} amountGrossCurrency=${p.amountGrossCurrency} amountCurrency=${p.amountCurrency}`);
    });
  }

  console.log("\n=== DONE ===");
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
