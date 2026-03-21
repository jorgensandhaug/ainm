// Test the absolute optimal 3-call path:
// Call 1: GET accounts (all needed, including 6860)
// Call 2: GET vouchers with nested expansion (to find errors + counterparts)
// Call 3: POST combined corrective voucher
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: { "Authorization": AUTH, "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  if (!res.ok) { console.error(`${method} ${path} => ${res.status}`, JSON.stringify(json).slice(0, 500)); return null; }
  if (json.values !== undefined) return json.values;
  if (json.value !== undefined) return json.value;
  return json;
}

console.log("=== OPTIMAL 3-CALL PATH ===\n");

// CALL 1: Get all account IDs upfront (including correction target 6860)
console.log("CALL 1: GET /ledger/account");
const accounts = await api("GET", "/ledger/account?number=1920,2400,2710,6540,6590,6860,7000&fields=id,number");
if (!accounts) process.exit(1);
const acctMap: Record<number, number> = {};
for (const a of accounts) { acctMap[a.number] = a.id; console.log(`  ${a.number} => ${a.id}`); }

// CALL 2: Get all vouchers with nested expansion to find errors + counterpart info
console.log("\nCALL 2: GET /ledger/voucher (nested expansion)");
const vouchers = await api("GET",
  "/ledger/voucher?dateFrom=2026-01-01&dateTo=2026-03-01" +
  "&fields=id,date,description,postings(id,account(id,number),amount,amountGross,amountGrossCurrency,vatType(id),supplier(id),description)" +
  "&count=1000"
);
if (!vouchers) process.exit(1);
console.log(`  Found ${vouchers.length} vouchers`);

// Find errors by matching account number + gross amount + description keyword
function findErr(acctNum: number, gross: number, kw: string) {
  return vouchers.find((v: any) =>
    v.description?.toLowerCase().includes(kw) &&
    v.postings?.some((p: any) => p.account?.number === acctNum && Math.abs(p.amountGross - gross) < 0.01)
  );
}

const e1 = findErr(6540, 1950, "telefon");
const e2 = findErr(7000, 3650, "duplikat");
const e3 = findErr(6590, 14200, "mva");
const e4 = findErr(6540, 10750, "feil");

// Extract counterpart for e3 (needs supplier ID for 2400 posting)
const e3counter = e3?.postings?.find((p: any) => p.account?.number === 2400);
const e3supplierId = e3counter?.supplier?.id;
console.log(`  Err3 supplier ID: ${e3supplierId}`);

// Extract counterpart for e2 and e4
const e2counter = e2?.postings?.find((p: any) => p.account?.number !== 7000 && p.account?.number !== 2710);
const e4counter = e4?.postings?.find((p: any) => p.account?.number !== 6540 && p.account?.number !== 2710);
console.log(`  Err2 counterpart: ${e2counter?.account?.number}(${e2counter?.account?.id})`);
console.log(`  Err4 counterpart: ${e4counter?.account?.number}(${e4counter?.account?.id})`);

// CALL 3: POST combined corrective voucher
console.log("\nCALL 3: POST combined corrective voucher");
const postings: any[] = [
  // Error 1: Reclassify 6540→6860
  { row: 1, account: { id: acctMap[6540] }, amountGross: -1950, amountGrossCurrency: -1950, description: "Korreksjon: ompostering fra konto 6540", vatType: { id: 1 } },
  { row: 2, account: { id: acctMap[6860] }, amountGross: 1950, amountGrossCurrency: 1950, description: "Korreksjon: ompostering til konto 6860", vatType: { id: 1 } },
  // Error 2: Reverse duplicate 7000
  { row: 3, account: { id: acctMap[7000] }, amountGross: -3650, amountGrossCurrency: -3650, description: "Korreksjon: reversering duplikat", vatType: { id: 1 } },
  { row: 4, account: { id: e2counter.account.id }, amountGross: 3650, amountGrossCurrency: 3650, description: "Korreksjon: reversering bank duplikat" },
  // Error 3: Missing VAT (add 3550 gross to 6590 with vatType=1, credit 2400)
  { row: 5, account: { id: acctMap[6590] }, amountGross: 3550, amountGrossCurrency: 3550, description: "Korreksjon: manglende MVA varekjøp", vatType: { id: 1 } },
  { row: 6, account: { id: acctMap[2400] }, amountGross: -3550, amountGrossCurrency: -3550, description: "Korreksjon: leverandørgjeld MVA", supplier: { id: e3supplierId } },
  // Error 4: Reverse excess 5250 gross on 6540
  { row: 7, account: { id: acctMap[6540] }, amountGross: -5250, amountGrossCurrency: -5250, description: "Korreksjon: feil beløp husleie", vatType: { id: 1 } },
  { row: 8, account: { id: e4counter.account.id }, amountGross: 5250, amountGrossCurrency: 5250, description: "Korreksjon: bank feil beløp" },
];

const result = await api("POST", "/ledger/voucher?sendToLedger=true", {
  date: "2026-02-28",
  description: "Samlede korreksjoner januar/februar 2026",
  postings,
});

if (result) {
  console.log(`  Voucher created: id=${result.id}, number=${result.number}`);
  console.log(`  Postings: ${result.postings?.length}`);
  for (const p of result.postings || []) {
    console.log(`    acct=${p.account?.id} amt=${p.amount} gross=${p.amountGross}`);
  }
  console.log("\n=== SUCCESS: 3 calls total (2 GET + 1 POST) ===");
} else {
  console.log("  FAILED");
}
