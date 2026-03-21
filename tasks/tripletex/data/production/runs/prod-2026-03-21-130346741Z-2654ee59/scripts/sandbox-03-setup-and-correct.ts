// Sandbox: set up test vouchers with errors, then test correction flow
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
    console.error(`${method} ${path} => ${res.status}`, JSON.stringify(json).slice(0, 800));
    return null;
  }
  if (json.values !== undefined) return json.values;
  if (json.value !== undefined) return json.value;
  return json;
}

// Step 1: Get account IDs
console.log("=== Step 1: Get all needed account IDs ===");
const accounts = await api("GET", "/ledger/account?number=1920,2400,2710,6540,6590,6860,7000&fields=id,number,name");
if (!accounts) process.exit(1);
const acctMap: Record<number, number> = {};
for (const a of accounts) {
  acctMap[a.number] = a.id;
  console.log(`  ${a.number} => id=${a.id} "${a.name}"`);
}

// Step 2: Create test error vouchers
console.log("\n=== Step 2: Create test error vouchers ===");

// Error 1: Wrong account (6540 used instead of 6860, gross 1950 NOK with 25% VAT)
const v1 = await api("POST", "/ledger/voucher?sendToLedger=true", {
  date: "2026-01-15",
  description: "Telefonkostnad sandbox test",
  postings: [
    { row: 1, account: { id: acctMap[6540] }, amountGross: 1950, amountGrossCurrency: 1950, description: "Telefonkostnad", vatType: { id: 1 } },
    { row: 2, account: { id: acctMap[1920] }, amountGross: -1950, amountGrossCurrency: -1950, description: "Telefonkostnad" },
  ]
});
console.log("Error1 voucher:", v1?.id, v1?.number);

// Error 2: Duplicate entry (7000, gross 3650 NOK with 25% VAT)
const v2 = await api("POST", "/ledger/voucher?sendToLedger=true", {
  date: "2026-01-25",
  description: "Kontorrekvisita duplikat sandbox test",
  postings: [
    { row: 1, account: { id: acctMap[7000] }, amountGross: 3650, amountGrossCurrency: 3650, description: "Kontorrekvisita duplikat", vatType: { id: 1 } },
    { row: 2, account: { id: acctMap[1920] }, amountGross: -3650, amountGrossCurrency: -3650, description: "Kontorrekvisita duplikat" },
  ]
});
console.log("Error2 (duplicate) voucher:", v2?.id, v2?.number);

// Error 3: Missing VAT (6590, gross amount 14200 booked as gross with VAT but should be net)
const v3 = await api("POST", "/ledger/voucher?sendToLedger=true", {
  date: "2026-02-10",
  description: "Varekjøp uten MVA sandbox test",
  postings: [
    { row: 1, account: { id: acctMap[6590] }, amountGross: 14200, amountGrossCurrency: 14200, description: "Varekjøp uten MVA", vatType: { id: 1 } },
    { row: 2, account: { id: acctMap[2400] }, amountGross: -14200, amountGrossCurrency: -14200, description: "Varekjøp uten MVA" },
  ]
});
console.log("Error3 (missing VAT) voucher:", v3?.id, v3?.number);

// Error 4: Wrong amount (6540, gross 10750 instead of 5500)
const v4 = await api("POST", "/ledger/voucher?sendToLedger=true", {
  date: "2026-02-15",
  description: "Husleie feil beløp sandbox test",
  postings: [
    { row: 1, account: { id: acctMap[6540] }, amountGross: 10750, amountGrossCurrency: 10750, description: "Husleie feil beløp", vatType: { id: 1 } },
    { row: 2, account: { id: acctMap[1920] }, amountGross: -10750, amountGrossCurrency: -10750, description: "Husleie feil beløp" },
  ]
});
console.log("Error4 (wrong amount) voucher:", v4?.id, v4?.number);

if (!v1 || !v2 || !v3 || !v4) {
  console.error("Failed to create test vouchers, aborting");
  process.exit(1);
}

