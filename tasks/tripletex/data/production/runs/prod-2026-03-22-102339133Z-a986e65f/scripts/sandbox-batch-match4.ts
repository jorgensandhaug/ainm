/**
 * Sandbox test: batch matching — fixed (use 7770 for outgoing, no supplier required)
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
  get("ledger/account?number=1920,2050,7770,8050&fields=*"),
  get("ledger/accountingPeriod?startFrom=2027-10-01&startTo=2027-11-01&count=12&fields=*"),
]);

const acctMap: Record<number, number> = {};
for (const a of (acctRes.data.values || [])) acctMap[a.number] = a.id;

const octPeriod = (perRes.data.values || []).find((p: any) => p.start?.startsWith("2027-10"));
console.log(`Oct 2027 period: id=${octPeriod?.id}`);
if (!octPeriod) { console.error("No Oct 2027 period"); process.exit(1); }

// 5 test amounts (positive = incoming on 1920, negative = outgoing from 1920)
const testAmounts = [1234.56, -567.89, 890.12, -345.67, 2000.00];

// Create voucher with all postings
const postings: any[] = [];
let row = 1;
// OB
postings.push({ row: row++, date: "2027-10-15", description: "OB", account: { id: acctMap[1920] },
  amount: 50000, amountCurrency: 50000, amountGross: 50000, amountGrossCurrency: 50000, currency: { id: 1 } });
postings.push({ row: row++, date: "2027-10-15", description: "OB", account: { id: acctMap[2050] },
  amount: -50000, amountCurrency: -50000, amountGross: -50000, amountGrossCurrency: -50000, currency: { id: 1 } });
// Transaction postings
for (const amt of testAmounts) {
  if (amt > 0) {
    postings.push({ row: row++, date: "2027-10-16", description: `L ${amt}`, account: { id: acctMap[1920] },
      amount: amt, amountCurrency: amt, amountGross: amt, amountGrossCurrency: amt, currency: { id: 1 } });
    postings.push({ row: row++, date: "2027-10-16", description: `L ${amt}`, account: { id: acctMap[8050] },
      amount: -amt, amountCurrency: -amt, amountGross: -amt, amountGrossCurrency: -amt, currency: { id: 1 } });
  } else {
    // Use 7770 (bank fee) instead of 2400 (supplier) to avoid supplier requirement
    postings.push({ row: row++, date: "2027-10-17", description: `L ${amt}`, account: { id: acctMap[7770] },
      amount: -amt, amountCurrency: -amt, amountGross: -amt, amountGrossCurrency: -amt, currency: { id: 1 } });
    postings.push({ row: row++, date: "2027-10-17", description: `L ${amt}`, account: { id: acctMap[1920] },
      amount: amt, amountCurrency: amt, amountGross: amt, amountGrossCurrency: amt, currency: { id: 1 } });
  }
}

// TEST: Combined OB + txn postings in ONE voucher
const voucherRes = await post("ledger/voucher", { date: "2027-10-15", description: "Combined OB+txns", postings });
console.log(`Combined voucher (OB + 5 txns): ok=${voucherRes.ok} id=${voucherRes.data?.value?.id}`);
if (!voucherRes.ok) { process.exit(1); }
console.log("*** COMBINED VOUCHER WORKS — saves 1 POST ***");

// Import bank statement
const netMovement = testAmounts.reduce((a, b) => a + b, 0);
const closingBal = Math.round((50000 + netMovement) * 100) / 100;
console.log(`\nClosing: ${closingBal}`);

const fmt = (n: number) => n.toFixed(2).replace(".", ",");
let csv = `"Inngående saldo 15.10.2027";"50000,00"\n`;
csv += `"Utgående saldo 17.10.2027";"${fmt(closingBal)}"\n`;
csv += `"Bokført";"Rentedato";"Beskrivelse";"Beløp"\n`;
for (const amt of testAmounts) {
  const d = amt > 0 ? "16.10.2027" : "17.10.2027";
  csv += `"${d}";"${d}";"Test ${amt}";"${fmt(amt)}"\n`;
}

const formData = new FormData();
formData.append("file", new Blob([csv], { type: "text/csv" }), "t.csv");
const importRes = await post(
  `bank/statement/import?bankId=112&accountId=${acctMap[1920]}&fromDate=2027-10-15&toDate=2027-10-18&fileFormat=SBANKEN_BEDRIFT_CSV`,
  formData, true
);
console.log(`Import: ok=${importRes.ok} id=${importRes.data?.value?.id}`);
if (!importRes.ok) { process.exit(1); }

const txnIds = (importRes.data?.value?.transactions || []).map((t: any) => t.id);
console.log(`Txn IDs: [${txnIds.join(", ")}]`);

// Get postings
const pRes = await get(`ledger/posting?accountId=${acctMap[1920]}&dateFrom=2027-10-15&dateTo=2027-10-18&count=1000&fields=id,date,amount,description`);
const all1920 = (pRes.data.values || []).filter((p: any) =>
  testAmounts.some(a => Math.abs(p.amount - a) < 0.01)
);
console.log(`Postings: ${all1920.length}`);

// Create recon
const reconRes = await post("bank/reconciliation", {
  account: { id: acctMap[1920] }, accountingPeriod: { id: octPeriod.id },
  type: "MANUAL", bankAccountClosingBalanceCurrency: 0, isClosed: false,
});
console.log(`Recon: ok=${reconRes.ok} id=${reconRes.data?.value?.id} v=${reconRes.data?.value?.version}`);
if (!reconRes.ok) { process.exit(1); }
const reconId = reconRes.data.value.id;

// Build match pairs
const matchPairs: { txnId: number; postingId: number; amount: number }[] = [];
const usedIds = new Set<number>();
for (let i = 0; i < testAmounts.length; i++) {
  const posting = all1920.find((p: any) => Math.abs(p.amount - testAmounts[i]) < 0.01 && !usedIds.has(p.id));
  if (posting) {
    usedIds.add(posting.id);
    matchPairs.push({ txnId: txnIds[i], postingId: posting.id, amount: testAmounts[i] });
  }
}
console.log(`Match pairs: ${matchPairs.length}`);
for (const mp of matchPairs) console.log(`  txn=${mp.txnId} ↔ posting=${mp.postingId} (${mp.amount})`);

// === TEST: ALL 5 matches in ONE call ===
console.log("\n=== BATCH TEST: All 5 matches in 1 call ===");
const batchRes = await post("bank/reconciliation/match", {
  bankReconciliation: { id: reconId },
  transactions: matchPairs.map(p => ({ id: p.txnId })),
  postings: matchPairs.map(p => ({ id: p.postingId })),
});
console.log(`Batch (5→1): ok=${batchRes.ok} status=${batchRes.status}`);

if (batchRes.ok) {
  console.log("*** BATCH MATCH WORKS! 5 matches in 1 API call ***");
  const matchList = await get(`bank/reconciliation/match?bankReconciliationId=${reconId}&count=100&fields=*`);
  console.log(`Matches on recon: ${matchList.data?.values?.length}`);
  for (const m of (matchList.data?.values || [])) {
    console.log(`  id=${m.id} type=${m.type} txns=${m.transactions?.length} postings=${m.postings?.length}`);
  }
} else {
  console.log(`FAILED: ${JSON.stringify(batchRes.data).slice(0, 500)}`);

  // Try 1+1 pairs first to verify individual works
  console.log("\n=== Individual match test ===");
  let okCount = 0;
  for (const mp of matchPairs) {
    const r = await post("bank/reconciliation/match", {
      bankReconciliation: { id: reconId },
      transactions: [{ id: mp.txnId }],
      postings: [{ id: mp.postingId }],
    });
    console.log(`  ${mp.amount}: ok=${r.ok}`);
    if (r.ok) okCount++;
  }
  console.log(`Individual matches: ${okCount}/${matchPairs.length}`);
}

// Close
const closeRes = await put(`bank/reconciliation/${reconId}`, {
  id: reconId, version: reconRes.data.value.version,
  account: { id: acctMap[1920] }, accountingPeriod: { id: octPeriod.id },
  type: "MANUAL", bankAccountClosingBalanceCurrency: closingBal, isClosed: true,
});
console.log(`\nClose: ok=${closeRes.ok}`);

const finalRecon = await get(`bank/reconciliation/${reconId}?fields=*`);
console.log(`Final: isClosed=${finalRecon.data?.value?.isClosed} bal=${finalRecon.data?.value?.bankAccountClosingBalanceCurrency}`);

console.log("\n=== DONE ===");
