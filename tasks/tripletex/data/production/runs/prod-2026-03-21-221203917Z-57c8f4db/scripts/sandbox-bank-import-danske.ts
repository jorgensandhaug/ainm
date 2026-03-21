// Try importing bank statement by reformatting CSV to Danske Bank CSV format
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function api(method: string, path: string, body?: any, formData?: FormData) {
  const url = `${BASE}/${path}`;
  const opts: any = { method, headers: { Authorization: AUTH } };
  if (body) { opts.headers["Content-Type"] = "application/json"; opts.body = JSON.stringify(body); }
  if (formData) { opts.body = formData; }
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} → ${r.status}`);
  if (!r.ok) console.log("  ERROR:", JSON.stringify(json).slice(0, 800));
  return { status: r.status, data: json };
}

async function get(path: string) { return api("GET", path); }

// Get 1920 account
const accts = await get("ledger/account?number=1920&fields=*");
const acct1920 = accts.data.values?.[0];

// Danske Bank CSV format: "Bokført dato";"Rentedato";"Tekst";"Beløp i NOK";"Bokført saldo i NOK";"Status"
// We need to convert our CSV to this format
// Date format: DD.MM.YYYY
const danskeCSV = `"Bokført dato";"Rentedato";"Tekst";"Beløp i NOK";"Bokført saldo i NOK";"Status"
"18.01.2026";"18.01.2026";"Innbetaling fra Test SL";"5000,00";"105000,00";"Utført"
"19.01.2026";"19.01.2026";"Betaling TestSupp SL";"-3000,00";"102000,00";"Utført"
`;

console.log("\n=== Import as Danske Bank CSV ===");
const form1 = new FormData();
form1.append("file", new Blob([danskeCSV], { type: "text/csv" }), "bankutskrift.csv");
const imp1 = await api("POST", `bank/statement/import?bankId=76&accountId=${acct1920.id}&fromDate=2026-01-18&toDate=2026-01-20&fileFormat=DANSKE_BANK_CSV`, undefined, form1);
console.log("Result:", JSON.stringify(imp1.data).slice(0, 500));

if (imp1.status === 201 || imp1.status === 200) {
  console.log("\n=== Import SUCCESS! Check transactions ===");
  const stmtId = imp1.data.value?.id;
  if (stmtId) {
    const txns = await get(`bank/statement/transaction?bankStatementId=${stmtId}&count=10&fields=*`);
    console.log("Transactions:", txns.data.values?.length);
    for (const t of txns.data.values || []) {
      console.log(`  id=${t.id}, date=${t.postedDate}, desc=${t.description}, amount=${t.amountCurrency}`);
    }
  }
}

// Also try VISMA_ACCOUNT_STATEMENT format
console.log("\n=== Try VISMA_ACCOUNT_STATEMENT ===");
const vismaCSV = `Dato;Forklaring;Inn;Ut;Saldo
18.01.2026;Test payment;5000.00;;105000.00
`;
const form2 = new FormData();
form2.append("file", new Blob([vismaCSV], { type: "text/csv" }), "bankutskrift.csv");
const imp2 = await api("POST", `bank/statement/import?bankId=76&accountId=${acct1920.id}&fromDate=2026-01-18&toDate=2026-01-19&fileFormat=VISMA_ACCOUNT_STATEMENT`, undefined, form2);
console.log("VISMA:", JSON.stringify(imp2.data).slice(0, 500));

// Try VISMA_ACCOUNT_STATEMENT_PLATFORM_AGNOSTIC
console.log("\n=== Try VISMA_ACCOUNT_STATEMENT_PLATFORM_AGNOSTIC ===");
const form3 = new FormData();
form3.append("file", new Blob([vismaCSV], { type: "text/csv" }), "bankutskrift.csv");
const imp3 = await api("POST", `bank/statement/import?bankId=76&accountId=${acct1920.id}&fromDate=2026-01-18&toDate=2026-01-19&fileFormat=VISMA_ACCOUNT_STATEMENT_PLATFORM_AGNOSTIC`, undefined, form3);
console.log("VISMA_PA:", JSON.stringify(imp3.data).slice(0, 500));

// Try ZTL (unknown format)
console.log("\n=== Try ZTL ===");
const form4 = new FormData();
form4.append("file", new Blob([vismaCSV], { type: "text/csv" }), "bankutskrift.csv");
const imp4 = await api("POST", `bank/statement/import?bankId=76&accountId=${acct1920.id}&fromDate=2026-01-18&toDate=2026-01-19&fileFormat=ZTL`, undefined, form4);
console.log("ZTL:", JSON.stringify(imp4.data).slice(0, 500));

console.log("\nDone.");
