/**
 * Sandbox test: batch matching using dates AFTER existing recons (2027-09+)
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

const [acctRes, perRes] = await Promise.all([
  get("ledger/account?number=1920,2050,8050,2400&fields=*"),
  get("ledger/accountingPeriod?startFrom=2027-09-01&startTo=2027-10-01&count=12&fields=*"),
]);

const acctMap: Record<number, number> = {};
for (const a of (acctRes.data.values || [])) acctMap[a.number] = a.id;
console.log(`Accounts: ${JSON.stringify(acctMap)}`);

const sepPeriod = (perRes.data.values || []).find((p: any) => p.start?.startsWith("2027-09"));
console.log(`Sep 2027 period: id=${sepPeriod?.id} (${sepPeriod?.start} to ${sepPeriod?.end})`);
if (!sepPeriod) { console.error("No Sep 2027 period"); process.exit(1); }

// Create OB voucher
const obAmount = 50000;
const obRes = await post("ledger/voucher", {
  date: "2027-09-15", description: "OB",
  postings: [
    { row: 1, date: "2027-09-15", description: "OB", account: { id: acctMap[1920] },
      amount: obAmount, amountCurrency: obAmount, amountGross: obAmount, amountGrossCurrency: obAmount, currency: { id: 1 } },
    { row: 2, date: "2027-09-15", description: "OB", account: { id: acctMap[2050] },
      amount: -obAmount, amountCurrency: -obAmount, amountGross: -obAmount, amountGrossCurrency: -obAmount, currency: { id: 1 } },
  ],
});
console.log(`OB voucher: ok=${obRes.ok} id=${obRes.data?.value?.id}`);
if (!obRes.ok) { console.log(JSON.stringify(obRes.data).slice(0, 500)); process.exit(1); }

// Create transaction voucher with 5 test amounts
const testAmounts = [1234.56, -567.89, 890.12, -345.67, 2000.00];
const txnPostings: any[] = [];
let row = 1;
for (const amt of testAmounts) {
  if (amt > 0) {
    txnPostings.push({ row: row++, date: "2027-09-16", description: `Line ${amt}`, account: { id: acctMap[1920] },
      amount: amt, amountCurrency: amt, amountGross: amt, amountGrossCurrency: amt, currency: { id: 1 } });
    txnPostings.push({ row: row++, date: "2027-09-16", description: `Line ${amt}`, account: { id: acctMap[8050] },
      amount: -amt, amountCurrency: -amt, amountGross: -amt, amountGrossCurrency: -amt, currency: { id: 1 } });
  } else {
    txnPostings.push({ row: row++, date: "2027-09-17", description: `Line ${amt}`, account: { id: acctMap[2400] },
      amount: -amt, amountCurrency: -amt, amountGross: -amt, amountGrossCurrency: -amt, currency: { id: 1 } });
    txnPostings.push({ row: row++, date: "2027-09-17", description: `Line ${amt}`, account: { id: acctMap[1920] },
      amount: amt, amountCurrency: amt, amountGross: amt, amountGrossCurrency: amt, currency: { id: 1 } });
  }
}
const txnRes = await post("ledger/voucher", { date: "2027-09-15", description: "Txns", postings: txnPostings });
console.log(`Txn voucher: ok=${txnRes.ok} id=${txnRes.data?.value?.id}`);
if (!txnRes.ok) { console.log(JSON.stringify(txnRes.data).slice(0, 500)); process.exit(1); }

// Import bank statement
const netMovement = testAmounts.reduce((a, b) => a + b, 0);
const closingBal = Math.round((obAmount + netMovement) * 100) / 100;
console.log(`\nNet movement: ${netMovement}, Closing balance: ${closingBal}`);

const fmt = (n: number) => n.toFixed(2).replace(".", ",");
let sbanken = `"Inngående saldo 15.09.2027";"${fmt(obAmount)}"\n`;
sbanken += `"Utgående saldo 17.09.2027";"${fmt(closingBal)}"\n`;
sbanken += `"Bokført";"Rentedato";"Beskrivelse";"Beløp"\n`;
for (const amt of testAmounts) {
  const d = amt > 0 ? "16.09.2027" : "17.09.2027";
  sbanken += `"${d}";"${d}";"Test ${amt}";"${fmt(amt)}"\n`;
}

const formData = new FormData();
formData.append("file", new Blob([sbanken], { type: "text/csv" }), "test.csv");
const importRes = await post(
  `bank/statement/import?bankId=112&accountId=${acctMap[1920]}&fromDate=2027-09-15&toDate=2027-09-18&fileFormat=SBANKEN_BEDRIFT_CSV`,
  formData, true
);
console.log(`Import: ok=${importRes.ok} id=${importRes.data?.value?.id}`);
if (!importRes.ok) { console.log(JSON.stringify(importRes.data).slice(0, 500)); process.exit(1); }

const txnIds = (importRes.data?.value?.transactions || []).map((t: any) => t.id);
console.log(`Txn IDs: [${txnIds.join(", ")}] (${txnIds.length} txns)`);

// Get postings on 1920
const postingsRes = await get(`ledger/posting?accountId=${acctMap[1920]}&dateFrom=2027-09-15&dateTo=2027-09-18&count=1000&fields=id,date,amount,description`);
const all1920 = (postingsRes.data.values || []).filter((p: any) =>
  testAmounts.some(a => Math.abs(p.amount - a) < 0.01)
);
console.log(`\nPostings matching test amounts: ${all1920.length}`);
for (const p of all1920) console.log(`  id=${p.id} amount=${p.amount}`);

// Create recon
const reconRes = await post("bank/reconciliation", {
  account: { id: acctMap[1920] }, accountingPeriod: { id: sepPeriod.id },
  type: "MANUAL", bankAccountClosingBalanceCurrency: 0, isClosed: false,
});
console.log(`\nRecon: ok=${reconRes.ok} id=${reconRes.data?.value?.id} v=${reconRes.data?.value?.version}`);
if (!reconRes.ok) { process.exit(1); }
const reconId = reconRes.data.value.id;

// Match postings to txns
const matchPairs: { txnId: number; postingId: number; amount: number }[] = [];
const usedIds = new Set<number>();
for (let i = 0; i < testAmounts.length; i++) {
  const amt = testAmounts[i];
  const posting = all1920.find((p: any) => Math.abs(p.amount - amt) < 0.01 && !usedIds.has(p.id));
  if (posting) {
    usedIds.add(posting.id);
    matchPairs.push({ txnId: txnIds[i], postingId: posting.id, amount: amt });
  }
}
console.log(`\nMatch pairs: ${matchPairs.length}`);

// === TEST 1: All 5 matches in ONE batch call ===
console.log("\n=== TEST 1: ALL 5 matches in ONE call ===");
const batchRes = await post("bank/reconciliation/match", {
  bankReconciliation: { id: reconId },
  transactions: matchPairs.map(p => ({ id: p.txnId })),
  postings: matchPairs.map(p => ({ id: p.postingId })),
});
console.log(`Batch (5 in 1): ok=${batchRes.ok} status=${batchRes.status}`);
if (batchRes.ok) {
  console.log("*** BATCH MATCH WORKS! ***");
  console.log(`Match ID: ${batchRes.data?.value?.id}, type: ${batchRes.data?.value?.type}`);
  // Verify by listing matches on this recon
  const matchList = await get(`bank/reconciliation/match?bankReconciliationId=${reconId}&count=100&fields=*`);
  console.log(`Matches on recon: ${matchList.data?.values?.length}`);
  for (const m of (matchList.data?.values || [])) {
    console.log(`  match id=${m.id} type=${m.type} txns=${m.transactions?.length} postings=${m.postings?.length}`);
  }
} else {
  console.log(`Batch FAILED: ${JSON.stringify(batchRes.data).slice(0, 500)}`);

  // === TEST 2: Try pairs of 2+3 ===
  console.log("\n=== TEST 2: Pairs (2 matches + 3 matches) ===");
  const batch1 = matchPairs.slice(0, 2);
  const batch2 = matchPairs.slice(2);

  const r1 = await post("bank/reconciliation/match", {
    bankReconciliation: { id: reconId },
    transactions: batch1.map(p => ({ id: p.txnId })),
    postings: batch1.map(p => ({ id: p.postingId })),
  });
  console.log(`Batch 1 (2 pairs): ok=${r1.ok} ${r1.ok ? "" : JSON.stringify(r1.data).slice(0, 300)}`);

  const r2 = await post("bank/reconciliation/match", {
    bankReconciliation: { id: reconId },
    transactions: batch2.map(p => ({ id: p.txnId })),
    postings: batch2.map(p => ({ id: p.postingId })),
  });
  console.log(`Batch 2 (3 pairs): ok=${r2.ok} ${r2.ok ? "" : JSON.stringify(r2.data).slice(0, 300)}`);

  if (!r1.ok || !r2.ok) {
    // === TEST 3: Individual matches ===
    console.log("\n=== TEST 3: Individual matches ===");
    for (const mp of matchPairs) {
      const r = await post("bank/reconciliation/match", {
        bankReconciliation: { id: reconId },
        transactions: [{ id: mp.txnId }],
        postings: [{ id: mp.postingId }],
      });
      console.log(`  Match ${mp.amount}: ok=${r.ok}`);
    }
  }
}

// Close recon
const closeRes = await put(`bank/reconciliation/${reconId}`, {
  id: reconId, version: reconRes.data.value.version,
  account: { id: acctMap[1920] }, accountingPeriod: { id: sepPeriod.id },
  type: "MANUAL", bankAccountClosingBalanceCurrency: closingBal, isClosed: true,
});
console.log(`\nClose recon: ok=${closeRes.ok} ${closeRes.ok ? "" : JSON.stringify(closeRes.data).slice(0, 500)}`);

// Final verification
const finalRecon = await get(`bank/reconciliation/${reconId}?fields=*`);
console.log(`Final recon: isClosed=${finalRecon.data?.value?.isClosed} bal=${finalRecon.data?.value?.bankAccountClosingBalanceCurrency}`);

console.log("\n=== DONE ===");
