const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const acctId = 424190862;

async function tryImport(fmt: string, csv: string, filename: string) {
  console.log(`\n=== Try: ${fmt} (${filename}) ===`);
  const formData = new FormData();
  const blob = new Blob([csv], { type: "text/csv" });
  formData.append("file", blob, filename);
  const url = `${BASE}/bank/statement/import?bankId=3&accountId=${acctId}&fromDate=2026-01-18&toDate=2026-02-01&fileFormat=${fmt}`;
  const r = await fetch(url, {
    method: "POST",
    headers: { Authorization: AUTH },
    body: formData,
  });
  const j = await r.json();
  console.log("  ->", r.status, JSON.stringify(j).slice(0, 500));
  return r.ok;
}

async function main() {
  // DNB_CSV needs columns: Konto, Kontonavn, Inngående saldo, Utgående saldo, Bokført dato, Forklarende tekst, Ut, Inn
  // Try with both comma and semicolon separators

  // Attempt 1: DNB comma-separated
  const dnbComma = `Konto,Kontonavn,Inngående saldo,Utgående saldo,Bokført dato,Forklarende tekst,Ut,Inn
12345678903,Bankinnskudd,100000.00,161348.59,18.01.2026,Innbetaling fra Costa Lda / Faktura 1001,,11300.00
12345678903,Bankinnskudd,100000.00,161348.59,20.01.2026,Innbetaling fra Martins Lda / Faktura 1002,,18437.50
12345678903,Bankinnskudd,100000.00,161348.59,21.01.2026,Innbetaling fra Santos Lda / Faktura 1003,,22375.00
12345678903,Bankinnskudd,100000.00,161348.59,23.01.2026,Innbetaling fra Santos Lda / Faktura 1004,,9187.50
12345678903,Bankinnskudd,100000.00,161348.59,24.01.2026,Innbetaling fra Rodrigues Lda / Faktura 1005,,30437.50
12345678903,Bankinnskudd,100000.00,161348.59,25.01.2026,Betaling Fornecedor Pereira Lda,13100.00,
12345678903,Bankinnskudd,100000.00,161348.59,26.01.2026,Betaling Fornecedor Ferreira Lda,12150.00,
12345678903,Bankinnskudd,100000.00,161348.59,28.01.2026,Betaling Fornecedor Pereira Lda,6550.00,
12345678903,Bankinnskudd,100000.00,161348.59,30.01.2026,Bankgebyr,,1634.39
12345678903,Bankinnskudd,100000.00,161348.59,31.01.2026,Skattetrekk,318.44,
12345678903,Bankinnskudd,100000.00,161348.59,01.02.2026,Renteinntekter,,95.14`;

  if (await tryImport("DNB_CSV", dnbComma, "bankutskrift.csv")) return;

  // Attempt 2: DNB semicolon-separated
  const dnbSemicolon = dnbComma.replace(/,/g, ";");
  if (await tryImport("DNB_CSV", dnbSemicolon, "bankutskrift.csv")) return;

  // Attempt 3: Danske Bank CSV (Bokført dato, Rentedato, Tekst, Beløp i NOK, Bokført saldo i NOK, Status)
  const danskeCSV = `"Bokført dato";"Rentedato";"Tekst";"Beløp i NOK";"Bokført saldo i NOK";"Status"
"18.01.2026";"18.01.2026";"Innbetaling fra Costa Lda / Faktura 1001";"11300,00";"111300,00";"Bokført"
"20.01.2026";"20.01.2026";"Innbetaling fra Martins Lda / Faktura 1002";"18437,50";"129737,50";"Bokført"
"21.01.2026";"21.01.2026";"Innbetaling fra Santos Lda / Faktura 1003";"22375,00";"152112,50";"Bokført"
"23.01.2026";"23.01.2026";"Innbetaling fra Santos Lda / Faktura 1004";"9187,50";"161300,00";"Bokført"
"24.01.2026";"24.01.2026";"Innbetaling fra Rodrigues Lda / Faktura 1005";"30437,50";"191737,50";"Bokført"
"25.01.2026";"25.01.2026";"Betaling Fornecedor Pereira Lda";"-13100,00";"178637,50";"Bokført"
"26.01.2026";"26.01.2026";"Betaling Fornecedor Ferreira Lda";"-12150,00";"166487,50";"Bokført"
"28.01.2026";"28.01.2026";"Betaling Fornecedor Pereira Lda";"-6550,00";"159937,50";"Bokført"
"30.01.2026";"30.01.2026";"Bankgebyr";"1634,39";"161571,89";"Bokført"
"31.01.2026";"31.01.2026";"Skattetrekk";"-318,44";"161253,45";"Bokført"
"01.02.2026";"01.02.2026";"Renteinntekter";"95,14";"161348,59";"Bokført"`;

  if (await tryImport("DANSKE_BANK_CSV", danskeCSV, "bankutskrift.csv")) return;

  console.log("\n\n=== No format worked ===");
}

main().catch(e => console.error("FATAL:", e.message));
