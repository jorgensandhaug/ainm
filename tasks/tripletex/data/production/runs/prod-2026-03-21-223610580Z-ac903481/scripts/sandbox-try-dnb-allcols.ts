const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const accountId = 424190862;

async function tryImport(bankId: number, format: string, csvContent: string, label: string) {
  const formData = new FormData();
  const blob = new Blob([csvContent], { type: "text/csv" });
  formData.append("file", blob, "bankstatement.csv");
  const url = `${BASE}/bank/statement/import?bankId=${bankId}&accountId=${accountId}&fromDate=2026-03-01&toDate=2026-03-04&fileFormat=${format}`;
  const r = await fetch(url, { method: "POST", headers: { Authorization: AUTH }, body: formData });
  const t = await r.text();
  console.log(`[${label}] → ${r.status}: ${t.substring(0, 800)}`);
  return r.status;
}

// DNB: try all 8 as columns (some repeated per row)
const dnbAllCols = `"Konto";"Kontonavn";"Inngående saldo";"Utgående saldo";"Bokført dato";"Forklarende tekst";"Ut";"Inn"
"12345678903";"Driftskonto";"100000,00";"103506,43";"01.03.2026";"Test betaling";"";"1000,00"
"12345678903";"Driftskonto";"100000,00";"103506,43";"02.03.2026";"Test gebyr";"500,00";""`;

console.log("=== DNB all cols ===");
await tryImport(67, "DNB_CSV", dnbAllCols, "DNB-allcols");

// DNB: try without quotes
const dnbNQ = `Konto;Kontonavn;Inngående saldo;Utgående saldo;Bokført dato;Forklarende tekst;Ut;Inn
12345678903;Driftskonto;100000,00;103506,43;01.03.2026;Test betaling;;1000,00
12345678903;Driftskonto;100000,00;103506,43;02.03.2026;Test gebyr;500,00;`;

console.log("\n=== DNB no quotes ===");
await tryImport(67, "DNB_CSV", dnbNQ, "DNB-nq");

// Danske Bank: try with ; at end of header
const danskeV3 = `Bokført dato;Rentedato;Tekst;Beløp i NOK;Bokført saldo i NOK;Status;
01.03.2026;01.03.2026;Test betaling;1000,00;101000,00;Utført;
02.03.2026;02.03.2026;Test gebyr;-500,00;100500,00;Utført;`;

console.log("\n=== Danske v3 (trailing ;) ===");
await tryImport(76, "DANSKE_BANK_CSV", danskeV3, "Danske-v3");

// Try VISMA_ACCOUNT_STATEMENT format (should work with any bank?)
console.log("\n=== VISMA probe ===");
await tryImport(67, "VISMA_ACCOUNT_STATEMENT", "dummy", "VISMA-probe");

// Try ZTL format
console.log("\n=== ZTL probe ===");
await tryImport(67, "ZTL", "dummy", "ZTL-probe");
