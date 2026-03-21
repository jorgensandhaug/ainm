const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const acctId = 424190862;

// Try remaining formats
const formats = [
  "EIKA_TELEPAY", "SPAREBANK1_TELEPAY", "VISMA_ACCOUNT_STATEMENT",
  "HANDELSBANKEN_TELEPAY", "SPAREBANKEN_VEST_TELEPAY",
  "SPAREBANKEN_SOR_TELEPAY", "SPAREBANKEN_OST_TELEPAY",
  "CULTURA_BANK_TELEPAY", "LANDKREDITT_TELEPAY",
  "VISMA_ACCOUNT_STATEMENT_PSD2",
  "VISMA_ACCOUNT_STATEMENT_PLATFORM_AGNOSTIC",
  "VISMA_ACCOUNT_STATEMENT_PDS2_PLATFORM_AGNOSTIC",
];

const csv = `Dato;Forklaring;Inn;Ut;Saldo
2026-01-18;Innbetaling fra Costa Lda / Faktura 1001;11300.00;;111300.00
2026-01-20;Innbetaling fra Martins Lda / Faktura 1002;18437.50;;129737.50
2026-01-21;Innbetaling fra Santos Lda / Faktura 1003;22375.00;;152112.50
2026-01-23;Innbetaling fra Santos Lda / Faktura 1004;9187.50;;161300.00
2026-01-24;Innbetaling fra Rodrigues Lda / Faktura 1005;30437.50;;191737.50
2026-01-25;Betaling Fornecedor Pereira Lda;;-13100.00;178637.50
2026-01-26;Betaling Fornecedor Ferreira Lda;;-12150.00;166487.50
2026-01-28;Betaling Fornecedor Pereira Lda;;-6550.00;159937.50
2026-01-30;Bankgebyr;1634.39;;161571.89
2026-01-31;Skattetrekk;;-318.44;161253.45
2026-02-01;Renteinntekter;95.14;;161348.59`;

async function main() {
  for (const fmt of formats) {
    console.log(`\n=== Try: ${fmt} ===`);
    const formData = new FormData();
    const blob = new Blob([csv], { type: "text/csv" });
    formData.append("file", blob, "bankutskrift.csv");

    const url = `${BASE}/bank/statement/import?bankId=3&accountId=${acctId}&fromDate=2026-01-18&toDate=2026-02-01&fileFormat=${fmt}`;
    const r = await fetch(url, {
      method: "POST",
      headers: { Authorization: AUTH },
      body: formData,
    });
    const text = await r.text();
    console.log("  ->", r.status, text.slice(0, 300));
    if (r.ok) {
      console.log("SUCCESS with format:", fmt);
      break;
    }
  }

  // Also try converting to DNB format
  console.log("\n\n=== Try DNB format conversion ===");
  const dnbCsv = `Konto;Kontonavn;Inngående saldo;Utgående saldo;Bokført dato;Forklarende tekst;Ut;Inn
12345678903;Bankinnskudd;100000.00;161348.59;18.01.2026;Innbetaling fra Costa Lda / Faktura 1001;;11300.00
12345678903;Bankinnskudd;100000.00;161348.59;20.01.2026;Innbetaling fra Martins Lda / Faktura 1002;;18437.50
12345678903;Bankinnskudd;100000.00;161348.59;21.01.2026;Innbetaling fra Santos Lda / Faktura 1003;;22375.00
12345678903;Bankinnskudd;100000.00;161348.59;23.01.2026;Innbetaling fra Santos Lda / Faktura 1004;;9187.50
12345678903;Bankinnskudd;100000.00;161348.59;24.01.2026;Innbetaling fra Rodrigues Lda / Faktura 1005;;30437.50
12345678903;Bankinnskudd;100000.00;161348.59;25.01.2026;Betaling Fornecedor Pereira Lda;13100.00;
12345678903;Bankinnskudd;100000.00;161348.59;26.01.2026;Betaling Fornecedor Ferreira Lda;12150.00;
12345678903;Bankinnskudd;100000.00;161348.59;28.01.2026;Betaling Fornecedor Pereira Lda;6550.00;
12345678903;Bankinnskudd;100000.00;161348.59;30.01.2026;Bankgebyr;;1634.39
12345678903;Bankinnskudd;100000.00;161348.59;31.01.2026;Skattetrekk;318.44;
12345678903;Bankinnskudd;100000.00;161348.59;01.02.2026;Renteinntekter;;95.14`;

  const formData2 = new FormData();
  const blob2 = new Blob([dnbCsv], { type: "text/csv" });
  formData2.append("file", blob2, "bankutskrift_dnb.csv");
  const url2 = `${BASE}/bank/statement/import?bankId=3&accountId=${acctId}&fromDate=2026-01-18&toDate=2026-02-01&fileFormat=DNB_CSV`;
  const r2 = await fetch(url2, {
    method: "POST",
    headers: { Authorization: AUTH },
    body: formData2,
  });
  const j2 = await r2.json();
  console.log("  ->", r2.status, JSON.stringify(j2).slice(0, 500));
}

main().catch(e => console.error("FATAL:", e.message));
