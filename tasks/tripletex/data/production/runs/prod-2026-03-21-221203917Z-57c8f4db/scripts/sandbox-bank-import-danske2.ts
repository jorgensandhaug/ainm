// Try Danske Bank CSV with unquoted headers and proper Norwegian number format
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

const accts = await get("ledger/account?number=1920&fields=*");
const acct1920 = accts.data.values?.[0];

// Danske Bank CSV: semicolon-separated, headers unquoted
// Date format: DD.MM.YYYY, amounts use comma as decimal, negative amounts for outgoing
const danskeCSV = `Bokført dato;Rentedato;Tekst;Beløp i NOK;Bokført saldo i NOK;Status
18.03.2026;18.03.2026;Test innbetaling;5000,00;105000,00;Utført
19.03.2026;19.03.2026;Test utbetaling;-3000,00;102000,00;Utført
`;

console.log("CSV content:\n" + danskeCSV);

const form1 = new FormData();
form1.append("file", new Blob([danskeCSV], { type: "text/csv" }), "bankutskrift.csv");
const imp1 = await api("POST", `bank/statement/import?bankId=76&accountId=${acct1920.id}&fromDate=2026-03-18&toDate=2026-03-20&fileFormat=DANSKE_BANK_CSV`, undefined, form1);
console.log("Result:", JSON.stringify(imp1.data).slice(0, 800));

if (imp1.status === 201) {
  console.log("\n=== SUCCESS! ===");
  const stmtId = imp1.data.value?.id;
  console.log(`Bank statement created: id=${stmtId}`);

  // Check transactions
  const txns = await get(`bank/statement/transaction?bankStatementId=${stmtId}&count=10&fields=*`);
  console.log(`Transactions: ${txns.data.values?.length}`);
  for (const t of txns.data.values || []) {
    console.log(`  id=${t.id}, date=${t.postedDate}, desc=${t.description}, amount=${t.amountCurrency}, matched=${t.matched}`);
  }

  // Now test: can we link these transactions to a bank reconciliation?
  // Get accounting period for March 2026
  const periods = await get("ledger/accountingPeriod?startFrom=2026-03-01&startTo=2026-03-02&count=1&fields=*");
  const period = periods.data.values?.[0];
  console.log(`\nPeriod: id=${period?.id}, ${period?.start} to ${period?.end}`);

  // Get balance for the period
  const bal = await get("balanceSheet?dateFrom=2026-03-01&dateTo=2026-04-01&accountNumberFrom=1920&accountNumberTo=1920&count=1&fields=*");
  const closingBal = bal.data.values?.[0]?.balanceOut;
  console.log(`Closing balance for March 1920: ${closingBal}`);

  // Check if a reconciliation already exists for March
  const existingRecons = await get("bank/reconciliation?count=100&fields=*");
  const marchRecon = existingRecons.data.values?.find((r: any) => r.accountingPeriod?.id === period?.id);
  if (marchRecon) {
    console.log(`\nExisting March recon: id=${marchRecon.id}, closed=${marchRecon.isClosed}`);
    console.log("Cannot create a new one for March (422 duplicate)");
  } else if (period && closingBal !== undefined) {
    // Create reconciliation with transactions linked
    console.log("\nCreating reconciliation with bank statement transactions...");
    const txnIds = txns.data.values?.map((t: any) => ({ id: t.id })) || [];
    const reconR = await api("POST", "bank/reconciliation", {
      account: { id: acct1920.id },
      accountingPeriod: { id: period.id },
      type: "MANUAL",
      bankAccountClosingBalanceCurrency: closingBal,
      isClosed: true,
      transactions: txnIds,
    });
    console.log("Reconciliation:", reconR.status, JSON.stringify(reconR.data).slice(0, 500));
  }
}

console.log("\nDone.");
