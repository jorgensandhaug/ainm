const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const accountId = 424190862; // 1920 in sandbox

async function tryImport(bankId: number, format: string, csvContent: string, label: string) {
  const formData = new FormData();
  formData.append("file", new Blob([csvContent], { type: "text/csv" }), "bankutskrift.csv");
  const url = `${BASE}/bank/statement/import?bankId=${bankId}&accountId=${accountId}&fromDate=2026-01-16&toDate=2026-02-03&fileFormat=${format}`;
  const r = await fetch(url, {
    method: "POST",
    headers: { Authorization: AUTH },
    body: formData,
  });
  const j = await r.json();
  console.log(`\n${label}: ${r.status}`);
  if (!r.ok) {
    const msg = j.validationMessages?.[0]?.message || j.message;
    console.log(`  Error: ${msg}`);
  } else {
    console.log(`  Success! Statement ID: ${j.value?.id}`);
    console.log(JSON.stringify(j.value, null, 2).slice(0, 1500));
  }
  return r.ok;
}

// Original CSV
const origCsv = `Dato;Forklaring;Inn;Ut;Saldo
2026-01-16;Innbetaling fra Taylor Ltd / Faktura 1001;5156.25;;105156.25
2026-01-18;Innbetaling fra Wilson Ltd / Faktura 1002;21875.00;;127031.25`;

// Try DNB_CSV with transformed columns
const dnbCsv = `Konto;Kontonavn;Inngående saldo;Utgående saldo;Bokført dato;Forklarende tekst;Ut;Inn
12345678;Bankkonto;100000.00;127031.25;2026-01-16;Innbetaling fra Taylor Ltd / Faktura 1001;;5156.25
12345678;Bankkonto;100000.00;127031.25;2026-01-18;Innbetaling fra Wilson Ltd / Faktura 1002;;21875.00`;

// Try SBANKEN_PRIVAT_CSV
await tryImport(112, "SBANKEN_PRIVAT_CSV", origCsv, "SBANKEN_PRIVAT original");

// Try SBANKEN_BEDRIFT_CSV
await tryImport(112, "SBANKEN_BEDRIFT_CSV", origCsv, "SBANKEN_BEDRIFT original");

// Try HAUGESUND_SPAREBANK_CSV
await tryImport(108, "HAUGESUND_SPAREBANK_CSV", origCsv, "HAUGESUND original");

// Try DNB_CSV with transformed columns
await tryImport(67, "DNB_CSV", dnbCsv, "DNB_CSV transformed");

// Try VISMA_ACCOUNT_STATEMENT
await tryImport(67, "VISMA_ACCOUNT_STATEMENT", origCsv, "VISMA original");

// Try VISMA_ACCOUNT_STATEMENT_PLATFORM_AGNOSTIC
await tryImport(67, "VISMA_ACCOUNT_STATEMENT_PLATFORM_AGNOSTIC", origCsv, "VISMA AGNOSTIC original");
