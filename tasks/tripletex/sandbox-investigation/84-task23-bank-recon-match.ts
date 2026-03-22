/**
 * 84-task23-bank-recon-match.ts — Test matching and closing
 *
 * State from previous run:
 * - Bank statement 123943242 imported for Nov 2026 with 4 transactions (ids: 189465930-933)
 * - Opening balance voucher posted (100000 DR 1920 / CR 2050, posting 3845989520)
 * - No reconciliation exists for November (period 23726310)
 * - Balance on 1920 for Nov: 130973.78 (includes other sandbox postings)
 *
 * Test plan:
 * 1. Create reconciliation for November (POST /bank/reconciliation)
 * 2. Get bank statement transactions with full fields
 * 3. Try :suggest on the reconciliation
 * 4. Try manual POST /bank/reconciliation/match
 * 5. Close the reconciliation
 * 6. Verify final state
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
  if (body && !(body instanceof FormData)) console.log("Body:", JSON.stringify(body, null, 2).slice(0, 1000));
  const res = await fetch(url, opts);
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`<<< ${res.status}`);
  if (typeof json === "object") {
    const s = JSON.stringify(json, null, 2);
    console.log(s.length > 4000 ? s.slice(0, 4000) + "\n...(truncated)" : s);
  } else console.log(json);
  return { status: res.status, data: json };
}

async function main() {
  const ACCT_1920_ID = 424190862;
  const NOV_PERIOD_ID = 23726310;

  // ====== 1. Get bank statement transactions for the imported statement ======
  console.log("=== 1. Get bank statement transactions ===");
  const txnRes = await api("GET", "bank/statement/transaction?bankStatementId=123943242&count=100&fields=*");
  const bankTxns = txnRes.data?.values || [];
  console.log("Bank transactions:", bankTxns.length);
  for (const t of bankTxns) {
    console.log(`  Txn ${t.id}: postedDate=${t.postedDate}, amount=${t.amountCurrency}, desc=${t.description}, matched=${t.matched}`);
  }

  // ====== 2. Get postings on 1920 for November ======
  console.log("\n=== 2. Get November postings on 1920 ===");
  const postRes = await api("GET", `ledger/posting?accountId=${ACCT_1920_ID}&dateFrom=2026-11-01&dateTo=2026-11-30&count=100&fields=*`);
  const postings = postRes.data?.values || [];
  console.log("Postings:", postings.length);
  for (const p of postings) {
    console.log(`  Posting ${p.id}: date=${p.date}, amount=${p.amount}, desc=${p.description?.slice(0, 60)}, matched=${p.matched}`);
  }

  // ====== 3. Create reconciliation for November ======
  console.log("\n=== 3. Create reconciliation for November ===");

  // First check if one already exists
  const existingReconRes = await api("GET", `bank/reconciliation?accountId=${ACCT_1920_ID}&accountingPeriodId=${NOV_PERIOD_ID}&count=10&fields=*`);
  const existingRecons = existingReconRes.data?.values || [];
  console.log("Existing Nov recons:", existingRecons.length);

  let reconId: number;

  if (existingRecons.length > 0) {
    reconId = existingRecons[0].id;
    console.log("Using existing recon:", reconId, "isClosed:", existingRecons[0].isClosed);
  } else {
    // Create new reconciliation (open first, then we'll close it later)
    const createRes = await api("POST", "bank/reconciliation", {
      account: { id: ACCT_1920_ID },
      accountingPeriod: { id: NOV_PERIOD_ID },
      type: "MANUAL",
      bankAccountClosingBalanceCurrency: 0,
      isClosed: false,
    });
    if (createRes.status >= 400) {
      console.error("Failed to create reconciliation");
      // Check if the account already has recons by looking at all
      const allRecon = await api("GET", "bank/reconciliation?count=100&fields=id,isClosed,accountingPeriod(id,start)");
      return;
    }
    reconId = createRes.data?.value?.id;
    console.log("Created reconciliation:", reconId);
  }

  // ====== 4. Try :suggest ======
  console.log("\n=== 4. Try :suggest on reconciliation ===");
  const suggestRes = await api("PUT", `bank/reconciliation/${reconId}/:suggest`);
  console.log("Suggest status:", suggestRes.status);

  // Check matches after suggest
  const matchesAfterSuggest = await api("GET", `bank/reconciliation/match?bankReconciliationId=${reconId}&count=100&fields=*`);
  const suggestedMatches = matchesAfterSuggest.data?.values || [];
  console.log("Matches after suggest:", suggestedMatches.length);
  for (const m of suggestedMatches) {
    console.log(`  Match ${m.id}: type=${m.type}, txns=${m.transactions?.length || 0}, postings=${m.postings?.length || 0}`);
    if (m.transactions?.length > 0) {
      for (const t of m.transactions) console.log(`    Txn: ${t.id}`);
    }
    if (m.postings?.length > 0) {
      for (const p of m.postings) console.log(`    Posting: ${p.id}`);
    }
  }

  // ====== 5. Try manual matching ======
  if (suggestedMatches.length === 0 && bankTxns.length > 0 && postings.length > 0) {
    console.log("\n=== 5. Try manual matching ===");

    // Match the opening balance bank txn to the opening balance posting
    const obPosting = postings.find((p: any) => p.amount === 100000);
    const obTxn = bankTxns.find((t: any) => t.amountCurrency === 5000); // first positive txn

    if (obPosting) {
      // Try matching the opening balance posting with the first positive bank txn
      console.log("Trying to match:");
      console.log(`  Bank txn: ${bankTxns[0]?.id} (amount=${bankTxns[0]?.amountCurrency})`);
      console.log(`  Posting: ${obPosting.id} (amount=${obPosting.amount})`);

      const matchRes = await api("POST", "bank/reconciliation/match", {
        bankReconciliation: { id: reconId },
        transactions: [{ id: bankTxns[0].id }],
        postings: [{ id: obPosting.id }],
      });
      console.log("Match result:", matchRes.status);

      // Try another match
      if (bankTxns.length > 1 && postings.length > 1) {
        const p2 = postings.find((p: any) => p.id !== obPosting.id && p.amount !== 0);
        if (p2) {
          console.log(`\nTrying match 2: txn ${bankTxns[1]?.id} (${bankTxns[1]?.amountCurrency}) -> posting ${p2.id} (${p2.amount})`);
          const matchRes2 = await api("POST", "bank/reconciliation/match", {
            bankReconciliation: { id: reconId },
            transactions: [{ id: bankTxns[1].id }],
            postings: [{ id: p2.id }],
          });
          console.log("Match 2 result:", matchRes2.status);
        }
      }
    }

    // Check matches state
    const matchesAfterManual = await api("GET", `bank/reconciliation/match?bankReconciliationId=${reconId}&count=100&fields=*`);
    const manualMatches = matchesAfterManual.data?.values || [];
    console.log("\nMatches after manual:", manualMatches.length);
    for (const m of manualMatches) {
      console.log(`  Match ${m.id}: txns=${JSON.stringify(m.transactions?.map((t: any) => t.id))}, postings=${JSON.stringify(m.postings?.map((p: any) => p.id))}`);
    }
  }

  // ====== 6. Check reconciliation state ======
  console.log("\n=== 6. Check reconciliation state ===");
  const reconDetail = await api("GET", `bank/reconciliation/${reconId}?fields=*`);
  const recon = reconDetail.data?.value;
  if (recon) {
    console.log("Recon state:");
    console.log("  isClosed:", recon.isClosed);
    console.log("  type:", recon.type);
    console.log("  balance:", recon.bankAccountClosingBalanceCurrency);
    console.log("  version:", recon.version);
    console.log("  transactions:", recon.transactions?.length || 0);
    console.log("  closedDate:", recon.closedDate);
  }

  // ====== 7. Get actual balance and try to close ======
  console.log("\n=== 7. Get actual balance and close ===");
  const bsRes = await api("GET", "balanceSheet?dateFrom=2026-11-01&dateTo=2026-12-01&accountNumberFrom=1920&accountNumberTo=1920&count=1&fields=*");
  const actualBalance = bsRes.data?.values?.[0]?.balanceOut;
  console.log("Actual 1920 balance for Nov:", actualBalance);

  if (!recon?.isClosed && actualBalance !== undefined) {
    // Try to close with actual balance
    const closeRes = await api("PUT", `bank/reconciliation/${reconId}`, {
      id: reconId,
      version: recon?.version || 0,
      account: { id: ACCT_1920_ID },
      accountingPeriod: { id: NOV_PERIOD_ID },
      type: "MANUAL",
      bankAccountClosingBalanceCurrency: Math.round(actualBalance * 100) / 100,
      isClosed: true,
    });
    console.log("Close result:", closeRes.status);

    if (closeRes.status >= 400) {
      // Try POST instead of PUT
      console.log("\nTrying POST to create+close in one call...");
      const postCloseRes = await api("POST", "bank/reconciliation", {
        account: { id: ACCT_1920_ID },
        accountingPeriod: { id: NOV_PERIOD_ID },
        type: "MANUAL",
        bankAccountClosingBalanceCurrency: Math.round(actualBalance * 100) / 100,
        isClosed: true,
      });
      console.log("POST close result:", postCloseRes.status);
    }
  }

  // ====== 8. Final state ======
  console.log("\n=== 8. Final state ===");

  // Check reconciliation
  const finalRecon = await api("GET", `bank/reconciliation/${reconId}?fields=*`);
  console.log("Final recon:", JSON.stringify({
    id: finalRecon.data?.value?.id,
    isClosed: finalRecon.data?.value?.isClosed,
    balance: finalRecon.data?.value?.bankAccountClosingBalanceCurrency,
    transactions: finalRecon.data?.value?.transactions?.length,
    closedDate: finalRecon.data?.value?.closedDate,
  }));

  // Check bank statement transactions
  const finalTxns = await api("GET", "bank/statement/transaction?bankStatementId=123943242&count=100&fields=*");
  console.log("\nFinal bank txns:");
  for (const t of (finalTxns.data?.values || [])) {
    console.log(`  Txn ${t.id}: amount=${t.amountCurrency}, matched=${t.matched}, matchType=${t.matchType}`);
  }

  // Check matches
  const finalMatches = await api("GET", `bank/reconciliation/match?bankReconciliationId=${reconId}&count=100&fields=*`);
  console.log("\nFinal matches:", finalMatches.data?.values?.length || 0);

  // Also check ALL reconciliation matches
  const allMatches = await api("GET", "bank/reconciliation/match?count=100&fields=*");
  console.log("ALL matches in system:", allMatches.data?.values?.length || 0);

  console.log("\n=== DONE ===");
}

main().catch(e => {
  console.error("FATAL:", e);
  process.exit(1);
});
