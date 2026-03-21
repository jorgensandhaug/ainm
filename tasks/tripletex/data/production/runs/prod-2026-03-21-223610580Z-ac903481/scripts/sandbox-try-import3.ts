const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const accountId = 424190862;

async function tryImport(bankId: number, format: string, csvContent: string, label: string) {
  const formData = new FormData();
  const blob = new Blob([csvContent], { type: "text/csv" });
  formData.append("file", blob, "bankstatement.csv");
  const url = `${BASE}/bank/statement/import?bankId=${bankId}&accountId=${accountId}&fromDate=2026-01-16&toDate=2026-02-04&fileFormat=${format}`;
  const r = await fetch(url, { method: "POST", headers: { Authorization: AUTH }, body: formData });
  const t = await r.text();
  console.log(`[${label}] → ${r.status}: ${t.substring(0, 500)}`);
  return r.status;
}

// DNB format: metadata rows at top, then transaction data
// Real DNB exports have metadata rows, then a blank line, then headers, then data
const dnbCsv1 = `"Konto";"12345678903"
"Kontonavn";"Driftskonto"
"Inngående saldo";"100000,00"
"Utgående saldo";"103506,43"

"Bokført dato";"Forklarende tekst";"Ut";"Inn"
"16.01.2026";"Innbetaling fra Moe AS / Faktura 1001";"";"4200,00"
"19.01.2026";"Innbetaling fra Johansen AS / Faktura 1002";"";"14500,00"
"22.01.2026";"Innbetaling fra Moe AS / Faktura 1003";"";"5250,00"
"25.01.2026";"Innbetaling fra Nilsen AS / Faktura 1004";"";"13250,00"
"27.01.2026";"Innbetaling fra Nilsen AS / Faktura 1005";"";"16562,50"
"29.01.2026";"Betaling Leverandor Ødegård AS";"19650,00";""
"30.01.2026";"Betaling Leverandor Moe AS";"9950,00";""
"31.01.2026";"Betaling Leverandor Hansen AS";"18250,00";""
"01.02.2026";"Bankgebyr";"1795,86";""
"03.02.2026";"Bankgebyr";"610,21";""`;

console.log("=== DNB v1 (metadata rows then data) ===");
await tryImport(67, "DNB_CSV", dnbCsv1, "DNB-v1");

// DNB format: without blank line
const dnbCsv2 = `"Konto";"12345678903"
"Kontonavn";"Driftskonto"
"Inngående saldo";"100000,00"
"Utgående saldo";"103506,43"
"Bokført dato";"Forklarende tekst";"Ut";"Inn"
"16.01.2026";"Innbetaling fra Moe AS / Faktura 1001";"";"4200,00"
"19.01.2026";"Innbetaling fra Johansen AS / Faktura 1002";"";"14500,00"
"22.01.2026";"Innbetaling fra Moe AS / Faktura 1003";"";"5250,00"
"25.01.2026";"Innbetaling fra Nilsen AS / Faktura 1004";"";"13250,00"
"27.01.2026";"Innbetaling fra Nilsen AS / Faktura 1005";"";"16562,50"
"29.01.2026";"Betaling Leverandor Ødegård AS";"19650,00";""
"30.01.2026";"Betaling Leverandor Moe AS";"9950,00";""
"31.01.2026";"Betaling Leverandor Hansen AS";"18250,00";""
"01.02.2026";"Bankgebyr";"1795,86";""
"03.02.2026";"Bankgebyr";"610,21";""`;

console.log("\n=== DNB v2 (no blank line) ===");
await tryImport(67, "DNB_CSV", dnbCsv2, "DNB-v2");

