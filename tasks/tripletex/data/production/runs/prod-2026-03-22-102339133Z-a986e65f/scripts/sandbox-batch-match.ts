/**
 * Sandbox test: Can we batch multiple bank reconciliation matches into fewer API calls?
 * Test 1: Send all 10 txn/posting pairs grouped by recon in one call each
 * Test 2: Send all matches in a single call (if same recon)
 *
 * Also test: Can we combine OB voucher with supplier voucher?
 */

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function api(method: string, path: string, body?: any, isForm = false): Promise<any> {
  const url = `${BASE}/${path}`;
  const headers: any = { Authorization: AUTH };
  if (body && !isForm) headers["Content-Type"] = "application/json";
  const opts: any = { method, headers };
  if (body) opts.body = isForm ? body : JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) console.error(`ERR ${res.status} ${method} /${path.split("?")[0]}: ${JSON.stringify(data).slice(0, 500)}`);
  return { ok: res.ok, status: res.status, data };
}

const get = (p: string) => api("GET", p);
const post = (p: string, b?: any, isForm = false) => api("POST", p, b, isForm);
const put = (p: string, b: any) => api("PUT", p, b);

// Step 1: Get accounts and periods
console.log("=== Setting up sandbox test ===");

const [accountsRes, periodsRes] = await Promise.all([
  get("ledger/account?number=1920,2050,2400,2600,7770,8050&fields=*"),
  get("ledger/accountingPeriod?startFrom=2026-03-01&startTo=2026-04-01&count=12&fields=*"),
]);

const accounts = accountsRes.data.values || [];
const acctMap: Record<number, number> = {};
for (const a of accounts) acctMap[a.number] = a.id;
console.log(`Accounts: ${Object.entries(acctMap).map(([n,id]) => `${n}=${id}`).join(", ")}`);

const periods = periodsRes.data.values || [];
const marchPeriod = periods.find((p: any) => p.start?.startsWith("2026-03"));
console.log(`March 2026 period: id=${marchPeriod?.id} (${marchPeriod?.start} to ${marchPeriod?.end})`);

if (!marchPeriod) { console.error("No March 2026 period found"); process.exit(1); }

// Step 2: Create a test voucher with 3 postings on 1920 (simulating 3 bank lines)
// We'll create amounts that match what we'll import
const testAmounts = [1234.56, -567.89, 890.12];
const obAmount = 50000;

console.log("\n=== Test: Combine OB + supplier postings in one voucher ===");
const combinedPostings: any[] = [];
let row = 1;

// OB postings
combinedPostings.push({
  row: row++, date: "2026-03-15", description: "OB test", account: { id: acctMap[1920] },
  amount: obAmount, amountCurrency: obAmount, amountGross: obAmount, amountGrossCurrency: obAmount, currency: { id: 1 },
});
combinedPostings.push({
  row: row++, date: "2026-03-15", description: "OB test", account: { id: acctMap[2050] },
  amount: -obAmount, amountCurrency: -obAmount, amountGross: -obAmount, amountGrossCurrency: -obAmount, currency: { id: 1 },
});

// Test transaction postings (simulating bank lines)
for (const amt of testAmounts) {
  if (amt > 0) {
    // Incoming: DR 1920, CR 8050
    combinedPostings.push({
      row: row++, date: "2026-03-16", description: `Test line ${amt}`, account: { id: acctMap[1920] },
      amount: amt, amountCurrency: amt, amountGross: amt, amountGrossCurrency: amt, currency: { id: 1 },
    });
    combinedPostings.push({
      row: row++, date: "2026-03-16", description: `Test line ${amt}`, account: { id: acctMap[8050] },
      amount: -amt, amountCurrency: -amt, amountGross: -amt, amountGrossCurrency: -amt, currency: { id: 1 },
    });
  } else {
    // Outgoing: DR 2400, CR 1920
    combinedPostings.push({
      row: row++, date: "2026-03-17", description: `Test line ${amt}`, account: { id: acctMap[2400] },
      amount: -amt, amountCurrency: -amt, amountGross: -amt, amountGrossCurrency: -amt, currency: { id: 1 },
    });
    combinedPostings.push({
      row: row++, date: "2026-03-17", description: `Test line ${amt}`, account: { id: acctMap[1920] },
      amount: amt, amountCurrency: amt, amountGross: amt, amountGrossCurrency: amt, currency: { id: 1 },
    });
  }
}

const voucherRes = await post("ledger/voucher", {
  date: "2026-03-15",
  description: "Combined OB + transactions test",
  postings: combinedPostings,
});
console.log(`Combined voucher: ok=${voucherRes.ok} id=${voucherRes.data?.value?.id}`);

if (!voucherRes.ok) {
  console.log("Combined voucher FAILED — need separate OB voucher");
  console.log(JSON.stringify(voucherRes.data).slice(0, 500));
} else {
  // Verify postings
  const verifyRes = await get(`ledger/voucher/${voucherRes.data.value.id}?fields=*,postings(*)`);
  const postings = verifyRes.data?.value?.postings || [];
  console.log(`  Verified: ${postings.length} postings`);
  for (const p of postings) {
    console.log(`    row=${p.row} acct=${p.account?.number} amount=${p.amount} desc="${p.description}"`);
  }
}

