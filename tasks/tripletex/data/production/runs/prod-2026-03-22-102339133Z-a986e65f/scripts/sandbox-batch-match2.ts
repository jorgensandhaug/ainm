/**
 * Sandbox test: batch matching in a clean period.
 * Uses June 2026 to avoid conflicts with existing recons.
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

console.log("=== Setup ===");

const [accountsRes, periodsRes] = await Promise.all([
  get("ledger/account?number=1920,2050,2400,2600,7770,8050&fields=*"),
  get("ledger/accountingPeriod?startFrom=2026-06-01&startTo=2026-07-01&count=12&fields=*"),
]);

const acctMap: Record<number, number> = {};
for (const a of (accountsRes.data.values || [])) acctMap[a.number] = a.id;
console.log(`Accounts: ${JSON.stringify(acctMap)}`);

const junePeriod = (periodsRes.data.values || []).find((p: any) => p.start?.startsWith("2026-06"));
console.log(`June period: id=${junePeriod?.id} (${junePeriod?.start} to ${junePeriod?.end})`);
if (!junePeriod) { console.error("No June 2026 period"); process.exit(1); }

// Create test voucher with 3 transaction postings on 1920
const testAmounts = [1234.56, -567.89, 890.12];
const obAmount = 50000;

// Test 1: Combined OB + transaction postings in ONE voucher
console.log("\n=== Test 1: Combined OB + transaction voucher ===");
const postings: any[] = [];
let row = 1;

// OB
postings.push({
  row: row++, date: "2026-06-15", description: "OB", account: { id: acctMap[1920] },
  amount: obAmount, amountCurrency: obAmount, amountGross: obAmount, amountGrossCurrency: obAmount, currency: { id: 1 },
});
postings.push({
  row: row++, date: "2026-06-15", description: "OB", account: { id: acctMap[2050] },
  amount: -obAmount, amountCurrency: -obAmount, amountGross: -obAmount, amountGrossCurrency: -obAmount, currency: { id: 1 },
});

// Transaction postings
for (const amt of testAmounts) {
  if (amt > 0) {
    postings.push({ row: row++, date: "2026-06-16", description: `Line ${amt}`, account: { id: acctMap[1920] },
      amount: amt, amountCurrency: amt, amountGross: amt, amountGrossCurrency: amt, currency: { id: 1 } });
    postings.push({ row: row++, date: "2026-06-16", description: `Line ${amt}`, account: { id: acctMap[8050] },
      amount: -amt, amountCurrency: -amt, amountGross: -amt, amountGrossCurrency: -amt, currency: { id: 1 } });
  } else {
    postings.push({ row: row++, date: "2026-06-17", description: `Line ${amt}`, account: { id: acctMap[2400] },
      amount: -amt, amountCurrency: -amt, amountGross: -amt, amountGrossCurrency: -amt, currency: { id: 1 } });
    postings.push({ row: row++, date: "2026-06-17", description: `Line ${amt}`, account: { id: acctMap[1920] },
      amount: amt, amountCurrency: amt, amountGross: amt, amountGrossCurrency: amt, currency: { id: 1 } });
  }
}

const voucherRes = await post("ledger/voucher", { date: "2026-06-15", description: "Combined OB+txns", postings });
console.log(`Combined voucher: ok=${voucherRes.ok} id=${voucherRes.data?.value?.id}`);
if (voucherRes.ok) {
  const verify = await get(`ledger/voucher/${voucherRes.data.value.id}?fields=*,postings(*)`);
  for (const p of (verify.data?.value?.postings || [])) {
    console.log(`  row=${p.row} acct=${p.account?.number} amount=${p.amount} desc="${p.description}"`);
  }
} else {
  console.log("Combined voucher FAILED, creating separate vouchers...");
  // Create OB separately
  const obRes = await post("ledger/voucher", {
    date: "2026-06-15", description: "OB",
    postings: [
      { row: 1, date: "2026-06-15", description: "OB", account: { id: acctMap[1920] },
        amount: obAmount, amountCurrency: obAmount, amountGross: obAmount, amountGrossCurrency: obAmount, currency: { id: 1 } },
      { row: 2, date: "2026-06-15", description: "OB", account: { id: acctMap[2050] },
        amount: -obAmount, amountCurrency: -obAmount, amountGross: -obAmount, amountGrossCurrency: -obAmount, currency: { id: 1 } },
    ],
  });
  console.log(`OB voucher: ok=${obRes.ok} id=${obRes.data?.value?.id}`);

  // Create transaction voucher
  const txnPostings: any[] = [];
  let r2 = 1;
  for (const amt of testAmounts) {
    if (amt > 0) {
      txnPostings.push({ row: r2++, date: "2026-06-16", description: `Line ${amt}`, account: { id: acctMap[1920] },
        amount: amt, amountCurrency: amt, amountGross: amt, amountGrossCurrency: amt, currency: { id: 1 } });
      txnPostings.push({ row: r2++, date: "2026-06-16", description: `Line ${amt}`, account: { id: acctMap[8050] },
        amount: -amt, amountCurrency: -amt, amountGross: -amt, amountGrossCurrency: -amt, currency: { id: 1 } });
    } else {
      txnPostings.push({ row: r2++, date: "2026-06-17", description: `Line ${amt}`, account: { id: acctMap[2400] },
        amount: -amt, amountCurrency: -amt, amountGross: -amt, amountGrossCurrency: -amt, currency: { id: 1 } });
      txnPostings.push({ row: r2++, date: "2026-06-17", description: `Line ${amt}`, account: { id: acctMap[1920] },
        amount: amt, amountCurrency: amt, amountGross: amt, amountGrossCurrency: amt, currency: { id: 1 } });
    }
  }
  const txnRes = await post("ledger/voucher", { date: "2026-06-15", description: "Transaction voucher", postings: txnPostings });
  console.log(`Txn voucher: ok=${txnRes.ok} id=${txnRes.data?.value?.id}`);
}

// Import bank statement
console.log("\n=== Bank statement import ===");
const sbankenCsv = [
  `"Inngående saldo 15.06.2026";"50000,00"`,
  `"Utgående saldo 17.06.2026";"51556,79"`,
  `"Bokført";"Rentedato";"Beskrivelse";"Beløp"`,
  `"16.06.2026";"16.06.2026";"Test incoming 1";"1234,56"`,
  `"17.06.2026";"17.06.2026";"Test outgoing 1";"-567,89"`,
  `"17.06.2026";"17.06.2026";"Test incoming 2";"890,12"`,
].join("\n") + "\n";

const formData = new FormData();
formData.append("file", new Blob([sbankenCsv], { type: "text/csv" }), "test.csv");
const importRes = await post(
  `bank/statement/import?bankId=112&accountId=${acctMap[1920]}&fromDate=2026-06-15&toDate=2026-06-18&fileFormat=SBANKEN_BEDRIFT_CSV`,
  formData, true
);
console.log(`Import: ok=${importRes.ok} id=${importRes.data?.value?.id}`);
if (!importRes.ok) { console.log(JSON.stringify(importRes.data).slice(0, 500)); process.exit(1); }

const txnIds = (importRes.data?.value?.transactions || []).map((t: any) => t.id);
console.log(`Txn IDs: [${txnIds.join(", ")}]`);

// Get postings on 1920
const postingsRes2 = await get(`ledger/posting?accountId=${acctMap[1920]}&dateFrom=2026-06-15&dateTo=2026-06-18&count=1000&fields=id,date,amount,description`);
const all1920 = (postingsRes2.data.values || []).filter((p: any) =>
  testAmounts.some(a => Math.abs(p.amount - a) < 0.01)
);
console.log(`\nPostings on 1920 matching test amounts:`);
for (const p of all1920) console.log(`  id=${p.id} amount=${p.amount} desc="${p.description}"`);

// Create reconciliation
const reconRes = await post("bank/reconciliation", {
  account: { id: acctMap[1920] }, accountingPeriod: { id: junePeriod.id },
  type: "MANUAL", bankAccountClosingBalanceCurrency: 0, isClosed: false,
});
console.log(`\nRecon: ok=${reconRes.ok} id=${reconRes.data?.value?.id} v=${reconRes.data?.value?.version}`);
const reconId = reconRes.data?.value?.id;

// === TEST BATCH MATCHING ===
console.log("\n=== TEST: Batch match (all 3 txns + all 3 postings in ONE call) ===");

const matchPairs: { txnId: number; postingId: number; amount: number }[] = [];
const usedIds = new Set<number>();
for (let i = 0; i < testAmounts.length; i++) {
  const amt = testAmounts[i];
  const posting = all1920.find((p: any) => Math.abs(p.amount - amt) < 0.01 && !usedIds.has(p.id));
  if (posting) {
    usedIds.add(posting.id);
    matchPairs.push({ txnId: txnIds[i], postingId: posting.id, amount: amt });
    console.log(`  Pair: txn=${txnIds[i]} (${amt}) ↔ posting=${posting.id}`);
  }
}

if (matchPairs.length === 3) {
  // All-in-one batch
  const batchRes = await post("bank/reconciliation/match", {
    bankReconciliation: { id: reconId },
    transactions: matchPairs.map(p => ({ id: p.txnId })),
    postings: matchPairs.map(p => ({ id: p.postingId })),
  });
  console.log(`\nBatch match result: ok=${batchRes.ok} status=${batchRes.status}`);
  if (batchRes.ok) {
    console.log("*** BATCH MATCH WORKS! ***");
    console.log(`Response: ${JSON.stringify(batchRes.data).slice(0, 1000)}`);
  } else {
    console.log(`Batch match FAILED: ${JSON.stringify(batchRes.data).slice(0, 500)}`);

    // Try grouping by same amount (2 positive + 1 negative)
    console.log("\n=== TEST: Group positive matches in one call ===");
    const positivePairs = matchPairs.filter(p => p.amount > 0);
    const negativePairs = matchPairs.filter(p => p.amount < 0);

    if (positivePairs.length > 0) {
      const posRes = await post("bank/reconciliation/match", {
        bankReconciliation: { id: reconId },
        transactions: positivePairs.map(p => ({ id: p.txnId })),
        postings: positivePairs.map(p => ({ id: p.postingId })),
      });
      console.log(`Positive group: ok=${posRes.ok}`);
      if (!posRes.ok) console.log(JSON.stringify(posRes.data).slice(0, 500));
    }

    if (negativePairs.length > 0) {
      const negRes = await post("bank/reconciliation/match", {
        bankReconciliation: { id: reconId },
        transactions: negativePairs.map(p => ({ id: p.txnId })),
        postings: negativePairs.map(p => ({ id: p.postingId })),
      });
      console.log(`Negative group: ok=${negRes.ok}`);
      if (!negRes.ok) console.log(JSON.stringify(negRes.data).slice(0, 500));
    }

    // If groups failed too, do individual
    console.log("\n=== FALLBACK: Individual matches ===");
    for (const mp of matchPairs) {
      const res = await post("bank/reconciliation/match", {
        bankReconciliation: { id: reconId },
        transactions: [{ id: mp.txnId }],
        postings: [{ id: mp.postingId }],
      });
      console.log(`  Match ${mp.amount}: ok=${res.ok} ${res.ok ? "" : JSON.stringify(res.data).slice(0, 200)}`);
    }
  }
}

// Verify and close
const reconVerify = await get(`bank/reconciliation/${reconId}?fields=*`);
console.log(`\nRecon after matches: isClosed=${reconVerify.data?.value?.isClosed} v=${reconVerify.data?.value?.version}`);

const closingBal = Math.round(51556.79 * 100) / 100;
const closeRes = await put(`bank/reconciliation/${reconId}`, {
  id: reconId, version: reconRes.data?.value?.version,
  account: { id: acctMap[1920] }, accountingPeriod: { id: junePeriod.id },
  type: "MANUAL", bankAccountClosingBalanceCurrency: closingBal, isClosed: true,
});
console.log(`Close: ok=${closeRes.ok} ${closeRes.ok ? "" : JSON.stringify(closeRes.data).slice(0, 500)}`);

console.log("\n=== DONE ===");
