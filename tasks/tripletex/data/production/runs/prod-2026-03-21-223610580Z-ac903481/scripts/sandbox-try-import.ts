const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const accountId = 424190862; // 1920 Bankinnskudd

// Our raw CSV
const rawCsv = `Dato;Forklaring;Inn;Ut;Saldo
2026-01-16;Innbetaling fra Moe AS / Faktura 1001;4200.00;;104200.00
2026-01-19;Innbetaling fra Johansen AS / Faktura 1002;14500.00;;118700.00
2026-01-22;Innbetaling fra Moe AS / Faktura 1003;5250.00;;123950.00
2026-01-25;Innbetaling fra Nilsen AS / Faktura 1004;13250.00;;137200.00
2026-01-27;Innbetaling fra Nilsen AS / Faktura 1005;16562.50;;153762.50
2026-01-29;Betaling Leverandor Ødegård AS;;-19650.00;134112.50
2026-01-30;Betaling Leverandor Moe AS;;-9950.00;124162.50
2026-01-31;Betaling Leverandor Hansen AS;;-18250.00;105912.50
2026-02-01;Bankgebyr;;-1795.86;104116.64
2026-02-03;Bankgebyr;;-610.21;103506.43`;

// DNB CSV format: "Dato";"Forklaring";"Rentedato";"Ut av konto";"Inn på konto"
// DD.MM.YYYY, Norwegian number format with comma decimal, space thousands
function toDnbCsv(raw: string): string {
  const lines = raw.trim().split("\n");
  const dataLines = lines.slice(1); // skip header
  const header = '"Dato";"Forklaring";"Rentedato";"Ut av konto";"Inn på konto"';
  const rows = dataLines.map(line => {
    const [date, desc, inn, ut] = line.split(";");
    const [y, m, d] = date.split("-");
    const dateNorw = `${d}.${m}.${y}`;
    const innFmt = inn ? `"${inn.replace(".", ",")}"` : '""';
    const utFmt = ut ? `"${Math.abs(parseFloat(ut)).toFixed(2).replace(".", ",")}"` : '""';
    return `"${dateNorw}";"${desc}";"${dateNorw}";${utFmt};${innFmt}`;
  });
  return header + "\n" + rows.join("\n");
}

// Danske Bank CSV: "Dato";"Tekst";"Beløb" where Beløb is + or -
function toDanskeCsv(raw: string): string {
  const lines = raw.trim().split("\n");
  const dataLines = lines.slice(1);
  const header = '"Dato";"Tekst";"Beløb"';
  const rows = dataLines.map(line => {
    const [date, desc, inn, ut] = line.split(";");
    const [y, m, d] = date.split("-");
    const dateNorw = `${d}.${m}.${y}`;
    let amount = "0";
    if (inn && inn.trim()) amount = inn.replace(".", ",");
    else if (ut && ut.trim()) amount = ut.replace(".", ","); // already negative in CSV
    return `"${dateNorw}";"${desc}";"${amount}"`;
  });
  return header + "\n" + rows.join("\n");
}

// Nordea CSV: "Bokf.dato";"Beløp";"Avsender/mottaker";"Tekst";"Ref.";"Saldo"
function toNordeaCsv(raw: string): string {
  const lines = raw.trim().split("\n");
  const dataLines = lines.slice(1);
  const header = '"Bokf.dato";"Beløp";"Avsender/mottaker";"Tekst";"Ref.";"Saldo"';
  const rows = dataLines.map(line => {
    const [date, desc, inn, ut, saldo] = line.split(";");
    const [y, m, d] = date.split("-");
    const dateNorw = `${d}.${m}.${y}`;
    let amount = "0,00";
    if (inn && inn.trim()) amount = inn.replace(".", ",");
    else if (ut && ut.trim()) amount = ut.replace(".", ",");
    const saldoFmt = saldo ? saldo.replace(".", ",") : "";
    return `"${dateNorw}";"${amount}";"";"${desc}";"";"${saldoFmt}"`;
  });
  return header + "\n" + rows.join("\n");
}

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
  console.log(`[${label}] POST bank/statement/import bankId=${bankId} format=${format} → ${r.status}`);
  console.log(`  ${t.substring(0, 500)}`);
  return r.status;
}

// Try DNB format
const dnbCsv = toDnbCsv(rawCsv);
console.log("DNB CSV sample:");
console.log(dnbCsv.split("\n").slice(0, 3).join("\n"));
console.log("---");
await tryImport(67, "DNB_CSV", dnbCsv, "DNB");

// Try Danske Bank format
const danskeCsv = toDanskeCsv(rawCsv);
console.log("\nDanske CSV sample:");
console.log(danskeCsv.split("\n").slice(0, 3).join("\n"));
console.log("---");
await tryImport(76, "DANSKE_BANK_CSV", danskeCsv, "Danske");

// Try Nordea format
const nordeaCsv = toNordeaCsv(rawCsv);
console.log("\nNordea CSV sample:");
console.log(nordeaCsv.split("\n").slice(0, 3).join("\n"));
console.log("---");
await tryImport(72, "NORDEA_CSV", nordeaCsv, "Nordea");