// Danske Bank format: real Danske exports
// Bokført dato;Rentedato;Tekst;Beløp i NOK;Bokført saldo i NOK;Status
const danskeCsv = `"Bokført dato";"Rentedato";"Tekst";"Beløp i NOK";"Bokført saldo i NOK";"Status"
"03.02.2026";"03.02.2026";"Bankgebyr";"-610,21";"103506,43";"Utført"
"01.02.2026";"01.02.2026";"Bankgebyr";"-1795,86";"104116,64";"Utført"
"31.01.2026";"31.01.2026";"Betaling Leverandor Hansen AS";"-18250,00";"105912,50";"Utført"
"30.01.2026";"30.01.2026";"Betaling Leverandor Moe AS";"-9950,00";"124162,50";"Utført"
"29.01.2026";"29.01.2026";"Betaling Leverandor Ødegård AS";"-19650,00";"134112,50";"Utført"
"27.01.2026";"27.01.2026";"Innbetaling fra Nilsen AS / Faktura 1005";"16562,50";"153762,50";"Utført"
"25.01.2026";"25.01.2026";"Innbetaling fra Nilsen AS / Faktura 1004";"13250,00";"137200,00";"Utført"
"22.01.2026";"22.01.2026";"Innbetaling fra Moe AS / Faktura 1003";"5250,00";"123950,00";"Utført"
"19.01.2026";"19.01.2026";"Innbetaling fra Johansen AS / Faktura 1002";"14500,00";"118700,00";"Utført"
"16.01.2026";"16.01.2026";"Innbetaling fra Moe AS / Faktura 1001";"4200,00";"104200,00";"Utført"`;

console.log("\n=== Danske Bank (reversed chronological, quoted) ===");
await tryImport(76, "DANSKE_BANK_CSV", danskeCsv, "Danske-v2");

// Try without quotes (unquoted)
const danskeCsvNoQuotes = `Bokført dato;Rentedato;Tekst;Beløp i NOK;Bokført saldo i NOK;Status
03.02.2026;03.02.2026;Bankgebyr;-610,21;103506,43;Utført
01.02.2026;01.02.2026;Bankgebyr;-1795,86;104116,64;Utført
31.01.2026;31.01.2026;Betaling Leverandor Hansen AS;-18250,00;105912,50;Utført
30.01.2026;30.01.2026;Betaling Leverandor Moe AS;-9950,00;124162,50;Utført
29.01.2026;29.01.2026;Betaling Leverandor Ødegård AS;-19650,00;134112,50;Utført
27.01.2026;27.01.2026;Innbetaling fra Nilsen AS / Faktura 1005;16562,50;153762,50;Utført
25.01.2026;25.01.2026;Innbetaling fra Nilsen AS / Faktura 1004;13250,00;137200,00;Utført
22.01.2026;22.01.2026;Innbetaling fra Moe AS / Faktura 1003;5250,00;123950,00;Utført
19.01.2026;19.01.2026;Innbetaling fra Johansen AS / Faktura 1002;14500,00;118700,00;Utført
16.01.2026;16.01.2026;Innbetaling fra Moe AS / Faktura 1001;4200,00;104200,00;Utført`;

console.log("\n=== Danske Bank (no quotes) ===");
await tryImport(76, "DANSKE_BANK_CSV", danskeCsvNoQuotes, "Danske-nq");

// Sbanken Bedrift: Inngående saldo DD.MM.YYYY, Utgående saldo DD.MM.YYYY, Bokført, Rentedato, Beskrivelse, Beløp
const sbankenCsv = `"Inngående saldo 16.01.2026";"100000,00"
"Utgående saldo 03.02.2026";"103506,43"
"Bokført";"Rentedato";"Beskrivelse";"Beløp"
"16.01.2026";"16.01.2026";"Innbetaling fra Moe AS / Faktura 1001";"4200,00"
"19.01.2026";"19.01.2026";"Innbetaling fra Johansen AS / Faktura 1002";"14500,00"
"22.01.2026";"22.01.2026";"Innbetaling fra Moe AS / Faktura 1003";"5250,00"
"25.01.2026";"25.01.2026";"Innbetaling fra Nilsen AS / Faktura 1004";"13250,00"
"27.01.2026";"27.01.2026";"Innbetaling fra Nilsen AS / Faktura 1005";"16562,50"
"29.01.2026";"29.01.2026";"Betaling Leverandor Ødegård AS";"-19650,00"
"30.01.2026";"30.01.2026";"Betaling Leverandor Moe AS";"-9950,00"
"31.01.2026";"31.01.2026";"Betaling Leverandor Hansen AS";"-18250,00"
"01.02.2026";"01.02.2026";"Bankgebyr";"-1795,86"
"03.02.2026";"03.02.2026";"Bankgebyr";"-610,21"`;

console.log("\n=== Sbanken Bedrift (metadata + data) ===");
await tryImport(112, "SBANKEN_BEDRIFT_CSV", sbankenCsv, "Sbanken-v1");
