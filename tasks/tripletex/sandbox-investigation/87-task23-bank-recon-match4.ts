/**
 * 87-task23-bank-recon-match4.ts — Create proper matches (fix supplier issue)
 *
 * Previous run failed: posting to account 2400 requires a supplier ID.
 * Fix: use account 2050 for ALL contra postings (it's just sandbox testing).
 *
 * Bank txns for Nov (statement 123943242):
 *   189465930: +5000 "Innbetaling fra Test AS / Faktura 1"
 *   189465931: +3000 "Innbetaling fra Test2 AS / Faktura 2"
 *   189465932: -2000 "Betaling Supplier Test Leverandor AS"
 *   189465933: -150  "Bankgebyr"
 *
 * Need 1920 postings: +5000, +3000, -2000, -150
 * All contra postings go to 2050 for simplicity.
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
  if (body && !(body instanceof FormData)) {
    const s = JSON.stringify(body, null, 2);
    if (s.length > 500) console.log("Body:", s.slice(0, 500) + "...");
    else console.log("Body:", s);
  }
  const res = await fetch(url, opts);
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`<<< ${res.status}`);
  if (typeof json === "object") {
    const s = JSON.stringify(json, null, 2);
    if (s.length > 2000) console.log(s.slice(0, 2000) + "\n...");
    else console.log(s);
  } else console.log(json);
  return { status: res.status, data: json };
}

async function main() {
  const ACCT_1920 = 424190862;
  const ACCT_2050 = 424190875;
  const NOV_PERIOD = 23726310;

  // ====== 1. Check current recon state ======
  console.log("=== 1. Find November reconciliation ===");
  const reconsRes = await api("GET", `bank/reconciliation?count=100&fields=id,isClosed,version,accountingPeriod(id,start)`);
  const recons = reconsRes.data?.values || [];
  let novRecon = recons.find((r: any) => r.accountingPeriod?.id === NOV_PERIOD);
  console.log("Nov recon:", novRecon ? { id: novRecon.id, isClosed: novRecon.isClosed } : "NOT FOUND");

  // If closed, reopen it
  if (novRecon?.isClosed) {
    console.log("Reopening closed recon...");
    const freshRecon = await api("GET", `bank/reconciliation/${novRecon.id}?fields=*`);
    const v = freshRecon.data?.value?.version;
    await api("PUT", `bank/reconciliation/${novRecon.id}`, {
      id: novRecon.id, version: v,
      account: { id: ACCT_1920 }, accountingPeriod: { id: NOV_PERIOD },
      type: "MANUAL", bankAccountClosingBalanceCurrency: 0, isClosed: false,
    });
  }

  if (!novRecon) {
    // Create one
    const createRes = await api("POST", "bank/reconciliation", {
      account: { id: ACCT_1920 }, accountingPeriod: { id: NOV_PERIOD },
      type: "MANUAL", bankAccountClosingBalanceCurrency: 0, isClosed: false,
    });
    novRecon = { id: createRes.data?.value?.id };
  }

  const reconId = novRecon.id;
  console.log("Working with recon:", reconId);

  // ====== 2. Create voucher with 1920 postings matching bank txns ======
  console.log("\n=== 2. Create matching postings ===");
  const vRes = await api("POST", "ledger/voucher", {
    date: "2026-11-02",
    description: "Matching postings for bank recon test",
    postings: [
      // +5000 on 1920 (for bank txn 189465930)
      { row: 1, date: "2026-11-02", description: "Innbetaling fra Test AS",
        account: { id: ACCT_1920 }, amount: 5000, amountCurrency: 5000, amountGross: 5000, amountGrossCurrency: 5000 },
      { row: 2, date: "2026-11-02", description: "Innbetaling fra Test AS",
        account: { id: ACCT_2050 }, amount: -5000, amountCurrency: -5000, amountGross: -5000, amountGrossCurrency: -5000 },
      // +3000 on 1920 (for bank txn 189465931)
      { row: 3, date: "2026-11-05", description: "Innbetaling fra Test2 AS",
        account: { id: ACCT_1920 }, amount: 3000, amountCurrency: 3000, amountGross: 3000, amountGrossCurrency: 3000 },
      { row: 4, date: "2026-11-05", description: "Innbetaling fra Test2 AS",
        account: { id: ACCT_2050 }, amount: -3000, amountCurrency: -3000, amountGross: -3000, amountGrossCurrency: -3000 },
      // -2000 on 1920 (for bank txn 189465932)
      { row: 5, date: "2026-11-10", description: "Betaling Supplier",
        account: { id: ACCT_2050 }, amount: 2000, amountCurrency: 2000, amountGross: 2000, amountGrossCurrency: 2000 },
      { row: 6, date: "2026-11-10", description: "Betaling Supplier",
        account: { id: ACCT_1920 }, amount: -2000, amountCurrency: -2000, amountGross: -2000, amountGrossCurrency: -2000 },
      // -150 on 1920 (for bank txn 189465933)
      { row: 7, date: "2026-11-15", description: "Bankgebyr",
        account: { id: ACCT_2050 }, amount: 150, amountCurrency: 150, amountGross: 150, amountGrossCurrency: 150 },
      { row: 8, date: "2026-11-15", description: "Bankgebyr",
        account: { id: ACCT_1920 }, amount: -150, amountCurrency: -150, amountGross: -150, amountGrossCurrency: -150 },
    ],
  });

  if (vRes.status >= 400) {
    console.error("Voucher creation failed");
    return;
  }

  const allPostings = vRes.data?.value?.postings || [];
  const p1920 = allPostings.filter((p: any) => p.account?.id === ACCT_1920);
  console.log("\n1920 postings created:");
  for (const p of p1920) {
    console.log(`  ${p.id}: amount=${p.amount}, desc=${p.description}`);
  }

  // ====== 3. Create matches ======
  console.log("\n=== 3. Create matches ===");

  const pairs = [
    { txnId: 189465930, amount: 5000 },
    { txnId: 189465931, amount: 3000 },
    { txnId: 189465932, amount: -2000 },
    { txnId: 189465933, amount: -150 },
  ];

  for (const pair of pairs) {
    const posting = p1920.find((p: any) => p.amount === pair.amount);
    if (!posting) {
      console.error(`No posting for amount ${pair.amount}`);
      continue;
    }

    console.log(`\nMatch: txn ${pair.txnId} (${pair.amount}) <-> posting ${posting.id} (${posting.amount})`);
    const matchRes = await api("POST", "bank/reconciliation/match", {
      bankReconciliation: { id: reconId },
      transactions: [{ id: pair.txnId }],
      postings: [{ id: posting.id }],
    });

    if (matchRes.status >= 400) {
      console.error("Match FAILED. Let's investigate...");
      // Check if txn is already matched
      const txnCheck = await api("GET", `bank/statement/transaction/${pair.txnId}?fields=*`);
      console.log("Txn matched?", txnCheck.data?.value?.matched, "matchType:", txnCheck.data?.value?.matchType);
    }
  }

  // ====== 4. Check results ======
  console.log("\n=== 4. Check results ===");

  // Bank transactions
  const txnRes = await api("GET", "bank/statement/transaction?bankStatementId=123943242&count=10&fields=*");
  for (const t of (txnRes.data?.values || [])) {
    console.log(`  Txn ${t.id}: amount=${t.amountCurrency}, matched=${t.matched}, matchType=${t.matchType}`);
  }

  // Matches
  const matchRes = await api("GET", `bank/reconciliation/match?bankReconciliationId=${reconId}&count=100&fields=*`);
  console.log("Matches:", matchRes.data?.values?.length || 0);
  for (const m of (matchRes.data?.values || [])) {
    console.log(`  Match ${m.id}: type=${m.type}`);
  }

  // ====== 5. Close reconciliation ======
  console.log("\n=== 5. Close reconciliation ===");
  const bsRes = await api("GET", "balanceSheet?dateFrom=2026-11-01&dateTo=2026-12-01&accountNumberFrom=1920&accountNumberTo=1920&count=1&fields=*");
  const balance = bsRes.data?.values?.[0]?.balanceOut;
  console.log("Balance for Nov:", balance);

  const freshRecon = await api("GET", `bank/reconciliation/${reconId}?fields=*`);
  const version = freshRecon.data?.value?.version;

  const closeRes = await api("PUT", `bank/reconciliation/${reconId}`, {
    id: reconId, version,
    account: { id: ACCT_1920 }, accountingPeriod: { id: NOV_PERIOD },
    type: "MANUAL",
    bankAccountClosingBalanceCurrency: Math.round((balance || 0) * 100) / 100,
    isClosed: true,
  });
  console.log("Close:", closeRes.status);

  // ====== 6. Final ======
  console.log("\n=== 6. Final state ===");
  const finalRecon = await api("GET", `bank/reconciliation/${reconId}?fields=*`);
  const fr = finalRecon.data?.value;
  console.log("Recon:", { id: fr?.id, isClosed: fr?.isClosed, balance: fr?.bankAccountClosingBalanceCurrency, txns: fr?.transactions?.length });

  const finalTxns = await api("GET", "bank/statement/transaction?bankStatementId=123943242&count=10&fields=id,amountCurrency,matched,matchType");
  for (const t of (finalTxns.data?.values || [])) {
    console.log(`  Txn ${t.id}: amount=${t.amountCurrency}, matched=${t.matched}, matchType=${t.matchType}`);
  }

  const finalMatches = await api("GET", `bank/reconciliation/match?bankReconciliationId=${reconId}&count=100&fields=*`);
  console.log("Final matches:", finalMatches.data?.values?.length || 0);

  console.log("\n=== COMPLETE ===");
}

main().catch(console.error);
