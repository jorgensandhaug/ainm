// Try different encodings and separators for Danske Bank CSV
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function tryImport(label: string, csvContent: string, format: string, bankId: number) {
  const accts = await fetch(`${BASE}/ledger/account?number=1920&fields=*`, { headers: { Authorization: AUTH } }).then(r => r.json());
  const acctId = accts.values[0].id;

  const form = new FormData();
  form.append("file", new Blob([csvContent], { type: "text/csv" }), "bankutskrift.csv");

  const url = `${BASE}/bank/statement/import?bankId=${bankId}&accountId=${acctId}&fromDate=2026-03-18&toDate=2026-03-20&fileFormat=${format}`;
  const r = await fetch(url, { method: "POST", headers: { Authorization: AUTH }, body: form });
  const json = await r.json();
  console.log(`${label}: ${r.status}`);
  if (!r.ok) {
    const msg = json.validationMessages?.[0]?.message || JSON.stringify(json).slice(0, 300);
    console.log(`  → ${msg}`);
  } else {
    console.log(`  → SUCCESS: ${JSON.stringify(json).slice(0, 300)}`);
  }
  return { status: r.status, data: json };
}

// Test 1: Danske Bank CSV with comma separator (not semicolon)
console.log("=== Test comma-separated ===");
await tryImport("Danske comma",
  `Bokført dato,Rentedato,Tekst,Beløp i NOK,Bokført saldo i NOK,Status\n18.03.2026,18.03.2026,Test,5000.00,105000.00,Utført\n`,
  "DANSKE_BANK_CSV", 76);

// Test 2: Sbanken privat
console.log("\n=== Test SBANKEN_PRIVAT_CSV ===");
await tryImport("Sbanken privat",
  `Dato;Forklaring;Inn;Ut;Saldo\n18.03.2026;Test;5000;;105000\n`,
  "SBANKEN_PRIVAT_CSV", 112);

// Test 3: Tab-separated for Danske
console.log("\n=== Test tab-separated ===");
await tryImport("Danske tab",
  `Bokført dato\tRentedato\tTekst\tBeløp i NOK\tBokført saldo i NOK\tStatus\n18.03.2026\t18.03.2026\tTest\t5000,00\t105000,00\tUtført\n`,
  "DANSKE_BANK_CSV", 76);

// Test 4: Try writing a temp file and using Bun.file
console.log("\n=== Test via temp file ===");
const tmpPath = "/tmp/test_bank_danske.csv";
await Bun.write(tmpPath, `Bokført dato;Rentedato;Tekst;Beløp i NOK;Bokført saldo i NOK;Status\n18.03.2026;18.03.2026;Test innbetaling;5000,00;105000,00;Utført\n19.03.2026;19.03.2026;Test utbetaling;-3000,00;102000,00;Utført\n`);
const accts2 = await fetch(`${BASE}/ledger/account?number=1920&fields=*`, { headers: { Authorization: AUTH } }).then(r => r.json());
const acctId2 = accts2.values[0].id;
const form = new FormData();
form.append("file", Bun.file(tmpPath));
const url = `${BASE}/bank/statement/import?bankId=76&accountId=${acctId2}&fromDate=2026-03-18&toDate=2026-03-20&fileFormat=DANSKE_BANK_CSV`;
const r = await fetch(url, { method: "POST", headers: { Authorization: AUTH }, body: form });
const json = await r.json();
console.log(`Temp file: ${r.status}`);
if (!r.ok) console.log(`  → ${json.validationMessages?.[0]?.message || JSON.stringify(json).slice(0, 300)}`);
else console.log(`  → SUCCESS: ${JSON.stringify(json).slice(0, 300)}`);

// Test 5: SBANKEN_PRIVAT with semicolons and dd.mm.yyyy dates
console.log("\n=== Test SBANKEN_PRIVAT more carefully ===");
// Sbanken privat CSV format: headers?
await tryImport("Sbanken guess1",
  `Dato;Forklaring;Rentedato;Ut fra konto;Inn på konto\n18.03.2026;Test;;; 5 000,00\n`,
  "SBANKEN_PRIVAT_CSV", 112);

console.log("\nDone.");