// Step 3: Import a fake bank statement with 3 lines
console.log("\n=== Import test bank statement ===");
const sbankenCsv = [
  `"Inngående saldo 15.03.2026";"50000,00"`,
  `"Utgående saldo 17.03.2026";"51556,79"`,
  `"Bokført";"Rentedato";"Beskrivelse";"Beløp"`,
  `"16.03.2026";"16.03.2026";"Test incoming 1";"1234,56"`,
  `"17.03.2026";"17.03.2026";"Test outgoing 1";"-567,89"`,
  `"17.03.2026";"17.03.2026";"Test incoming 2";"890,12"`,
].join("\n") + "\n";

const formData = new FormData();
formData.append("file", new Blob([sbankenCsv], { type: "text/csv" }), "test.csv");
const importRes = await post(
  `bank/statement/import?bankId=112&accountId=${acctMap[1920]}&fromDate=2026-03-15&toDate=2026-03-18&fileFormat=SBANKEN_BEDRIFT_CSV`,
  formData, true
);
console.log(`Bank import: ok=${importRes.ok} id=${importRes.data?.value?.id}`);
if (!importRes.ok) {
  console.log(JSON.stringify(importRes.data).slice(0, 500));
  process.exit(1);
}

const txnIds = (importRes.data?.value?.transactions || []).map((t: any) => t.id);
console.log(`Transaction IDs: [${txnIds.join(", ")}]`);

// Step 4: Get postings on 1920 to find matches
const postingsRes2 = await get(`ledger/posting?accountId=${acctMap[1920]}&dateFrom=2026-03-15&dateTo=2026-03-18&count=1000&fields=id,date,amount,description`);
const postings1920 = (postingsRes2.data.values || []).filter((p: any) =>
  testAmounts.some(a => Math.abs(p.amount - a) < 0.01)
);
console.log(`\nPostings on 1920 matching test amounts:`);
for (const p of postings1920) {
  console.log(`  id=${p.id} date=${p.date} amount=${p.amount} desc="${p.description}"`);
}

// Step 5: Create a reconciliation
const reconRes = await post("bank/reconciliation", {
  account: { id: acctMap[1920] },
  accountingPeriod: { id: marchPeriod.id },
  type: "MANUAL",
  bankAccountClosingBalanceCurrency: 0,
  isClosed: false,
});
console.log(`\nRecon created: ok=${reconRes.ok} id=${reconRes.data?.value?.id} v=${reconRes.data?.value?.version}`);
const reconId = reconRes.data?.value?.id;

// Step 6: TEST BATCH MATCHING — send all 3 matches in ONE call
console.log("\n=== TEST: Batch match (all 3 in one call) ===");

// Match each txn to its posting
const matchPairs: { txnId: number; postingId: number; amount: number }[] = [];
const usedPostings = new Set<number>();
for (let i = 0; i < testAmounts.length; i++) {
  const amt = testAmounts[i];
  const posting = postings1920.find((p: any) => Math.abs(p.amount - amt) < 0.01 && !usedPostings.has(p.id));
  if (posting) {
    usedPostings.add(posting.id);
    matchPairs.push({ txnId: txnIds[i], postingId: posting.id, amount: amt });
    console.log(`  Pair: txn=${txnIds[i]} (${amt}) ↔ posting=${posting.id} (${posting.amount})`);
  } else {
    console.log(`  No posting found for amount ${amt}`);
  }
}

// Try sending all transactions and all postings in ONE match call
const batchMatchRes = await post("bank/reconciliation/match", {
  bankReconciliation: { id: reconId },
  transactions: matchPairs.map(p => ({ id: p.txnId })),
  postings: matchPairs.map(p => ({ id: p.postingId })),
});
console.log(`Batch match result: ok=${batchMatchRes.ok} status=${batchMatchRes.status}`);
if (batchMatchRes.ok) {
  console.log(`  BATCH MATCH WORKS! Response: ${JSON.stringify(batchMatchRes.data).slice(0, 500)}`);
} else {
  console.log(`  Batch match FAILED: ${JSON.stringify(batchMatchRes.data).slice(0, 500)}`);

  // Fallback: try individual matches
  console.log("\n=== FALLBACK: Individual matches ===");
  for (const mp of matchPairs) {
    const res = await post("bank/reconciliation/match", {
      bankReconciliation: { id: reconId },
      transactions: [{ id: mp.txnId }],
      postings: [{ id: mp.postingId }],
    });
    console.log(`  Match txn=${mp.txnId} ↔ posting=${mp.postingId}: ok=${res.ok} ${res.ok ? "" : JSON.stringify(res.data).slice(0, 200)}`);
  }
}

// Step 7: Verify the recon after matches
const reconVerify = await get(`bank/reconciliation/${reconId}?fields=*`);
console.log(`\nRecon after matches: isClosed=${reconVerify.data?.value?.isClosed} v=${reconVerify.data?.value?.version}`);

// Step 8: Try closing
const closingBalance = 50000 + 1234.56 - 567.89 + 890.12; // 51556.79
console.log(`\nClosing balance: ${closingBalance}`);
const closeRes = await put(`bank/reconciliation/${reconId}`, {
  id: reconId, version: reconRes.data?.value?.version,
  account: { id: acctMap[1920] }, accountingPeriod: { id: marchPeriod.id },
  type: "MANUAL", bankAccountClosingBalanceCurrency: Math.round(closingBalance * 100) / 100, isClosed: true,
});
console.log(`Close recon: ok=${closeRes.ok} ${closeRes.ok ? "" : JSON.stringify(closeRes.data).slice(0, 500)}`);

console.log("\n=== DONE ===");
