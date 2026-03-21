// Test: can we combine all 4 corrections into a single voucher?
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

// Use known account IDs from previous test
const idMap: Record<number, number> = {
  1920: 424190862,
  2400: 424190921,
  2710: 424190943,
  6540: 424191132,
  6590: 424191138,
  6860: 424191153,
  7000: 424191158,
};

// Use known supplier ID from previous test
const supplierId = 108347474;

// Combined corrective voucher with all 4 corrections (8 posting lines)
console.log("=== Testing combined corrective voucher ===");
const combined = await api("POST", "/ledger/voucher?sendToLedger=true", {
  date: "2026-02-28",
  description: "Samlede korreksjoner: omposteringer, duplikat, manglende MVA, feil beløp",
  postings: [
    // Error 1: Reclassification 6540→6860 (1950 gross)
    { row: 1, account: { id: idMap[6540] }, amountGross: -1950, amountGrossCurrency: -1950, description: "Korreksjon: ompostering fra 6540", vatType: { id: 1 } },
    { row: 2, account: { id: idMap[6860] }, amountGross: 1950, amountGrossCurrency: 1950, description: "Korreksjon: ompostering til 6860", vatType: { id: 1 } },
    // Error 2: Reverse duplicate 7000 (3650 gross)
    { row: 3, account: { id: idMap[7000] }, amountGross: -3650, amountGrossCurrency: -3650, description: "Korreksjon: reversering duplikat", vatType: { id: 1 } },
    { row: 4, account: { id: idMap[1920] }, amountGross: 3650, amountGrossCurrency: 3650, description: "Korreksjon: reversering bank", vatType: { id: 0 } },
    // Error 3: Missing VAT on 6590 (3550 gross correction)
    { row: 5, account: { id: idMap[6590] }, amountGross: 3550, amountGrossCurrency: 3550, description: "Korreksjon: manglende MVA", vatType: { id: 1 } },
    { row: 6, account: { id: idMap[2400] }, amountGross: -3550, amountGrossCurrency: -3550, description: "Korreksjon: leverandørgjeld MVA", supplier: { id: supplierId } },
    // Error 4: Wrong amount 6540 (excess 5250 gross)
    { row: 7, account: { id: idMap[6540] }, amountGross: -5250, amountGrossCurrency: -5250, description: "Korreksjon: feil beløp husleie", vatType: { id: 1 } },
    { row: 8, account: { id: idMap[1920] }, amountGross: 5250, amountGrossCurrency: 5250, description: "Korreksjon: bank feil beløp", vatType: { id: 0 } },
  ]
});

if (combined) {
  console.log(`Combined voucher created: id=${combined.id}, number=${combined.number}`);
  console.log("Postings:");
  for (const p of combined.postings || []) {
    console.log(`  acct=${p.account?.id} amt=${p.amount} gross=${p.amountGross} row=${p.row}`);
  }
  console.log("\nSUCCESS: All 4 corrections in a single voucher!");
  console.log("This approach uses only 3 API calls total: 2 GETs + 1 POST");
} else {
  console.log("FAILED: Combined voucher approach doesn't work. Use separate vouchers.");
}
