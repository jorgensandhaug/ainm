/**
 * 86-task23-bank-recon-match3.ts — Create proper matches
 *
 * Key discovery from previous run:
 * - Existing successful matches have SAME amount + SAME sign between txn and posting
 * - Both are on account 1920
 * - The validation "Summen av posteringer og transaksjoner er ikke lik null" means:
 *   sum(txn amounts) - sum(posting amounts) != 0 (i.e., they must be EQUAL, not opposite)
 *
 * Plan:
 * 1. Create voucher postings on 1920 that exactly match bank txn amounts
 * 2. Match them
 * 3. Test closing reconciliation
 *
 * Bank txns for Nov (statement 123943242):
 *   189465930: +5000 "Innbetaling fra Test AS / Faktura 1"
 *   189465931: +3000 "Innbetaling fra Test2 AS / Faktura 2"
 *   189465932: -2000 "Betaling Supplier Test Leverandor AS"
 *   189465933: -150  "Bankgebyr"
 *
 * Need postings on 1920 with: +5000, +3000, -2000, -150
 * We already have opening balance posting +100000 on 1920 (not matchable to any txn)
 */

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + Buffer.from("0:" + TOKEN).toString("base64");

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}/${path}`;
  const headers: Record<string, string> = { Authorization: AUTH };
  if (body && !(body instanceof FormData)) headers["Content-Type"] = "application/json";
  const opts: RequestInit = { method, headers };
  if (body) opts.body = body instanceof FormData ? body : JSON.stringify(body);
  console.log(`\n>>> ${method} ${path}`);
  if (body && !(body instanceof FormData)) console.log("Body:", JSON.stringify(body, null, 2).slice(0, 1500));
  const res = await fetch(url, opts);
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`<<< ${res.status}`);
  if (typeof json === "object") {
    const s = JSON.stringify(json, null, 2);
    if (s.length > 3000) console.log(s.slice(0, 3000) + "\n...(truncated)");
    else console.log(s);
  } else console.log(json);
  return { status: res.status, data: json };
}

async function main() {
  const ACCT_1920_ID = 424190862;
  const ACCT_2050_ID = 424190875;
  const ACCT_2400_ID = 424190921;
  const ACCT_7770_ID = 424191192;
  const NOV_PERIOD_ID = 23726310;
  const RECON_ID = 12705508;

  // ====== 1. Create voucher with postings matching bank txn amounts ======
  console.log("=== 1. Create matching postings ===");

  const voucherRes = await api("POST", "ledger/voucher", {
    date: "2026-11-02",
    description: "Matching postings for bank recon",
    postings: [
      // +5000 on 1920 (matches bank txn 189465930 +5000)
      { row: 1, date: "2026-11-02", description: "Innbetaling fra Test AS / Faktura 1",
        account: { id: ACCT_1920_ID },
        amount: 5000, amountCurrency: 5000, amountGross: 5000, amountGrossCurrency: 5000 },
      { row: 2, date: "2026-11-02", description: "Innbetaling fra Test AS / Faktura 1",
        account: { id: ACCT_2050_ID },
        amount: -5000, amountCurrency: -5000, amountGross: -5000, amountGrossCurrency: -5000 },
      // +3000 on 1920 (matches bank txn 189465931 +3000)
      { row: 3, date: "2026-11-05", description: "Innbetaling fra Test2 AS / Faktura 2",
        account: { id: ACCT_1920_ID },
        amount: 3000, amountCurrency: 3000, amountGross: 3000, amountGrossCurrency: 3000 },
      { row: 4, date: "2026-11-05", description: "Innbetaling fra Test2 AS / Faktura 2",
        account: { id: ACCT_2050_ID },
        amount: -3000, amountCurrency: -3000, amountGross: -3000, amountGrossCurrency: -3000 },
      // -2000 on 1920 (matches bank txn 189465932 -2000)
      { row: 5, date: "2026-11-10", description: "Betaling Supplier Test Leverandor AS",
        account: { id: ACCT_2400_ID },
        amount: 2000, amountCurrency: 2000, amountGross: 2000, amountGrossCurrency: 2000 },
      { row: 6, date: "2026-11-10", description: "Betaling Supplier Test Leverandor AS",
        account: { id: ACCT_1920_ID },
        amount: -2000, amountCurrency: -2000, amountGross: -2000, amountGrossCurrency: -2000 },
      // -150 on 1920 (matches bank txn 189465933 -150)
      { row: 7, date: "2026-11-15", description: "Bankgebyr",
        account: { id: ACCT_7770_ID },
        amount: 150, amountCurrency: 150, amountGross: 150, amountGrossCurrency: 150 },
      { row: 8, date: "2026-11-15", description: "Bankgebyr",
        account: { id: ACCT_1920_ID },
        amount: -150, amountCurrency: -150, amountGross: -150, amountGrossCurrency: -150 },
    ],
  });

  if (voucherRes.status >= 400) {
    console.error("Failed to create voucher, aborting");
    return;
  }

  // Get the posting IDs for the 1920 postings
  const voucherPostings = voucherRes.data?.value?.postings || [];
  const p1920 = voucherPostings.filter((p: any) => p.account?.id === ACCT_1920_ID);
  console.log("1920 postings created:");
  for (const p of p1920) {
    console.log(`  Posting ${p.id}: amount=${p.amount}, desc=${p.description}`);
  }

  // ====== 2. Check reconciliation state ======
  console.log("\n=== 2. Check reconciliation state ===");
  const reconRes = await api("GET", `bank/reconciliation/${RECON_ID}?fields=*`);
  const recon = reconRes.data?.value;
  console.log("Recon:", { id: recon?.id, isClosed: recon?.isClosed, version: recon?.version });

  // If no recon or it was deleted, check for auto-created one
  if (reconRes.status === 404) {
    console.log("Recon was deleted, looking for auto-created replacement...");
    const allRecons = await api("GET", `bank/reconciliation?accountId=${ACCT_1920_ID}&count=100&fields=id,isClosed,accountingPeriod(id,start)`);
    const novRecon = (allRecons.data?.values || []).find((r: any) => r.accountingPeriod?.id === NOV_PERIOD_ID);
    if (novRecon) {
      console.log("Found Nov recon:", novRecon.id, "isClosed:", novRecon.isClosed);
    }
  }

  // ====== 3. Create matches ======
  console.log("\n=== 3. Create matches ===");

  // Bank txn -> posting pairs (matched by amount on 1920)
  const pairs = [
    { txnId: 189465930, txnAmount: 5000 },
    { txnId: 189465931, txnAmount: 3000 },
    { txnId: 189465932, txnAmount: -2000 },
    { txnId: 189465933, txnAmount: -150 },
  ];

  for (const pair of pairs) {
    // Find the posting with matching amount
    const matchPosting = p1920.find((p: any) => p.amount === pair.txnAmount);
    if (!matchPosting) {
      console.error(`No posting found for txn amount ${pair.txnAmount}`);
      continue;
    }

    console.log(`\nMatching txn ${pair.txnId} (${pair.txnAmount}) -> posting ${matchPosting.id} (${matchPosting.amount})`);
    const matchRes = await api("POST", "bank/reconciliation/match", {
      bankReconciliation: { id: RECON_ID },
      transactions: [{ id: pair.txnId }],
      postings: [{ id: matchPosting.id }],
    });

    if (matchRes.status >= 400) {
      console.log("Match failed, trying with different recon...");
      // Check what recon exists for Nov
      const allRecons = await api("GET", `bank/reconciliation?accountId=${ACCT_1920_ID}&count=100&fields=id,isClosed,accountingPeriod(id,start)`);
      const novRecon = (allRecons.data?.values || []).find((r: any) => r.accountingPeriod?.id === NOV_PERIOD_ID);
      if (novRecon && novRecon.id !== RECON_ID) {
        console.log("Found different Nov recon:", novRecon.id);
        const retryRes = await api("POST", "bank/reconciliation/match", {
          bankReconciliation: { id: novRecon.id },
          transactions: [{ id: pair.txnId }],
          postings: [{ id: matchPosting.id }],
        });
      }
      break; // Stop on first failure to avoid noise
    }
  }

  // ====== 4. Check match state ======
  console.log("\n=== 4. Check match state ===");
  const matchesRes = await api("GET", `bank/reconciliation/match?bankReconciliationId=${RECON_ID}&count=100&fields=*`);
  const matches = matchesRes.data?.values || [];
  console.log("Matches:", matches.length);
  for (const m of matches) {
    console.log(`  Match ${m.id}: type=${m.type}, txns=${m.transactions?.length}, postings=${m.postings?.length}`);
  }

  // Check bank transactions
  const txnCheckRes = await api("GET", "bank/statement/transaction?bankStatementId=123943242&count=100&fields=*");
  const txns = txnCheckRes.data?.values || [];
  for (const t of txns) {
    console.log(`  Txn ${t.id}: amount=${t.amountCurrency}, matched=${t.matched}, matchType=${t.matchType}`);
  }

  // ====== 5. Get balance and close reconciliation ======
  console.log("\n=== 5. Get balance and close ===");
  const bsRes = await api("GET", "balanceSheet?dateFrom=2026-11-01&dateTo=2026-12-01&accountNumberFrom=1920&accountNumberTo=1920&count=1&fields=*");
  const balance = bsRes.data?.values?.[0]?.balanceOut;
  console.log("Current 1920 balance for Nov:", balance);

  // Try closing with actual balance
  const freshRecon = await api("GET", `bank/reconciliation/${RECON_ID}?fields=*`);
  const version2 = freshRecon.data?.value?.version;

  if (!freshRecon.data?.value?.isClosed) {
    const closeRes = await api("PUT", `bank/reconciliation/${RECON_ID}`, {
      id: RECON_ID,
      version: version2,
      account: { id: ACCT_1920_ID },
      accountingPeriod: { id: NOV_PERIOD_ID },
      type: "MANUAL",
      bankAccountClosingBalanceCurrency: Math.round((balance || 0) * 100) / 100,
      isClosed: true,
    });
    console.log("Close result:", closeRes.status);
  }

  // ====== 6. Final state ======
  console.log("\n=== 6. Final state ===");
  const finalRecon = await api("GET", `bank/reconciliation/${RECON_ID}?fields=*`);
  const fr = finalRecon.data?.value;
  console.log("Final recon:", {
    id: fr?.id,
    isClosed: fr?.isClosed,
    balance: fr?.bankAccountClosingBalanceCurrency,
    transactions: fr?.transactions?.length,
    closedDate: fr?.closedDate,
  });

  const finalMatches = await api("GET", `bank/reconciliation/match?bankReconciliationId=${RECON_ID}&count=100&fields=*`);
  console.log("Final matches:", finalMatches.data?.values?.length || 0);

  const finalTxns = await api("GET", "bank/statement/transaction?bankStatementId=123943242&count=100&fields=*");
  for (const t of (finalTxns.data?.values || [])) {
    console.log(`  Txn ${t.id}: amount=${t.amountCurrency}, matched=${t.matched}, matchType=${t.matchType}`);
  }

  console.log("\n=== COMPLETE ===");
}

main().catch(console.error);
