// Try Sbanken Bedrift CSV format with correct column names
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
  if (!r.ok) console.log(`  → ${json.validationMessages?.[0]?.message || JSON.stringify(json).slice(0, 500)}`);
  else console.log(`  → SUCCESS: ${JSON.stringify(json).slice(0, 500)}`);
  return { status: r.status, data: json };
}

// Sbanken Bedrift format: Inngående saldo DD.MM.YYYY, Utgående saldo DD.MM.YYYY, Bokført, Rentedato, Beskrivelse, Beløp
console.log("=== Test 1: Sbanken Bedrift CSV ===");
const sbankenBedrift = `Inngående saldo 18.03.2026;100000,00
Utgående saldo 19.03.2026;102000,00
Bokført;Rentedato;Beskrivelse;Beløp
18.03.2026;18.03.2026;Test innbetaling;5000,00
19.03.2026;19.03.2026;Test utbetaling;-3000,00
`;
await tryImport("Sbanken Bedrift v1", sbankenBedrift, "SBANKEN_BEDRIFT_CSV", 112);

// Sbanken Privat: Utgående Saldo DD.MM.YYYY, Inngående Saldo DD.MM.YYYY, BOKFØRINGSDATO, TEKST, UT FRA KONTO, INN PÅ KONTO
console.log("\n=== Test 2: Sbanken Privat CSV ===");
const sbankenPrivat = `Utgående Saldo 19.03.2026;102000,00
Inngående Saldo 18.03.2026;100000,00
BOKFØRINGSDATO;TEKST;UT FRA KONTO;INN PÅ KONTO
18.03.2026;Test innbetaling;;5000,00
19.03.2026;Test utbetaling;3000,00;
`;
await tryImport("Sbanken Privat v1", sbankenPrivat, "SBANKEN_PRIVAT_CSV", 112);

// Danske Bank CSV with proper header (no quotes, semicolons)
// The error message uses commas in the column list, but Tripletex CSV files use semicolons
// Maybe the issue is that the parser expects a specific row structure
console.log("\n=== Test 3: Danske Bank CSV with BOM ===");
const bom = "\uFEFF";
const danskeWithBom = bom + `Bokført dato;Rentedato;Tekst;Beløp i NOK;Bokført saldo i NOK;Status
18.03.2026;18.03.2026;Test innbetaling;5000,00;105000,00;Utført
19.03.2026;19.03.2026;Test utbetaling;-3000,00;102000,00;Utført
`;
await tryImport("Danske BOM", danskeWithBom, "DANSKE_BANK_CSV", 76);

// Test 4: Danske Bank with ISO-8859-1 encoding
console.log("\n=== Test 4: Danske Bank ISO-8859-1 ===");
const encoder = new TextEncoder();
const danskeISO = `Bokført dato;Rentedato;Tekst;Beløp i NOK;Bokført saldo i NOK;Status
18.03.2026;18.03.2026;Test;5000,00;105000,00;Utført
`;
const accts2 = await fetch(`${BASE}/ledger/account?number=1920&fields=*`, { headers: { Authorization: AUTH } }).then(r => r.json());
const form2 = new FormData();
form2.append("file", new Blob([danskeISO], { type: "text/csv; charset=iso-8859-1" }), "bankutskrift.csv");
const url2 = `${BASE}/bank/statement/import?bankId=76&accountId=${accts2.values[0].id}&fromDate=2026-03-18&toDate=2026-03-19&fileFormat=DANSKE_BANK_CSV`;
const r2 = await fetch(url2, { method: "POST", headers: { Authorization: AUTH }, body: form2 });
const json2 = await r2.json();
console.log(`Danske ISO: ${r2.status}`);
if (!r2.ok) console.log(`  → ${json2.validationMessages?.[0]?.message || JSON.stringify(json2).slice(0, 500)}`);
else console.log(`  → SUCCESS: ${JSON.stringify(json2).slice(0, 500)}`);

// Test 5: DNB CSV with proper headers
console.log("\n=== Test 5: DNB CSV ===");
// DNB needs: Konto, Kontonavn, Inngående saldo, Utgående saldo, Bokført dato, Forklarende tekst, Ut, Inn
const dnbCSV = `Konto;Kontonavn;Inngående saldo;Utgående saldo;Bokført dato;Forklarende tekst;Ut;Inn
1920;Bank;100000,00;105000,00;18.03.2026;Test innbetaling;;5000,00
1920;Bank;105000,00;102000,00;19.03.2026;Test utbetaling;3000,00;
`;
await tryImport("DNB v1", dnbCSV, "DNB_CSV", 67);

console.log("\nDone.");
