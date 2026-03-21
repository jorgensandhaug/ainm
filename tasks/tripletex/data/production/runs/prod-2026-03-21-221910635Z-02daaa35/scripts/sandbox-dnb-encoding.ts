const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const accountId = 424190862; // 1920

// The DNB CSV format:
// Konto;Kontonavn;Inngående saldo;Utgående saldo;Bokført dato;Forklarende tekst;Ut;Inn
// Let me try various approaches

const csvText = `Konto;Kontonavn;Inngående saldo;Utgående saldo;Bokført dato;Forklarende tekst;Ut;Inn
12345678;Bankkonto;100000,00;105156,25;16.01.2026;Innbetaling fra Taylor Ltd / Faktura 1001;;5156,25
12345678;Bankkonto;105156,25;127031,25;18.01.2026;Innbetaling fra Wilson Ltd / Faktura 1002;;21875,00`;

// Norwegian uses comma for decimals, not dots!
// Also try with \r\n line endings (Windows)
const csvCRLF = csvText.replace(/\n/g, "\r\n");

async function tryUpload(csvData: string | Uint8Array, label: string, contentType: string = "text/csv") {
  const blob = typeof csvData === "string"
    ? new Blob([csvData], { type: contentType })
    : new Blob([csvData], { type: contentType });
  const formData = new FormData();
  formData.append("file", blob, "bankutskrift.csv");
  const url = `${BASE}/bank/statement/import?bankId=67&accountId=${accountId}&fromDate=2026-01-16&toDate=2026-02-03&fileFormat=DNB_CSV`;
  const r = await fetch(url, {
    method: "POST",
    headers: { Authorization: AUTH },
    body: formData,
  });
  const j = await r.json();
  console.log(`${label}: ${r.status}`);
  if (!r.ok) {
    console.log(`  Error: ${j.validationMessages?.[0]?.message || j.message}`);
  } else {
    console.log(`  SUCCESS!`);
    console.log(JSON.stringify(j, null, 2).slice(0, 2000));
  }
  return r.ok;
}

// 1. Norwegian comma decimals + semicolons
await tryUpload(csvText, "comma decimals, LF");

// 2. Norwegian comma decimals + CRLF
await tryUpload(csvCRLF, "comma decimals, CRLF");

// 3. With a "summary" header line before the column headers (some DNB exports have this)
const csvWithHeader = `\n${csvText}`;
await tryUpload(csvWithHeader, "empty line prefix + comma decimals");

// 4. Try encoding as ISO-8859-1 manually
// Encode characters like ø, å as ISO-8859-1 bytes
function encodeToLatin1(str: string): Uint8Array {
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    bytes[i] = c > 255 ? 63 : c; // ? for unmappable chars
  }
  return bytes;
}
await tryUpload(encodeToLatin1(csvCRLF), "Latin-1, CRLF, comma decimals", "text/csv;charset=ISO-8859-1");

// 5. Try with UTF-8 BOM
const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
const csvBytes = new TextEncoder().encode(csvText);
const csvWithBOM = new Uint8Array(bom.length + csvBytes.length);
csvWithBOM.set(bom);
csvWithBOM.set(csvBytes, bom.length);
await tryUpload(csvWithBOM, "UTF-8 BOM + comma decimals");

// 6. Try dot decimals (international format)
const csvDotDecimal = `Konto;Kontonavn;Inngående saldo;Utgående saldo;Bokført dato;Forklarende tekst;Ut;Inn
12345678;Bankkonto;100000.00;105156.25;16.01.2026;Innbetaling fra Taylor Ltd / Faktura 1001;;5156.25
12345678;Bankkonto;105156.25;127031.25;18.01.2026;Innbetaling fra Wilson Ltd / Faktura 1002;;21875.00`;
await tryUpload(csvDotDecimal, "dot decimals, LF");

// 7. Try with tab separator
const csvTab = csvDotDecimal.replace(/;/g, "\t");
await tryUpload(csvTab, "dot decimals, tab separator");
