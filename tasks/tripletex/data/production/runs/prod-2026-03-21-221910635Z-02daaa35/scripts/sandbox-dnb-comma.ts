const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const accountId = 424190862;

async function tryUpload(csvData: string, label: string) {
  const formData = new FormData();
  formData.append("file", new Blob([csvData], { type: "text/csv" }), "bankutskrift.csv");
  const url = `${BASE}/bank/statement/import?bankId=67&accountId=${accountId}&fromDate=2026-01-16&toDate=2026-02-03&fileFormat=DNB_CSV`;
  const r = await fetch(url, {
    method: "POST",
    headers: { Authorization: AUTH },
    body: formData,
  });
  const j = await r.json();
  console.log(`${label}: ${r.status} - ${j.validationMessages?.[0]?.message || j.message || 'SUCCESS'}`);
  if (r.ok) console.log(JSON.stringify(j, null, 2).slice(0, 2000));
  return r.ok;
}

// The real DNB kontoutskrift CSV format from Norwegian online banking:
// It seems to use a specific format. Let me try a quote-wrapped approach
const dnb1 = `"Konto";"Kontonavn";"Inngående saldo";"Utgående saldo";"Bokført dato";"Forklarende tekst";"Ut";"Inn"
"12345678";"Bankkonto";"100000,00";"105156,25";"16.01.2026";"Innbetaling fra Taylor Ltd / Faktura 1001";"";"5156,25"
"12345678";"Bankkonto";"105156,25";"127031,25";"18.01.2026";"Innbetaling fra Wilson Ltd / Faktura 1002";"";"21875,00"`;

await tryUpload(dnb1, "quoted columns, semicolons");

// Try with just quoted headers
const dnb2 = `"Konto";"Kontonavn";"Inngående saldo";"Utgående saldo";"Bokført dato";"Forklarende tekst";"Ut";"Inn"
12345678;Bankkonto;100000,00;105156,25;16.01.2026;Innbetaling fra Taylor Ltd / Faktura 1001;;5156,25`;

await tryUpload(dnb2, "quoted headers only");

// Try with date format DD.MM.YYYY and different number format
// Real DNB exports sometimes have "kr" prefix or space as thousands separator
const dnb3 = `"Konto";"Kontonavn";"Inngående saldo";"Utgående saldo";"Bokført dato";"Forklarende tekst";"Ut";"Inn"
"12345678";"Bankkonto";"100 000,00";"105 156,25";"16.01.2026";"Innbetaling fra Taylor Ltd";;5 156,25`;

await tryUpload(dnb3, "space thousands separator");

// Try with ISO date format YYYY-MM-DD
const dnb4 = `"Konto";"Kontonavn";"Inngående saldo";"Utgående saldo";"Bokført dato";"Forklarende tekst";"Ut";"Inn"
"12345678";"Bankkonto";"100000.00";"105156.25";"2026-01-16";"Innbetaling fra Taylor Ltd";;"5156.25"`;

await tryUpload(dnb4, "ISO dates, dot decimals");

// Try using "Dato" instead of "Bokført dato" — maybe the column names are different
const dnb5 = `"Dato";"Forklaring";"Inn";"Ut";"Saldo"
"16.01.2026";"Innbetaling fra Taylor Ltd / Faktura 1001";"5156,25";"";"105156,25"`;

await tryUpload(dnb5, "original Dato/Forklaring headers");

// Try original CSV format with DNB_CSV
const origCsv = `Dato;Forklaring;Inn;Ut;Saldo
2026-01-16;Innbetaling fra Taylor Ltd / Faktura 1001;5156.25;;105156.25
2026-01-18;Innbetaling fra Wilson Ltd / Faktura 1002;21875.00;;127031.25`;
await tryUpload(origCsv, "original CSV as DNB_CSV");

// Also check the BankReconciliationAdjustment schema
const adjR = await fetch(`${BASE}/bank/reconciliation/12705483/:adjustment`, {
  method: "PUT",
  headers: { Authorization: AUTH, "Content-Type": "application/json" },
  body: JSON.stringify([{
    bankReconciliation: { id: 12705483 },
    account: { id: accountId },
    amount: 100,
    date: "2026-08-15",
    description: "Test adjustment",
  }]),
});
const adjJ = await adjR.json();
console.log(`\nAdjustment: ${adjR.status}`);
console.log(JSON.stringify(adjJ, null, 2).slice(0, 1000));
