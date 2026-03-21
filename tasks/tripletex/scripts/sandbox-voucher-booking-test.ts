// Test whether POST /ledger/voucher creates booked or unbooked vouchers
// and whether sendToLedger=true is needed for direct voucher creation

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };
const SUFFIX = `VB-${Date.now()}`;

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: RequestInit = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  if (!r.ok) {
    console.log(`${method} ${path} → ${r.status}: ${text.slice(0, 400)}`);
    return { ok: false, status: r.status, error: text };
  }
  return { ok: true, status: r.status, data: JSON.parse(text) };
}

async function main() {
  // Get account IDs first
  const acctR = await api("GET", "/ledger/account?number=6300,1920&fields=id,number,name");
  const accts: Record<number, number> = {};
  for (const a of acctR.data?.values || []) {
    accts[a.number] = a.id;
  }
  console.log(`Accounts: 6300=${accts[6300]}, 1920=${accts[1920]}`);

  // ============================================================
  // TEST 1: POST /ledger/voucher WITHOUT sendToLedger param
  // ============================================================
  console.log("\n========== TEST 1: POST /ledger/voucher (no sendToLedger) ==========\n");
  const v1 = await api("POST", "/ledger/voucher", {
    date: "2026-03-21",
    description: `Test1-NoSendToLedger-${SUFFIX}`,
    postings: [
      { row: 1, account: { id: accts[6300] }, amount: 10000, amountCurrency: 10000, amountGross: 10000, amountGrossCurrency: 10000, description: "Test debit" },
      { row: 2, account: { id: accts[1920] }, amount: -10000, amountCurrency: -10000, amountGross: -10000, amountGrossCurrency: -10000, description: "Test credit" },
    ],
  });
  if (v1.ok) {
    const v = v1.data?.value;
    console.log(`  id: ${v?.id}`);
    console.log(`  number: ${v?.number}`);
    console.log(`  numberAsString: "${v?.numberAsString}"`);
    console.log(`  version: ${v?.version}`);
    console.log(`  BOOKED: ${(v?.number ?? 0) > 0 ? 'YES' : 'NO'}`);
  }

  // ============================================================
  // TEST 2: POST /ledger/voucher?sendToLedger=false
  // ============================================================
  console.log("\n========== TEST 2: POST /ledger/voucher?sendToLedger=false ==========\n");
  const v2 = await api("POST", "/ledger/voucher?sendToLedger=false", {
    date: "2026-03-21",
    description: `Test2-SendFalse-${SUFFIX}`,
    postings: [
      { row: 1, account: { id: accts[6300] }, amount: 20000, amountCurrency: 20000, amountGross: 20000, amountGrossCurrency: 20000, description: "Test debit" },
      { row: 2, account: { id: accts[1920] }, amount: -20000, amountCurrency: -20000, amountGross: -20000, amountGrossCurrency: -20000, description: "Test credit" },
    ],
  });
  if (v2.ok) {
    const v = v2.data?.value;
    console.log(`  id: ${v?.id}`);
    console.log(`  number: ${v?.number}`);
    console.log(`  numberAsString: "${v?.numberAsString}"`);
    console.log(`  version: ${v?.version}`);
    console.log(`  BOOKED: ${(v?.number ?? 0) > 0 ? 'YES' : 'NO'}`);
  }

  // ============================================================
  // TEST 3: POST /ledger/voucher?sendToLedger=true
  // ============================================================
  console.log("\n========== TEST 3: POST /ledger/voucher?sendToLedger=true ==========\n");
  const v3 = await api("POST", "/ledger/voucher?sendToLedger=true", {
    date: "2026-03-21",
    description: `Test3-SendTrue-${SUFFIX}`,
    postings: [
      { row: 1, account: { id: accts[6300] }, amount: 30000, amountCurrency: 30000, amountGross: 30000, amountGrossCurrency: 30000, description: "Test debit" },
      { row: 2, account: { id: accts[1920] }, amount: -30000, amountCurrency: -30000, amountGross: -30000, amountGrossCurrency: -30000, description: "Test credit" },
    ],
  });
  if (v3.ok) {
    const v = v3.data?.value;
    console.log(`  id: ${v?.id}`);
    console.log(`  number: ${v?.number}`);
    console.log(`  numberAsString: "${v?.numberAsString}"`);
    console.log(`  version: ${v?.version}`);
    console.log(`  BOOKED: ${(v?.number ?? 0) > 0 ? 'YES' : 'NO'}`);
  }

  // ============================================================
  // TEST 4: Re-read all three vouchers to compare final state
  // ============================================================
  console.log("\n========== FINAL STATE COMPARISON ==========\n");
  for (const [label, vResult] of [["NoParam", v1], ["SendFalse", v2], ["SendTrue", v3]] as const) {
    if (!vResult.ok) { console.log(`  ${label}: FAILED to create`); continue; }
    const vid = vResult.data?.value?.id;
    const vr = await api("GET", `/ledger/voucher/${vid}?fields=*`);
    if (vr.ok) {
      const v = vr.data?.value;
      console.log(`  ${label}: id=${v?.id} number=${v?.number} numberAsString="${v?.numberAsString}" date=${v?.date} desc="${v?.description}"`);
    }
  }

  // ============================================================
  // TEST 5: Can we book an unbooked POST-created voucher with PUT?
  // ============================================================
  if (v2.ok) {
    const v2id = v2.data?.value?.id;
    const v2ver = v2.data?.value?.version;
    console.log("\n========== TEST 5: Book an unbooked POST voucher via PUT sendToLedger=true ==========\n");
    const bookResult = await api("PUT", `/ledger/voucher/${v2id}?sendToLedger=true`, {
      version: v2ver,
    });
    console.log(`  Book result: ${bookResult.ok ? 'OK' : 'FAILED'}`);
    if (bookResult.ok) {
      const v = bookResult.data?.value;
      console.log(`  After booking: number=${v?.number} numberAsString="${v?.numberAsString}"`);
    }
  }
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
