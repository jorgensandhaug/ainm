// Verify: does reconciliation version increment after POST /bank/reconciliation/match?
// Production run showed version=0 after 3 successful matches - contradicting trusted standard

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

let callCount = 0;
async function api(method: string, path: string, body?: any, isFormData = false): Promise<any> {
  callCount++;
  const url = `${BASE}/${path}`;
  const headers: any = { Authorization: AUTH };
  if (body && !isFormData) headers["Content-Type"] = "application/json";
  const opts: any = { method, headers };
  if (body) opts.body = isFormData ? body : JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) console.error(`ERROR ${res.status} ${method} /${path}:`, JSON.stringify(data).substring(0, 500));
  return { ok: res.ok, status: res.status, data };
}

const get = (p: string) => api("GET", p);
const post = (p: string, b?: any, f = false) => api("POST", p, b, f);
const put = (p: string, b: any) => api("PUT", p, b);

// Find a period that doesn't have a closed reconciliation
const periodsRes = await get("ledger/accountingPeriod?startFrom=2027-10-01&startTo=2028-01-01&count=3&fields=*");
const testPeriods = periodsRes.data.values || [];
console.log("Available test periods:");
for (const p of testPeriods) console.log(`  ${p.name} id=${p.id} start=${p.start}`);

// Check existing recons
const reconsRes = await get("bank/reconciliation?count=100&fields=id,accountingPeriod(id,start),isClosed");
const existingReconPeriods = new Set((reconsRes.data.values || []).map((r: any) => r.accountingPeriod?.id));
console.log("Existing recon period IDs:", [...existingReconPeriods]);

// Find a period without existing recon
const freePeriod = testPeriods.find((p: any) => !existingReconPeriods.has(p.id));
console.log(`\nUsing period: ${freePeriod?.name} id=${freePeriod?.id}`);

if (!freePeriod) {
  console.log("No free period available for testing");
  process.exit(0);
}

// Get account 1920
const acctRes = await get("ledger/account?number=1920&fields=id");
const acct1920Id = acctRes.data.values?.[0]?.id;
const acct8050Res = await get("ledger/account?number=8050&fields=id");
const acct8050Id = acct8050Res.data.values?.[0]?.id;

// Create a test voucher on account 1920 in this period
const testDate = freePeriod.start;
const voucherRes = await post("ledger/voucher", {
  date: testDate,
  description: "Test version tracking",
  postings: [
    { row: 1, date: testDate, description: "Test", account: { id: acct1920Id }, amount: 999.99, amountCurrency: 999.99, amountGross: 999.99, amountGrossCurrency: 999.99, currency: { id: 1 } },
    { row: 2, date: testDate, description: "Test", account: { id: acct8050Id }, amount: -999.99, amountCurrency: -999.99, amountGross: -999.99, amountGrossCurrency: -999.99, currency: { id: 1 } },
  ],
});
console.log(`Test voucher: ${voucherRes.ok ? `id=${voucherRes.data.value.id}` : "ERROR"}`);

// Import a mini bank statement
const fmt = (n: number) => n.toFixed(2).replace(".", ",");
const d = testDate.split("-").reverse().join(".");
const nextD = (() => { const dd = new Date(testDate); dd.setDate(dd.getDate() + 1); return dd.toISOString().split("T")[0]; })();
const sbankenCsv = `"Inngående saldo ${d}";"0,00"\n"Utgående saldo ${d}";"999,99"\n"Bokført";"Rentedato";"Beskrivelse";"Beløp"\n"${d}";"${d}";"Test txn";"999,99"\n`;

const form = new FormData();
form.append("file", new Blob([sbankenCsv], { type: "text/csv" }), "test.csv");
const importRes = await post(`bank/statement/import?bankId=112&accountId=${acct1920Id}&fromDate=${testDate}&toDate=${nextD}&fileFormat=SBANKEN_BEDRIFT_CSV`, form, true);
console.log(`Import: ${importRes.ok ? `id=${importRes.data.value.id}` : "ERROR"}`);
if (!importRes.ok) {
  console.log("Import error:", JSON.stringify(importRes.data).substring(0, 500));
  process.exit(1);
}

