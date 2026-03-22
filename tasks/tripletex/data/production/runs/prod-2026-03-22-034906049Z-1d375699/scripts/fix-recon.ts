const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "OMbcxyWPqsYV1WDCwfFTSNImF60oBNhsvDr91fL0pNA";
const AUTH = "Basic " + btoa("0:" + TOKEN);

let callCount = 0;
let errorCount = 0;

async function api(method: string, path: string, body?: any): Promise<any> {
  callCount++;
  const url = `${BASE}/${path}`;
  const headers: any = { Authorization: AUTH, "Content-Type": "application/json" };
  const opts: any = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) {
    errorCount++;
    console.error(`ERROR ${res.status} ${method} ${path}:`, typeof data === "string" ? data.substring(0, 500) : JSON.stringify(data).substring(0, 500));
  }
  return data;
}

const get = (p: string) => api("GET", p);
const post = (p: string, b?: any) => api("POST", p, b);
const put = (p: string, b: any) => api("PUT", p, b);

const acct1920Id = 463464385;
const febPeriodId = 23974092;
const febReconId = 12705545;
const bankStatementId = 123943592;

// Step 1: Get January period + reopen February recon + get bank txns + get postings
const [janPeriodRes, febReconFresh, bankTxnRes, postingsRes] = await Promise.all([
  get("ledger/accountingPeriod?startFrom=2026-01-01&startTo=2026-01-02&count=1&fields=*"),
  get(`bank/reconciliation/${febReconId}?fields=*`),
  get(`bank/statement/transaction?bankStatementId=${bankStatementId}&count=1000&fields=id,postedDate,amountCurrency,description`),
  get(`ledger/posting?accountId=${acct1920Id}&dateFrom=2026-01-16&dateTo=2026-03-01&count=1000&fields=id,date,amount,description`),
]);

const janPeriod = janPeriodRes.values?.[0];
console.log(`January period: id=${janPeriod?.id}`);

const febRecon = febReconFresh.value;
console.log(`February recon: id=${febRecon?.id}, version=${febRecon?.version}, isClosed=${febRecon?.isClosed}`);

const bankTxns = bankTxnRes.values || [];
const allPostings = postingsRes.values || [];
console.log(`Bank txns: ${bankTxns.length}, Postings: ${allPostings.length}`);

// Log bank txns and postings for debugging
for (const txn of bankTxns) {
  console.log(`  BankTxn ${txn.id}: date=${txn.postedDate}, amount=${txn.amountCurrency}, desc=${txn.description}`);
}
for (const p of allPostings) {
  console.log(`  Posting ${p.id}: date=${p.date}, amount=${p.amount}, desc=${p.description}`);
}

// Step 2: Reopen February reconciliation
console.log("\nReopening February reconciliation...");
const reopenRes = await put(`bank/reconciliation/${febReconId}`, {
  id: febReconId,
  version: febRecon.version,
  account: { id: acct1920Id },
  accountingPeriod: { id: febPeriodId },
  type: "MANUAL",
  bankAccountClosingBalanceCurrency: 0,
  isClosed: false,
});
console.log(`Reopen: ${reopenRes?.value ? "OK" : "FAILED"}`);
if (!reopenRes?.value) console.error(JSON.stringify(reopenRes).substring(0, 500));

// Step 3: Create January reconciliation
console.log("\nCreating January reconciliation...");
const janReconRes = await post("bank/reconciliation", {
  account: { id: acct1920Id },
  accountingPeriod: { id: janPeriod.id },
  type: "MANUAL",
  bankAccountClosingBalanceCurrency: 0,
  isClosed: false,
});
const janRecon = janReconRes.value;
console.log(`January recon: id=${janRecon?.id}`);

// Step 4: Match bank txns to postings, using the correct reconciliation per month
const usedPostingIds = new Set<number>();
let matchCount = 0;
let matchErrors = 0;

for (const txn of bankTxns) {
  const txnDate = txn.postedDate;
  const isJanuary = txnDate && txnDate.startsWith("2026-01");
  const reconId = isJanuary ? janRecon.id : febReconId;

  const matchPosting = allPostings.find((p: any) =>
    Math.abs(p.amount - txn.amountCurrency) < 0.01 && !usedPostingIds.has(p.id)
  );

  if (matchPosting) {
    usedPostingIds.add(matchPosting.id);
    const matchRes = await post("bank/reconciliation/match", {
      bankReconciliation: { id: reconId },
      transactions: [{ id: txn.id }],
      postings: [{ id: matchPosting.id }],
    });
    if (matchRes?.value) {
      matchCount++;
      console.log(`  Matched txn ${txn.id} (${txn.amountCurrency}) -> posting ${matchPosting.id} (${matchPosting.amount}) [${isJanuary ? 'JAN' : 'FEB'}]`);
    } else {
      matchErrors++;
      console.error(`  Match FAILED txn ${txn.id} (${txn.amountCurrency}): ${JSON.stringify(matchRes).substring(0, 300)}`);
    }
  } else {
    console.log(`  No posting match for bank txn ${txn.id}: amount=${txn.amountCurrency}`);
  }
}
console.log(`Matched: ${matchCount}/${bankTxns.length}, errors: ${matchErrors}`);

// Step 5: Close both reconciliations
// January closing balance: 100000 + 30750+4750+2225+12750+6500-19550-19700-13200 = 104525
const janClosingBalance = 104525;
const febClosingBalance = 107786.02;

// Get fresh versions
const [freshJanRecon, freshFebRecon] = await Promise.all([
  get(`bank/reconciliation/${janRecon.id}?fields=*`),
  get(`bank/reconciliation/${febReconId}?fields=*`),
]);

console.log(`\nClosing January recon (balance=${janClosingBalance}, version=${freshJanRecon.value?.version})...`);
const closeJanRes = await put(`bank/reconciliation/${janRecon.id}`, {
  id: janRecon.id,
  version: freshJanRecon.value.version,
  account: { id: acct1920Id },
  accountingPeriod: { id: janPeriod.id },
  type: "MANUAL",
  bankAccountClosingBalanceCurrency: janClosingBalance,
  isClosed: true,
});
console.log(`January close: ${closeJanRes?.value ? "OK" : "FAILED"}`);
if (!closeJanRes?.value) console.error(JSON.stringify(closeJanRes).substring(0, 500));

console.log(`Closing February recon (balance=${febClosingBalance}, version=${freshFebRecon.value?.version})...`);
const closeFebRes = await put(`bank/reconciliation/${febReconId}`, {
  id: febReconId,
  version: freshFebRecon.value.version,
  account: { id: acct1920Id },
  accountingPeriod: { id: febPeriodId },
  type: "MANUAL",
  bankAccountClosingBalanceCurrency: febClosingBalance,
  isClosed: true,
});
console.log(`February close: ${closeFebRes?.value ? "OK" : "FAILED"}`);
if (!closeFebRes?.value) console.error(JSON.stringify(closeFebRes).substring(0, 500));

console.log(`\n=== FIX DONE: ${callCount} additional calls, ${errorCount} errors ===`);