console.log("\nAll test vouchers created. Now testing the correction flow...");

// === THE OPTIMAL CORRECTION FLOW ===
// This simulates what the agent should do during a scored run

// Step A: Single GET with nested field expansion — get all vouchers with expanded postings and account numbers
console.log("\n=== OPTIMAL FLOW Step A: Single voucher GET with nested expansion ===");
const vouchers = await api("GET", "/ledger/voucher?dateFrom=2026-01-01&dateTo=2026-03-01&fields=id,date,description,postings(id,account(id,number),amount,amountGross,amountGrossCurrency,vatType(id),description)&count=1000");
if (!vouchers) process.exit(1);
console.log(`Found ${vouchers.length} vouchers`);

// Identify the 4 errors by matching account numbers + amounts
// Build account ID map from postings
const acctIdMap: Record<number, number> = {}; // number -> id
for (const v of vouchers) {
  for (const p of (v.postings || [])) {
    if (p.account?.number && p.account?.id) {
      acctIdMap[p.account.number] = p.account.id;
    }
  }
}
console.log("Account map from postings:", acctIdMap);

// Check if we have account 6860 from postings
if (!acctIdMap[6860]) {
  console.log("\nAccount 6860 not in any posting — need separate lookup");
  // Step B: Get account 6860
  console.log("=== OPTIMAL FLOW Step B: Get account 6860 ===");
  const acct6860 = await api("GET", "/ledger/account?number=6860&fields=id,number");
  if (acct6860 && acct6860.length > 0) {
    acctIdMap[6860] = acct6860[0].id;
    console.log(`Account 6860 id=${acct6860[0].id}`);
  }
}

// Find error vouchers
// Error 1: posting on account 6540 with amountGross=1950
const err1Voucher = vouchers.find((v: any) =>
  v.postings?.some((p: any) => p.account?.number === 6540 && p.amountGross === 1950)
  && v.description?.toLowerCase().includes("telefon")
);
console.log(`\nError 1 (wrong account): voucher ${err1Voucher?.id} "${err1Voucher?.description}"`);

// Error 2: duplicate — posting on account 7000 with amountGross=3650
const err2Voucher = vouchers.find((v: any) =>
  v.postings?.some((p: any) => p.account?.number === 7000 && p.amountGross === 3650)
  && v.description?.toLowerCase().includes("duplikat")
);
console.log(`Error 2 (duplicate): voucher ${err2Voucher?.id} "${err2Voucher?.description}"`);

// Error 3: missing VAT — posting on account 6590 with amountGross=14200
const err3Voucher = vouchers.find((v: any) =>
  v.postings?.some((p: any) => p.account?.number === 6590 && p.amountGross === 14200)
  && v.description?.toLowerCase().includes("mva")
);
console.log(`Error 3 (missing VAT): voucher ${err3Voucher?.id} "${err3Voucher?.description}"`);

// Error 4: wrong amount — posting on account 6540 with amountGross=10750
const err4Voucher = vouchers.find((v: any) =>
  v.postings?.some((p: any) => p.account?.number === 6540 && p.amountGross === 10750)
  && v.description?.toLowerCase().includes("feil")
);
console.log(`Error 4 (wrong amount): voucher ${err4Voucher?.id} "${err4Voucher?.description}"`);

// Analyze counterpart accounts for each error
for (const [label, v] of [["Err1", err1Voucher], ["Err2", err2Voucher], ["Err3", err3Voucher], ["Err4", err4Voucher]] as const) {
  if (!v) continue;
  console.log(`\n${label} postings:`);
  for (const p of (v as any).postings || []) {
    console.log(`  acct=${p.account?.number}(id=${p.account?.id}) amount=${p.amount} gross=${p.amountGross} vat=${p.vatType?.id}`);
  }
}

// === CORRECTIONS ===
console.log("\n=== CORRECTIONS ===");