const bankStmtId = importRes.data.value.id;
const importTxns = importRes.data.value.transactions || [];
console.log(`Import returned ${importTxns.length} transactions`);
for (const t of importTxns) {
  console.log(`  txn id=${t.id}, amountCurrency=${t.amountCurrency}, description=${t.description}`);
}

// Get bank txns to verify
const bankTxnRes = await get(`bank/statement/transaction?bankStatementId=${bankStmtId}&count=10&fields=id,postedDate,amountCurrency,description`);
console.log(`GET bank txns:`, (bankTxnRes.data.values || []).map((t: any) => `id=${t.id} amt=${t.amountCurrency}`).join(", "));

// Create reconciliation
const createRecon = await post("bank/reconciliation", {
  account: { id: acct1920Id },
  accountingPeriod: { id: freePeriod.id },
  type: "MANUAL",
  bankAccountClosingBalanceCurrency: 0,
  isClosed: false,
});
const recon = createRecon.data.value;
console.log(`\nRecon created: id=${recon.id}, version=${recon.version}`);

// Get posting for matching
const postingsRes = await get(`ledger/posting?accountId=${acct1920Id}&dateFrom=${testDate}&dateTo=${nextD}&count=10&fields=id,date,amount,description`);
const postings = postingsRes.data.values || [];
console.log(`Postings on 1920: ${postings.length}`);
const matchPosting = postings.find((p: any) => Math.abs(p.amount - 999.99) < 0.01);
console.log(`Match posting: id=${matchPosting?.id} amount=${matchPosting?.amount}`);

// Use the txn ID from import response (not from GET)
const importTxnId = importTxns[0]?.id;
const getTxnId = bankTxnRes.data.values?.[0]?.id;
console.log(`Import txn ID: ${importTxnId}, GET txn ID: ${getTxnId}, same=${importTxnId === getTxnId}`);

if (matchPosting && importTxnId) {
  // Do the match
  const matchRes = await post("bank/reconciliation/match", {
    bankReconciliation: { id: recon.id },
    transactions: [{ id: importTxnId }],
    postings: [{ id: matchPosting.id }],
  });
  console.log(`Match result: ok=${matchRes.ok}`);
  if (!matchRes.ok) console.log("Match error:", JSON.stringify(matchRes.data).substring(0, 500));

  // Check version AFTER match
  const freshRecon = await get(`bank/reconciliation/${recon.id}?fields=*`);
  console.log(`\nVersion AFTER 1 match: ${freshRecon.data.value.version} (was ${recon.version} at creation)`);

  // Try closing with CREATION version (0)
  console.log(`\nAttempting close with CREATION version (${recon.version})...`);
  const closeRes1 = await put(`bank/reconciliation/${recon.id}`, {
    id: recon.id,
    version: recon.version,
    account: { id: acct1920Id },
    accountingPeriod: { id: freePeriod.id },
    type: "MANUAL",
    bankAccountClosingBalanceCurrency: 999.99,
    isClosed: true,
  });
  console.log(`Close with creation version: ok=${closeRes1.ok} status=${closeRes1.status}`);
  if (!closeRes1.ok) {
    console.log("Close error:", JSON.stringify(closeRes1.data).substring(0, 300));

    // Try with fresh version
    console.log(`\nAttempting close with FRESH version (${freshRecon.data.value.version})...`);
    const closeRes2 = await put(`bank/reconciliation/${recon.id}`, {
      id: recon.id,
      version: freshRecon.data.value.version,
      account: { id: acct1920Id },
      accountingPeriod: { id: freePeriod.id },
      type: "MANUAL",
      bankAccountClosingBalanceCurrency: 999.99,
      isClosed: true,
    });
    console.log(`Close with fresh version: ok=${closeRes2.ok} status=${closeRes2.status}`);
  }
}

console.log(`\nTotal sandbox calls: ${callCount}`);
