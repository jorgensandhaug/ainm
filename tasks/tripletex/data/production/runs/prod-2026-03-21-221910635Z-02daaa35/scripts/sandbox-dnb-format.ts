const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const accountId = 424190862;

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
    console.log(`  Error: ${JSON.stringify(j).slice(0, 500)}`);
  } else {
    console.log(`  SUCCESS! Statement ID: ${j.value?.id}`);
    console.log(JSON.stringify(j.value, null, 2).slice(0, 3000));
  }
  return { ok: r.ok, data: j };
}

// Try DNB_CSV with comma separator
const dnbComma = `Konto,Kontonavn,Inngående saldo,Utgående saldo,Bokført dato,Forklarende tekst,Ut,Inn
12345678,Bankkonto,100000.00,105156.25,16.01.2026,Innbetaling fra Taylor Ltd / Faktura 1001,,5156.25
12345678,Bankkonto,105156.25,127031.25,18.01.2026,Innbetaling fra Wilson Ltd / Faktura 1002,,21875.00`;

await tryImport(67, "DNB_CSV", dnbComma, "DNB comma");

// Try DNB_CSV with semicolon but DD.MM.YYYY date format
const dnbSemiDDMM = `Konto;Kontonavn;Inngående saldo;Utgående saldo;Bokført dato;Forklarende tekst;Ut;Inn
12345678;Bankkonto;100000.00;105156.25;16.01.2026;Innbetaling fra Taylor Ltd / Faktura 1001;;5156.25
12345678;Bankkonto;105156.25;127031.25;18.01.2026;Innbetaling fra Wilson Ltd / Faktura 1002;;21875.00`;

await tryImport(67, "DNB_CSV", dnbSemiDDMM, "DNB semi DD.MM.YYYY");

// Try with tab separator
const dnbTab = `Konto\tKontonavn\tInngående saldo\tUtgående saldo\tBokført dato\tForklarende tekst\tUt\tInn
12345678\tBankkonto\t100000.00\t105156.25\t16.01.2026\tInnbetaling fra Taylor Ltd / Faktura 1001\t\t5156.25
12345678\tBankkonto\t105156.25\t127031.25\t18.01.2026\tInnbetaling fra Wilson Ltd / Faktura 1002\t\t21875.00`;

await tryImport(67, "DNB_CSV", dnbTab, "DNB tab");

// Try Danske Bank CSV with our data transformed
const danskeCsv = `Bokført dato;Rentedato;Tekst;Beløp i NOK;Bokført saldo i NOK;Status
16.01.2026;16.01.2026;Innbetaling fra Taylor Ltd / Faktura 1001;5156.25;105156.25;Utført
18.01.2026;18.01.2026;Innbetaling fra Wilson Ltd / Faktura 1002;21875.00;127031.25;Utført`;

await tryImport(76, "DANSKE_BANK_CSV", danskeCsv, "DANSKE semi DD.MM.YYYY");

// Try DANSKE_BANK_CSV with comma
const danskeComma = `Bokført dato,Rentedato,Tekst,Beløp i NOK,Bokført saldo i NOK,Status
16.01.2026,16.01.2026,Innbetaling fra Taylor Ltd / Faktura 1001,5156.25,105156.25,Utført
18.01.2026,18.01.2026,Innbetaling fra Wilson Ltd / Faktura 1002,21875.00,127031.25,Utført`;

await tryImport(76, "DANSKE_BANK_CSV", danskeComma, "DANSKE comma DD.MM.YYYY");
