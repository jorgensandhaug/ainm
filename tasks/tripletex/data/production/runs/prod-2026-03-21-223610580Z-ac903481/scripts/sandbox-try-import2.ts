const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const accountId = 424190862; // 1920 Bankinnskudd

// DNB_CSV requires: Konto, Kontonavn, Inngående saldo, Utgående saldo, Bokført dato, Forklarende tekst, Ut, Inn
// DANSKE_BANK_CSV requires: Bokført dato, Rentedato, Tekst, Beløp i NOK, Bokført saldo i NOK, Status
// SBANKEN_BEDRIFT_CSV requires: ?
// HAUGESUND_SPAREBANK_CSV requires: ?

async function tryImport(bankId: number, format: string, csvContent: string, label: string) {
  const formData = new FormData();
  const blob = new Blob([csvContent], { type: "text/csv" });
  formData.append("file", blob, "bankstatement.csv");

  const url = `${BASE}/bank/statement/import?bankId=${bankId}&accountId=${accountId}&fromDate=2026-01-16&toDate=2026-02-04&fileFormat=${format}`;
  const r = await fetch(url, {
    method: "POST",
    headers: { Authorization: AUTH },
    body: formData,
  });
  const t = await r.text();
  console.log(`[${label}] POST format=${format} → ${r.status}`);
  console.log(`  ${t.substring(0, 800)}`);
  return { status: r.status, body: t };
}

// DNB CSV with correct columns
// Format: Konto;Kontonavn;Inngående saldo;Utgående saldo;Bokført dato;Forklarende tekst;Ut;Inn
const dnbCsv = `"Konto";"Kontonavn";"Inngående saldo";"Utgående saldo";"Bokført dato";"Forklarende tekst";"Ut";"Inn"
"12345678903";"Driftskonto";"100000,00";"103506,43";"16.01.2026";"Innbetaling fra Moe AS / Faktura 1001";"";"4200,00"
"12345678903";"Driftskonto";"100000,00";"103506,43";"19.01.2026";"Innbetaling fra Johansen AS / Faktura 1002";"";"14500,00"
"12345678903";"Driftskonto";"100000,00";"103506,43";"22.01.2026";"Innbetaling fra Moe AS / Faktura 1003";"";"5250,00"
"12345678903";"Driftskonto";"100000,00";"103506,43";"25.01.2026";"Innbetaling fra Nilsen AS / Faktura 1004";"";"13250,00"
"12345678903";"Driftskonto";"100000,00";"103506,43";"27.01.2026";"Innbetaling fra Nilsen AS / Faktura 1005";"";"16562,50"
"12345678903";"Driftskonto";"100000,00";"103506,43";"29.01.2026";"Betaling Leverandor Ødegård AS";"19650,00";""
"12345678903";"Driftskonto";"100000,00";"103506,43";"30.01.2026";"Betaling Leverandor Moe AS";"9950,00";""
"12345678903";"Driftskonto";"100000,00";"103506,43";"31.01.2026";"Betaling Leverandor Hansen AS";"18250,00";""
"12345678903";"Driftskonto";"100000,00";"103506,43";"01.02.2026";"Bankgebyr";"1795,86";""
"12345678903";"Driftskonto";"100000,00";"103506,43";"03.02.2026";"Bankgebyr";"610,21";""`;

console.log("=== DNB CSV ===");
await tryImport(67, "DNB_CSV", dnbCsv, "DNB-correct");

// Danske Bank CSV: Bokført dato;Rentedato;Tekst;Beløp i NOK;Bokført saldo i NOK;Status
const danskeCsv = `"Bokført dato";"Rentedato";"Tekst";"Beløp i NOK";"Bokført saldo i NOK";"Status"
"16.01.2026";"16.01.2026";"Innbetaling fra Moe AS / Faktura 1001";"4200,00";"104200,00";"Utført"
"19.01.2026";"19.01.2026";"Innbetaling fra Johansen AS / Faktura 1002";"14500,00";"118700,00";"Utført"
"22.01.2026";"22.01.2026";"Innbetaling fra Moe AS / Faktura 1003";"5250,00";"123950,00";"Utført"
"25.01.2026";"25.01.2026";"Innbetaling fra Nilsen AS / Faktura 1004";"13250,00";"137200,00";"Utført"
"27.01.2026";"27.01.2026";"Innbetaling fra Nilsen AS / Faktura 1005";"16562,50";"153762,50";"Utført"
"29.01.2026";"29.01.2026";"Betaling Leverandor Ødegård AS";"-19650,00";"134112,50";"Utført"
"30.01.2026";"30.01.2026";"Betaling Leverandor Moe AS";"-9950,00";"124162,50";"Utført"
"31.01.2026";"31.01.2026";"Betaling Leverandor Hansen AS";"-18250,00";"105912,50";"Utført"
"01.02.2026";"01.02.2026";"Bankgebyr";"-1795,86";"104116,64";"Utført"
"03.02.2026";"03.02.2026";"Bankgebyr";"-610,21";"103506,43";"Utført"`;

console.log("\n=== Danske Bank CSV ===");
await tryImport(76, "DANSKE_BANK_CSV", danskeCsv, "Danske-correct");

// Try Sbanken bedrift
console.log("\n=== Sbanken Bedrift CSV (probe for columns) ===");
await tryImport(112, "SBANKEN_BEDRIFT_CSV", "dummy", "Sbanken-probe");

// Try Haugesund
console.log("\n=== Haugesund CSV (probe for columns) ===");
await tryImport(108, "HAUGESUND_SPAREBANK_CSV", "dummy", "Haugesund-probe");