// Error 1: Wrong account 6540 → 6860, 1950 gross
// Corrective: reverse 6540 posting, add 6860 posting, same VAT treatment
// Since original had vatType=1 (25% VAT), use same for correction
const corr1 = await api("POST", "/ledger/voucher?sendToLedger=true", {
  date: "2026-02-28",
  description: "Korreksjon: omposteringer fra 6540 til 6860",
  postings: [
    { row: 1, account: { id: acctIdMap[6540] }, amountGross: -1950, amountGrossCurrency: -1950, description: "Korreksjon telefonkostnad fra feil konto", vatType: { id: 1 } },
    { row: 2, account: { id: acctIdMap[6860] }, amountGross: 1950, amountGrossCurrency: 1950, description: "Korreksjon telefonkostnad til riktig konto", vatType: { id: 1 } },
  ]
});
console.log("Correction 1:", corr1 ? `id=${corr1.id}` : "FAILED");
if (corr1) {
  for (const p of corr1.postings || []) {
    console.log(`  post: acct=${p.account?.id} amount=${p.amount} gross=${p.amountGross}`);
  }
}

// Error 2: Duplicate voucher — use PUT /:reverse
console.log("\nTesting PUT /:reverse for duplicate...");
const corr2 = await api("PUT", `/ledger/voucher/${err2Voucher?.id}/:reverse?date=2026-02-28`);
console.log("Correction 2 (reverse):", corr2 ? `id=${corr2.id}` : "FAILED");
if (corr2) {
  for (const p of corr2.postings || []) {
    console.log(`  post: acct=${p.account?.id} amount=${p.amount} gross=${p.amountGross}`);
  }
}

// Error 3: Missing VAT — the original entry treated 14200 as gross (VAT-inclusive) but it should be net (HT)
// Original: 6590 gross=14200 (net=11360 with vatType=1), 2710=2840 auto-generated, 2400=-14200
// Correct: 6590 net=14200, 2710=3550 (14200*0.25), 2400=-17750
// Difference: 6590 net needs +2840, 2710 needs +710, 2400 needs -3550
// Corrective voucher: debit 6590 gross=3550 with vatType=1 → net=2840+VAT=710, credit 2400 gross=-3550
const corr3 = await api("POST", "/ledger/voucher?sendToLedger=true", {
  date: "2026-02-28",
  description: "Korreksjon: manglende MVA-linje for varekjøp",
  postings: [
    { row: 1, account: { id: acctIdMap[6590] }, amountGross: 3550, amountGrossCurrency: 3550, description: "Korreksjon MVA varekjøp", vatType: { id: 1 } },
    { row: 2, account: { id: acctIdMap[2400] }, amountGross: -3550, amountGrossCurrency: -3550, description: "Korreksjon leverandørgjeld MVA" },
  ]
});
console.log("Correction 3:", corr3 ? `id=${corr3.id}` : "FAILED");
if (corr3) {
  for (const p of corr3.postings || []) {
    console.log(`  post: acct=${p.account?.id} amount=${p.amount} gross=${p.amountGross}`);
  }
}

// Error 4: Wrong amount — 10750 instead of 5500 gross, difference = 5250
// Corrective: reverse the excess with vatType=1 for auto VAT handling
const corr4 = await api("POST", "/ledger/voucher?sendToLedger=true", {
  date: "2026-02-28",
  description: "Korreksjon: feil beløp husleie",
  postings: [
    { row: 1, account: { id: acctIdMap[6540] }, amountGross: -5250, amountGrossCurrency: -5250, description: "Korreksjon husleie feil beløp", vatType: { id: 1 } },
    { row: 2, account: { id: acctIdMap[1920] }, amountGross: 5250, amountGrossCurrency: 5250, description: "Korreksjon bank" },
  ]
});
console.log("Correction 4:", corr4 ? `id=${corr4.id}` : "FAILED");
if (corr4) {
  for (const p of corr4.postings || []) {
    console.log(`  post: acct=${p.account?.id} amount=${p.amount} gross=${p.amountGross}`);
  }
}

console.log("\n=== DONE ===");
