const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

// Check what file formats DNB supports
const bankR = await fetch(`${BASE}/bank/67?fields=*`, { headers: { Authorization: AUTH } });
const bank = await bankR.json();
console.log("DNB bank:", JSON.stringify(bank.value, null, 2));

// Prepare CSV content
const csvContent = `Dato;Forklaring;Inn;Ut;Saldo
2026-01-16;Innbetaling fra Taylor Ltd / Faktura 1001;5156.25;;105156.25
2026-01-18;Innbetaling fra Wilson Ltd / Faktura 1002;21875.00;;127031.25
2026-01-20;Innbetaling fra Taylor Ltd / Faktura 1003;18625.00;;145656.25
2026-01-22;Innbetaling fra Lewis Ltd / Faktura 1004;27812.50;;173468.75
2026-01-23;Innbetaling fra Brown Ltd / Faktura 1005;12250.00;;185718.75
2026-01-24;Betaling Supplier Taylor Ltd;;-10850.00;174868.75
2026-01-27;Betaling Supplier Taylor Ltd;;-10350.00;164518.75
2026-01-29;Betaling Supplier Smith Ltd;;-6200.00;158318.75
2026-01-30;Renteinntekter;;-1495.08;156823.67
2026-01-31;Skattetrekk;;-1819.20;155004.47
2026-02-02;Skattetrekk;1947.28;;156951.75`;

// Try to import with DNB_CSV format
const formData = new FormData();
formData.append("file", new Blob([csvContent], { type: "text/csv" }), "bankutskrift.csv");

const bankId = 67; // DNB
const accountId = 424190862; // 1920 in sandbox
const importUrl = `${BASE}/bank/statement/import?bankId=${bankId}&accountId=${accountId}&fromDate=2026-01-16&toDate=2026-02-03&fileFormat=DNB_CSV`;

console.log("\n=== Trying DNB_CSV import ===");
const importR = await fetch(importUrl, {
  method: "POST",
  headers: { Authorization: AUTH },
  body: formData,
});
const importJ = await importR.json();
console.log(`Import response: ${importR.status}`);
console.log(JSON.stringify(importJ, null, 2).slice(0, 3000));

if (!importR.ok) {
  // Try NORDEA_CSV
  console.log("\n=== Trying NORDEA_CSV import ===");
  const importUrl2 = `${BASE}/bank/statement/import?bankId=72&accountId=${accountId}&fromDate=2026-01-16&toDate=2026-02-03&fileFormat=NORDEA_CSV`;
  const importR2 = await fetch(importUrl2, {
    method: "POST",
    headers: { Authorization: AUTH },
    body: formData,
  });
  const importJ2 = await importR2.json();
  console.log(`Import response: ${importR2.status}`);
  console.log(JSON.stringify(importJ2, null, 2).slice(0, 3000));

  if (!importR2.ok) {
    // Try DANSKE_BANK_CSV
    console.log("\n=== Trying DANSKE_BANK_CSV import ===");
    const importUrl3 = `${BASE}/bank/statement/import?bankId=76&accountId=${accountId}&fromDate=2026-01-16&toDate=2026-02-03&fileFormat=DANSKE_BANK_CSV`;
    const formData3 = new FormData();
    formData3.append("file", new Blob([csvContent], { type: "text/csv" }), "bankutskrift.csv");
    const importR3 = await fetch(importUrl3, {
      method: "POST",
      headers: { Authorization: AUTH },
      body: formData3,
    });
    const importJ3 = await importR3.json();
    console.log(`Import response: ${importR3.status}`);
    console.log(JSON.stringify(importJ3, null, 2).slice(0, 3000));
  }
}
