/**
 * 85-task23-bank-recon-match2.ts — Understand match validation
 *
 * Key error from previous run:
 *   "Summen av posteringer og transaksjoner er ikke lik null."
 *   (Sum of postings and transactions is not equal to zero)
 *
 * This means:
 *   sum(bank_txn.amountCurrency) + sum(posting.amount) must == 0
 *   OR maybe: sum(bank_txn.amountCurrency) - sum(posting.amount) must == 0
 *
 * Let's check the existing successful matches to understand the convention,
 * then create proper matches for our November reconciliation.
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
  const res = await fetch(url, opts);
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} -> ${res.status}`);
  return { status: res.status, data: json };
}

async function main() {
  // ====== 1. Examine existing successful matches ======
  console.log("=== 1. Examine existing matches ===");

  // Match 233288027: txn 189465774 <-> posting 3845905885
  const txn1 = await api("GET", "bank/statement/transaction/189465774?fields=*");
  const post1 = await api("GET", "ledger/posting/3845905885?fields=*");
  console.log("Match 233288027:");
  console.log("  Txn 189465774:", {
    amount: txn1.data?.value?.amountCurrency,
    desc: txn1.data?.value?.description,
    date: txn1.data?.value?.postedDate,
    matched: txn1.data?.value?.matched,
    matchType: txn1.data?.value?.matchType,
  });
  console.log("  Posting 3845905885:", {
    amount: post1.data?.value?.amount,
    amountCurrency: post1.data?.value?.amountCurrency,
    desc: post1.data?.value?.description,
    date: post1.data?.value?.date,
    matched: post1.data?.value?.matched,
  });
  const sum1 = (txn1.data?.value?.amountCurrency || 0) + (post1.data?.value?.amount || 0);
  console.log("  Sum (txn.amount + posting.amount):", sum1);

  // Match 233288028: txn 189465775 <-> posting 3845909089
  const txn2 = await api("GET", "bank/statement/transaction/189465775?fields=*");
  const post2 = await api("GET", "ledger/posting/3845909089?fields=*");
  console.log("\nMatch 233288028:");
  console.log("  Txn 189465775:", {
    amount: txn2.data?.value?.amountCurrency,
    desc: txn2.data?.value?.description,
  });
  console.log("  Posting 3845909089:", {
    amount: post2.data?.value?.amount,
    desc: post2.data?.value?.description,
  });
  const sum2 = (txn2.data?.value?.amountCurrency || 0) + (post2.data?.value?.amount || 0);
  console.log("  Sum (txn.amount + posting.amount):", sum2);

  // Match 233288029: txn 189465776 <-> posting 3845909093
  const txn3 = await api("GET", "bank/statement/transaction/189465776?fields=*");
  const post3 = await api("GET", "ledger/posting/3845909093?fields=*");
  console.log("\nMatch 233288029:");
  console.log("  Txn 189465776:", {
    amount: txn3.data?.value?.amountCurrency,
    desc: txn3.data?.value?.description,
  });
  console.log("  Posting 3845909093:", {
    amount: post3.data?.value?.amount,
    desc: post3.data?.value?.description,
  });
  const sum3 = (txn3.data?.value?.amountCurrency || 0) + (post3.data?.value?.amount || 0);
  console.log("  Sum (txn.amount + posting.amount):", sum3);

  // ====== 2. Now create proper matches for November ======
  console.log("\n=== 2. November matching ===");

  // Bank transactions: 189465930 (+5000), 189465931 (+3000), 189465932 (-2000), 189465933 (-150)
  // Postings: 3845989520 (+100000), 3845987393 (-57500), 3845919924 (0)
  //
  // The match validation requires txn.amount + posting.amount = 0
  // So we need a posting with -5000 for txn +5000, or vice versa.
  //
  // But our November postings don't match: we have 100000, -57500, and 0.
  // We need to create postings that correspond to the bank transactions.
  // In the real task flow, the customer payment postings would be created by PUT /invoice/:payment
  // which creates postings on 1920. Those postings would match the bank transactions.

  // Let's first check what the posting amounts look like for a customer payment
  // Look at posting 3845905885 in detail - this was matched to txn 189465774
  console.log("\n=== 3. Understand the pattern ===");
  console.log("Key insight: the match validation requires sum(txn.amount) + sum(posting.amount) = 0");
  console.log("This means bank txn +5000 (incoming) needs a posting with -5000 on 1920");
  console.log("BUT customer payment creates a DEBIT on 1920 (+5000), not credit");
  console.log("\nSo either:");
  console.log("  a) The bank txn amount sign is inverted from the posting sign (txn +5000 matches posting +5000, and the 'sum=0' uses subtraction)");
  console.log("  b) The match is between the bank txn and a CREDIT posting on 1920 (which doesn't make sense for incoming)");
  console.log("  c) The match includes BOTH postings of the voucher (DR 1920 + CR 1500), so the 1920 posting cancels the txn");

  // Let's check: is posting 3845905885 positive or negative?
  console.log("\nPosting 3845905885 amount:", post1.data?.value?.amount);
  console.log("Txn 189465774 amount:", txn1.data?.value?.amountCurrency);
  console.log("Their sum:", sum1);

  // The amounts are the KEY.
  // If txn=2500 and posting=-2500, sum=0 ✓
  // If txn=2500 and posting=2500, sum=5000 ✗
  //
  // In the existing match:
  //   txn amount = ? (we know it's from bank statement 123943085 with 1 transaction)
  //   posting amount = ?

  // ====== 4. Try creating matches with known-matching amounts ======
  console.log("\n=== 4. Create matching postings for November ===");

  // First, delete the closed Nov reconciliation and recreate open
  const RECON_ID = 12705508;
  const ACCT_1920_ID = 424190862;

  // Try to reopen (PUT with isClosed=false)
  const reopenRes = await api("GET", `bank/reconciliation/${RECON_ID}?fields=*`);
  const version = reopenRes.data?.value?.version;
  console.log("Current recon version:", version, "isClosed:", reopenRes.data?.value?.isClosed);

  if (reopenRes.data?.value?.isClosed) {
    // Delete the closed recon
    const delRes = await api("DELETE", `bank/reconciliation/${RECON_ID}`);
    console.log("Delete recon:", delRes.status);

    if (delRes.status >= 400) {
      // Try PUT to reopen
      const reopenRes2 = await api("PUT", `bank/reconciliation/${RECON_ID}`, {
        id: RECON_ID,
        version: version,
        account: { id: ACCT_1920_ID },
        accountingPeriod: { id: 23726310 },
        type: "MANUAL",
        bankAccountClosingBalanceCurrency: 0,
        isClosed: false,
      });
      console.log("Reopen:", reopenRes2.status);
    }
  }

  // Now let's create a fresh voucher with postings that match the bank transactions
  // Bank txn 189465930: +5000 -> needs posting of -5000
  // But that's a CREDIT on 1920, which is weird for an incoming payment
  //
  // Wait - let me re-read the existing match amounts first
  console.log("\n=== Existing match amounts (from step 1) ===");
  console.log("Txn 189465774 amount:", txn1.data?.value?.amountCurrency);
  console.log("Posting 3845905885 amount:", post1.data?.value?.amount);
  console.log("Posting 3845905885 account:", post1.data?.value?.account?.id);

  // ====== 5. See the existing Aug/Sep bank statement transactions ======
  console.log("\n=== 5. Check what the Sep statement transactions look like ===");
  const sepTxnRes = await api("GET", "bank/statement/transaction?bankStatementId=123943088&count=100&fields=*");
  const sepTxns = sepTxnRes.data?.values || [];
  for (const t of sepTxns) {
    console.log(`  Sep Txn ${t.id}: amount=${t.amountCurrency}, desc=${t.description}, matched=${t.matched}, matchType=${t.matchType}`);
  }

  // Check what reconId the Sep matches are on
  console.log("\nChecking Sep recon (12705486) reconciliation state...");
  const sepRecon = await api("GET", "bank/reconciliation/12705486?fields=*");
  console.log("Sep recon transactions:", sepRecon.data?.value?.transactions?.length || 0);

  // ====== 6. Now create proper postings and try matching ======
  console.log("\n=== 6. Create test postings in Nov and try matching ===");

  // The key insight from match 233288027:
  //   If txn is +2500 (bank incoming) and posting is -2500 (credit on 1920?), sum = 0
  //   OR if txn is -2500 and posting is +2500, sum = 0
  //
  // Let me check if the posting is actually on 1920 or somewhere else

  const acctOfPosting = post1.data?.value?.account;
  console.log("Posting 3845905885 is on account:", acctOfPosting?.id, "which is", acctOfPosting?.id === ACCT_1920_ID ? "1920" : "NOT 1920");

  // Create voucher with postings on 1920 that match our bank transactions
  // Bank txn +5000 -> if we need posting -5000 on 1920, that's a credit to bank (outgoing)
  // But that's wrong for an incoming payment!
  //
  // ALTERNATIVE: maybe the match is not about bank postings at all.
  // Maybe you match a bank transaction to the CONTRA posting (e.g. CR 1500 revenue)
  // Let me check which account posting 3845905885 is on
  console.log("\nFull posting 3845905885 details:");
  console.log("  Account:", post1.data?.value?.account);
  console.log("  Amount:", post1.data?.value?.amount);
  console.log("  Description:", post1.data?.value?.description);

  // If it's on 1920 with amount +2500 and bank txn is +2500, sum = +5000 (not 0)
  // If it's on 1920 with amount -2500 and bank txn is +2500, sum = 0 ✓
  // If it's on 1500 with amount -2500 and bank txn is +2500, sum = 0 ✓

  // So either the posting is on a contra account (not 1920), OR
  // the posting is on 1920 with opposite sign

  console.log("\n=== 7. Check existing reconciliation for Sep (has matches) ===");
  // Recon 12705486 (Sep, isClosed=false) has 2 matches
  const sepReconMatches = await api("GET", "bank/reconciliation/match?bankReconciliationId=12705486&count=10&fields=*");
  console.log("Sep matches:", sepReconMatches.data?.values?.length || 0);

  console.log("\n=== SUMMARY ===");
  console.log("Match 233288027: txn.amount =", txn1.data?.value?.amountCurrency, ", posting.amount =", post1.data?.value?.amount, ", sum =", sum1);
  console.log("Match 233288028: txn.amount =", txn2.data?.value?.amountCurrency, ", posting.amount =", post2.data?.value?.amount, ", sum =", sum2);
  console.log("Match 233288029: txn.amount =", txn3.data?.value?.amountCurrency, ", posting.amount =", post3.data?.value?.amount, ", sum =", sum3);
  console.log("\nIf all sums are 0, the rule is: txn.amountCurrency + posting.amount must = 0");
  console.log("This means the posting used in the match must have OPPOSITE sign from the bank transaction");
  console.log("For incoming payment txn (+5000), match with a posting that has amount = -5000");
  console.log("For outgoing payment txn (-2000), match with a posting that has amount = +2000");
}

main().catch(console.error);
