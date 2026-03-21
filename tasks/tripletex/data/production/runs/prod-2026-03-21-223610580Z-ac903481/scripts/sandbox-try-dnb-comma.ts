const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const accountId = 424190862;

async function tryImport(bankId: number, format: string, csvContent: string, label: string) {
  const formData = new FormData();
  const blob = new Blob([csvContent], { type: "text/csv" });
  formData.append("file", blob, "bankstatement.csv");
  const url = `${BASE}/bank/statement/import?bankId=${bankId}&accountId=${accountId}&fromDate=2026-04-01&toDate=2026-04-03&fileFormat=${format}`;
  const r = await fetch(url, { method: "POST", headers: { Authorization: AUTH }, body: formData });
  const t = await r.text();
  console.log(`[${label}] → ${r.status}: ${t.substring(0, 800)}`);
  return r.status;
}

// DNB with comma separators instead of semicolons
const dnbComma = `"Konto","Kontonavn","Inngående saldo","Utgående saldo","Bokført dato","Forklarende tekst","Ut","Inn"
"12345678903","Driftskonto","100000,00","101000,00","01.04.2026","Test betaling","","1000,00"`;

console.log("=== DNB comma sep ===");
await tryImport(67, "DNB_CSV", dnbComma, "DNB-comma");

// DNB with tab separator
const dnbTab = `"Konto"\t"Kontonavn"\t"Inngående saldo"\t"Utgående saldo"\t"Bokført dato"\t"Forklarende tekst"\t"Ut"\t"Inn"
"12345678903"\t"Driftskonto"\t"100000,00"\t"101000,00"\t"01.04.2026"\t"Test betaling"\t""\t"1000,00"`;

console.log("\n=== DNB tab sep ===");
await tryImport(67, "DNB_CSV", dnbTab, "DNB-tab");

// DNB with metadata-style like Sbanken
const dnbMeta = `"Konto";"12345678903"
"Kontonavn";"Driftskonto"
"Inngående saldo";"100000,00"
"Utgående saldo";"101000,00"

"Bokført dato";"Forklarende tekst";"Ut";"Inn"
"01.04.2026";"Test betaling";"";"1000,00"`;

console.log("\n=== DNB metadata style ===");
await tryImport(67, "DNB_CSV", dnbMeta, "DNB-meta");

// Try Danske with comma sep
const danskeComma = `"Bokført dato","Rentedato","Tekst","Beløp i NOK","Bokført saldo i NOK","Status"
"01.04.2026","01.04.2026","Test betaling","1000,00","101000,00","Utført"`;

console.log("\n=== Danske comma sep ===");
await tryImport(76, "DANSKE_BANK_CSV", danskeComma, "Danske-comma");

// Try Sbanken privat format
console.log("\n=== Sbanken Privat probe ===");
await tryImport(112, "SBANKEN_PRIVAT_CSV", "dummy", "Sbanken-privat-probe");
