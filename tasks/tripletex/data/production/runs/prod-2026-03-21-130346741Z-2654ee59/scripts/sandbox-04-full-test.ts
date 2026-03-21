// Full sandbox test: create test data with supplier, then test the optimal correction flow
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = {
    method,
    headers: { "Authorization": AUTH, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  if (!res.ok) {
    console.error(`${method} ${path} => ${res.status}`, JSON.stringify(json).slice(0, 500));
    return null;
  }
  if (json.values !== undefined) return json.values;
  if (json.value !== undefined) return json.value;
  return json;
}

// Setup: Get accounts + create supplier for 2400 postings
const accounts = await api("GET", "/ledger/account?number=1920,2400,2710,6540,6590,6860,7000&fields=id,number");
if (!accounts) process.exit(1);
const acctMap: Record<number, number> = {};
for (const a of accounts) acctMap[a.number] = a.id;

// Create supplier for 2400 postings
const supplier = await api("POST", "/supplier", { name: "Test Leverandør Sandbox" });
if (!supplier) { console.error("Failed to create supplier"); process.exit(1); }
console.log(`Supplier created: id=${supplier.id}`);

// Create the 4 error vouchers
// Error 3: Use supplier with 2400
const v3 = await api("POST", "/ledger/voucher?sendToLedger=true", {
  date: "2026-02-10",
  description: "Varekjøp uten MVA sandbox",
  postings: [
    { row: 1, account: { id: acctMap[6590] }, amountGross: 14200, amountGrossCurrency: 14200, description: "Varekjøp uten MVA", vatType: { id: 1 } },
    { row: 2, account: { id: acctMap[2400] }, amountGross: -14200, amountGrossCurrency: -14200, description: "Varekjøp uten MVA", supplier: { id: supplier.id } },
  ]
});
console.log("Error3 voucher:", v3?.id);
if (v3) {
  console.log("Error3 postings:");
  for (const p of v3.postings || []) {
    console.log(`  acct=${p.account?.id} amount=${p.amount} gross=${p.amountGross} vat=${p.vatType?.id} supplier=${p.supplier?.id}`);
  }
}

// ================================================
// Now simulate the OPTIMAL correction flow
// ================================================
console.log("\n======================================");
console.log("OPTIMAL CORRECTION FLOW SIMULATION");
console.log("======================================");

// CALL 1: GET vouchers with nested field expansion
console.log("\n--- Call 1: GET /ledger/voucher (nested expansion) ---");
const vouchersAll = await api("GET",
  "/ledger/voucher?dateFrom=2026-01-01&dateTo=2026-03-01" +
  "&fields=id,date,description,postings(id,account(id,number),amount,amountGross,amountGrossCurrency,vatType(id),supplier(id),description)" +
  "&count=1000"
);
if (!vouchersAll) process.exit(1);
console.log(`Found ${vouchersAll.length} vouchers`);

// Build account ID map from all postings
const idMap: Record<number, number> = {};
for (const v of vouchersAll) {
  for (const p of (v.postings || [])) {
    if (p.account?.number && p.account?.id) {
      idMap[p.account.number] = p.account.id;
    }
  }
}
console.log("Accounts found in postings:", Object.keys(idMap).map(Number).sort((a,b)=>a-b));

// Check if 6860 is available
const need6860 = !idMap[6860];
console.log(`Need separate 6860 lookup: ${need6860}`);

if (need6860) {
  // CALL 2: GET account 6860
  console.log("\n--- Call 2: GET /ledger/account?number=6860 ---");
  const acct6860 = await api("GET", "/ledger/account?number=6860&fields=id,number");
  if (acct6860 && acct6860.length > 0) {
    idMap[6860] = acct6860[0].id;
    console.log(`Account 6860 id=${acct6860[0].id}`);
  }
}

// Find error vouchers (match by description keywords + account + amount)
function findError(vouchers: any[], acctNum: number, grossAmt: number, descKeyword: string): any {
  return vouchers.find((v: any) =>
    v.description?.toLowerCase().includes(descKeyword) &&
    v.postings?.some((p: any) => p.account?.number === acctNum && Math.abs(p.amountGross - grossAmt) < 0.01)
  );
}

const err1 = findError(vouchersAll, 6540, 1950, "telefon");
const err2 = findError(vouchersAll, 7000, 3650, "duplikat");
const err3 = findError(vouchersAll, 6590, 14200, "mva");
const err4 = findError(vouchersAll, 6540, 10750, "feil");

console.log(`\nErr1 (wrong account): ${err1?.id} "${err1?.description}"`);
console.log(`Err2 (duplicate): ${err2?.id} "${err2?.description}"`);
console.log(`Err3 (missing VAT): ${err3?.id} "${err3?.description}"`);
console.log(`Err4 (wrong amount): ${err4?.id} "${err4?.description}"`);

// Extract counterpart info
function getCounterpart(voucher: any, mainAcctNum: number): { acctId: number; acctNum: number; supplierId?: number } | null {
  if (!voucher?.postings) return null;
  const counter = voucher.postings.find((p: any) => p.account?.number !== mainAcctNum && p.account?.number !== 2710);
  if (!counter) return null;
  return { acctId: counter.account.id, acctNum: counter.account.number, supplierId: counter.supplier?.id };
}

const cp3 = getCounterpart(err3, 6590);
const cp4 = getCounterpart(err4, 6540);
console.log(`Err3 counterpart: acct=${cp3?.acctNum}(id=${cp3?.acctId}) supplier=${cp3?.supplierId}`);
console.log(`Err4 counterpart: acct=${cp4?.acctNum}(id=${cp4?.acctId})`);

// CORRECTIONS

// CALL 3: Correction 1 — reclassification 6540→6860
console.log("\n--- Call 3: POST correction for wrong account ---");
const corr1 = await api("POST", "/ledger/voucher?sendToLedger=true", {
  date: "2026-02-28",
  description: "Korreksjon: ompostering fra konto 6540 til 6860",
  postings: [
    { row: 1, account: { id: idMap[6540] }, amountGross: -1950, amountGrossCurrency: -1950, description: "Korreksjon fra feil konto 6540", vatType: { id: 1 } },
    { row: 2, account: { id: idMap[6860] }, amountGross: 1950, amountGrossCurrency: 1950, description: "Korreksjon til riktig konto 6860", vatType: { id: 1 } },
  ]
});
console.log("Corr1:", corr1 ? `OK id=${corr1.id}` : "FAILED");
if (corr1?.postings) {
  for (const p of corr1.postings) console.log(`  acct=${p.account?.number || p.account?.id} amt=${p.amount} gross=${p.amountGross}`);
}

// CALL 4: Correction 2 — reverse duplicate voucher
console.log("\n--- Call 4: PUT reverse duplicate voucher ---");
const corr2 = await api("PUT", `/ledger/voucher/${err2.id}/:reverse?date=2026-02-28`);
console.log("Corr2:", corr2 ? `OK id=${corr2.id}` : "FAILED");
if (corr2?.postings) {
  for (const p of corr2.postings) console.log(`  acct=${p.account?.number || p.account?.id} amt=${p.amount} gross=${p.amountGross}`);
}

// CALL 5: Correction 3 — missing VAT
// Original: 6590 gross=14200 (net=11360, VAT=2840) with counterpart 2400=-14200
// Correct: 6590 net=14200, VAT=3550, counterpart=17750
// Diff: 6590 +2840, 2710 +710, 2400 -3550
// Use vatType=1 on expense correction: gross=3550 → net=2840 + VAT=710
console.log("\n--- Call 5: POST correction for missing VAT ---");
const corr3Postings: any[] = [
  { row: 1, account: { id: idMap[6590] }, amountGross: 3550, amountGrossCurrency: 3550, description: "Korreksjon manglende MVA", vatType: { id: 1 } },
];
// Add supplier to counterpart posting on 2400 if needed
const cp3posting: any = { row: 2, account: { id: cp3!.acctId }, amountGross: -3550, amountGrossCurrency: -3550, description: "Korreksjon leverandørgjeld" };
if (cp3!.supplierId) cp3posting.supplier = { id: cp3!.supplierId };
corr3Postings.push(cp3posting);

const corr3 = await api("POST", "/ledger/voucher?sendToLedger=true", {
  date: "2026-02-28",
  description: "Korreksjon: manglende MVA på varekjøp",
  postings: corr3Postings,
});
console.log("Corr3:", corr3 ? `OK id=${corr3.id}` : "FAILED");
if (corr3?.postings) {
  for (const p of corr3.postings) console.log(`  acct=${p.account?.number || p.account?.id} amt=${p.amount} gross=${p.amountGross}`);
}

// CALL 6: Correction 4 — wrong amount (excess = 10750 - 5500 = 5250)
console.log("\n--- Call 6: POST correction for wrong amount ---");
const corr4 = await api("POST", "/ledger/voucher?sendToLedger=true", {
  date: "2026-02-28",
  description: "Korreksjon: feil beløp husleie",
  postings: [
    { row: 1, account: { id: idMap[6540] }, amountGross: -5250, amountGrossCurrency: -5250, description: "Korreksjon husleie feil beløp", vatType: { id: 1 } },
    { row: 2, account: { id: cp4!.acctId }, amountGross: 5250, amountGrossCurrency: 5250, description: "Korreksjon bank" },
  ]
});
console.log("Corr4:", corr4 ? `OK id=${corr4.id}` : "FAILED");
if (corr4?.postings) {
  for (const p of corr4.postings) console.log(`  acct=${p.account?.number || p.account?.id} amt=${p.amount} gross=${p.amountGross}`);
}

// Summary
const total = [corr1, corr2, corr3, corr4].filter(Boolean).length;
console.log(`\n=== RESULT: ${total}/4 corrections succeeded ===`);
console.log(`Total API calls: ${need6860 ? 6 : 5} (${need6860 ? 2 : 1} GET + 4 writes)`);
