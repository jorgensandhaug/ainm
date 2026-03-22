/**
 * 303-task23-full-reset-and-test.ts — Full sandbox reset + test
 *
 * 1. Delete ALL bank reconciliations (reopen closed ones first)
 * 2. Delete ALL bank statements
 * 3. Clean up 1920 postings in the test period
 * 4. Run full E2E test in a clean period
 * 5. Test :suggest and :adjustment
 */

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + Buffer.from("0:" + TOKEN).toString("base64");

async function api(method: string, path: string, body?: any, isForm = false): Promise<any> {
  const url = `${BASE}/${path}`;
  const headers: Record<string, string> = { Authorization: AUTH };
  if (body && !isForm) headers["Content-Type"] = "application/json";
  const opts: RequestInit = { method, headers };
  if (body) opts.body = isForm ? body : JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  const tag = res.ok ? "OK " : "ERR";
  console.log(`${tag} ${res.status} ${method} ${path.split("?")[0]}`);
  if (!res.ok && typeof json === "object") {
    const msg = json.validationMessages?.[0]?.message || json.message || "";
    console.log(`    ${msg.slice(0, 200)}`);
  }
  return { status: res.status, data: json };
}

async function main() {
  // ==============================
  // PHASE 0: Full cleanup
  // ==============================
  console.log("=== PHASE 0: FULL CLEANUP ===\n");

  // Get accounts
  const accts = (await api("GET", "ledger/account?number=1920,2050,2400,2600,7770,8050&fields=*")).data;
  const acctMap: Record<number, number> = {};
  for (const a of (accts.values || [])) acctMap[a.number] = a.id;

  // 1. Delete ALL bank reconciliation matches
  console.log("--- Cleaning all reconciliations ---");
  const recons = (await api("GET", "bank/reconciliation?count=100&fields=*,accountingPeriod(*)")).data;
  const reconList = recons.values || [];
  console.log(`Found ${reconList.length} reconciliations`);

  for (const r of reconList) {
    console.log(`\n  Recon ${r.id}: isClosed=${r.isClosed} period=${r.accountingPeriod?.start} v=${r.version}`);

    // Reopen if closed
    if (r.isClosed) {
      console.log(`    Reopening...`);
      const reopenRes = await api("PUT", `bank/reconciliation/${r.id}`, {
        id: r.id, version: r.version,
        account: { id: acctMap[1920] },
        accountingPeriod: { id: r.accountingPeriod?.id },
        type: "MANUAL",
        bankAccountClosingBalanceCurrency: 0,
        isClosed: false,
      });

      if (reopenRes.status >= 400) {
        console.log(`    Reopen failed, trying with fresh version...`);
        const fresh = (await api("GET", `bank/reconciliation/${r.id}?fields=*`)).data;
        await api("PUT", `bank/reconciliation/${r.id}`, {
          id: r.id, version: fresh.value?.version,
          account: { id: acctMap[1920] },
          accountingPeriod: { id: r.accountingPeriod?.id },
          type: "MANUAL",
          bankAccountClosingBalanceCurrency: 0,
          isClosed: false,
        });
      }
    }

    // Delete matches
    const matches = (await api("GET", `bank/reconciliation/match?bankReconciliationId=${r.id}&count=100&fields=id`)).data;
    for (const m of (matches.values || [])) {
      await api("DELETE", `bank/reconciliation/match/${m.id}`);
    }

    // Delete recon
    await api("DELETE", `bank/reconciliation/${r.id}`);
  }

  // 2. Delete ALL bank statements
  console.log("\n--- Cleaning all bank statements ---");
  const statements = (await api("GET", "bank/statement?count=100&fields=*")).data;
  for (const s of (statements.values || [])) {
    console.log(`  Deleting statement ${s.id} (${s.fromDate} to ${s.toDate})`);
    await api("DELETE", `bank/statement/${s.id}`);
  }

  // Verify clean state
  const verifyRecons = (await api("GET", "bank/reconciliation?count=100&fields=*")).data;
  const verifyBS = (await api("GET", "bank/statement?count=100&fields=*")).data;
  console.log(`\nAfter cleanup: ${verifyRecons.values?.length || 0} recons, ${verifyBS.values?.length || 0} statements`);

  // ==============================
  // PHASE 1: Create test data in clean period (May 2027)
  // ==============================
  console.log("\n\n=== PHASE 1: CREATE TEST DATA (May 2027) ===\n");

  // Get May 2027 period
  const periods = (await api("GET", "ledger/accountingPeriod?startFrom=2027-05-01&startTo=2027-06-01&count=1&fields=*")).data;
  const mayPeriod = periods.values?.[0];
  console.log(`May 2027: id=${mayPeriod?.id} ${mayPeriod?.start} → ${mayPeriod?.end}`);

  // Create voucher with known postings on 1920
  console.log("\nCreating voucher with 4 transactions on 1920...");
  const vRes = (await api("POST", "ledger/voucher", {
    date: "2027-05-05",
    description: "Bank recon E2E test - May 2027",
    postings: [
      // +5000 customer payment
      { row: 1, date: "2027-05-05", description: "Innbetaling fra Kunde A", account: { id: acctMap[1920] },
        amount: 5000, amountCurrency: 5000, amountGross: 5000, amountGrossCurrency: 5000 },
      { row: 2, date: "2027-05-05", description: "Innbetaling fra Kunde A", account: { id: acctMap[2050] },
        amount: -5000, amountCurrency: -5000, amountGross: -5000, amountGrossCurrency: -5000 },
      // +3000 customer payment
      { row: 3, date: "2027-05-10", description: "Innbetaling fra Kunde B", account: { id: acctMap[1920] },
        amount: 3000, amountCurrency: 3000, amountGross: 3000, amountGrossCurrency: 3000 },
      { row: 4, date: "2027-05-10", description: "Innbetaling fra Kunde B", account: { id: acctMap[2050] },
        amount: -3000, amountCurrency: -3000, amountGross: -3000, amountGrossCurrency: -3000 },
      // -2000 supplier payment
      { row: 5, date: "2027-05-15", description: "Betaling Leverandør X", account: { id: acctMap[2050] },
        amount: 2000, amountCurrency: 2000, amountGross: 2000, amountGrossCurrency: 2000 },
      { row: 6, date: "2027-05-15", description: "Betaling Leverandør X", account: { id: acctMap[1920] },
        amount: -2000, amountCurrency: -2000, amountGross: -2000, amountGrossCurrency: -2000 },
      // -150 bank fee
      { row: 7, date: "2027-05-20", description: "Bankgebyr", account: { id: acctMap[7770] },
        amount: 150, amountCurrency: 150, amountGross: 150, amountGrossCurrency: 150 },
      { row: 8, date: "2027-05-20", description: "Bankgebyr", account: { id: acctMap[1920] },
        amount: -150, amountCurrency: -150, amountGross: -150, amountGrossCurrency: -150 },
    ],
  })).data;
  const voucherId = vRes?.value?.id;
  console.log(`Voucher: id=${voucherId}`);
  if (!voucherId) { console.log("VOUCHER FAIL:", JSON.stringify(vRes).slice(0, 300)); return; }

  // Import bank statement
  console.log("\nImporting bank statement...");
  const sbankenCsv = [
    '"Inngående saldo 01.05.2027";"0,00"',
    '"Utgående saldo 31.05.2027";"5850,00"',
    '"Bokført";"Rentedato";"Beskrivelse";"Beløp"',
    '"05.05.2027";"05.05.2027";"Innbetaling fra Kunde A";"5000,00"',
    '"10.05.2027";"10.05.2027";"Innbetaling fra Kunde B";"3000,00"',
    '"15.05.2027";"15.05.2027";"Betaling Leverandør X";"-2000,00"',
    '"20.05.2027";"20.05.2027";"Bankgebyr";"-150,00"',
  ].join("\n") + "\n";

  const formData = new FormData();
  formData.append("file", new Blob([sbankenCsv], { type: "text/csv" }), "bankstatement.csv");
  const importRes = (await api("POST",
    `bank/statement/import?bankId=112&accountId=${acctMap[1920]}&fromDate=2027-05-01&toDate=2027-06-01&fileFormat=SBANKEN_BEDRIFT_CSV`,
    formData, true
  )).data;
  const bsId = importRes?.value?.id;
  const txnIds = (importRes?.value?.transactions || []).map((t: any) => t.id);
  console.log(`Bank statement: id=${bsId}, txns=[${txnIds.join(",")}]`);

  // Get postings
  const postingsRes = (await api("GET", `ledger/posting?accountId=${acctMap[1920]}&dateFrom=2027-05-01&dateTo=2027-06-01&count=100&fields=id,date,amount,description`)).data;
  const p1920 = postingsRes.values || [];
  console.log(`\n1920 postings in May 2027: ${p1920.length}`);
  for (const p of p1920) console.log(`  ${p.id}: ${p.date} ${p.amount} "${p.description}"`);

  // ==============================
  // PHASE 2: TEST :suggest
  // ==============================
  console.log("\n\n=== PHASE 2: TEST :suggest ===\n");

  const reconRes = (await api("POST", "bank/reconciliation", {
    account: { id: acctMap[1920] },
    accountingPeriod: { id: mayPeriod.id },
    type: "MANUAL",
    bankAccountClosingBalanceCurrency: 0,
    isClosed: false,
  })).data;
  const reconId = reconRes?.value?.id;
  console.log(`Recon: id=${reconId}`);

  if (!reconId) {
    console.log("RECON FAIL:", JSON.stringify(reconRes).slice(0, 300));
    if (bsId) await api("DELETE", `bank/statement/${bsId}`);
    return;
  }

  console.log("\n>>> PUT /bank/reconciliation/match/:suggest");
  const suggestRes = (await api("PUT", `bank/reconciliation/match/:suggest?bankReconciliationId=${reconId}`)).data;
  const suggestions = suggestRes?.values || [];
  console.log(`Suggestions: ${suggestions.length}`);
  for (const s of suggestions) {
    console.log(`  type=${s.type}`);
    const txns = s.transactions || [];
    const posts = s.postings || [];
    for (const t of txns) console.log(`    txn: ${t.id} amount=${t.amountCurrency}`);
    for (const p of posts) console.log(`    posting: ${p.id} amount=${p.amount}`);
  }

  // Check match state
  const m1 = (await api("GET", `bank/reconciliation/match?bankReconciliationId=${reconId}&count=100&fields=*`)).data;
  console.log(`\nMatches after suggest: ${m1.values?.length || 0}`);
  for (const m of (m1.values || [])) {
    console.log(`  id=${m.id} type=${m.type}`);
    for (const t of (m.transactions || [])) console.log(`    txn ${t.id}: amount=${t.amountCurrency}`);
    for (const p of (m.postings || [])) console.log(`    posting ${p.id}: amount=${p.amount}`);
  }

  // Check txn matched status
  let matchedCount = 0;
  for (const id of txnIds) {
    const t = (await api("GET", `bank/statement/transaction/${id}?fields=id,amountCurrency,matched,matchType`)).data;
    const matched = t.value?.matched;
    if (matched) matchedCount++;
    console.log(`  txn ${id}: ${t.value?.amountCurrency} matched=${matched} type=${t.value?.matchType}`);
  }

  console.log(`\n*** :suggest matched ${matchedCount}/${txnIds.length} transactions! ***`);

  // ==============================
  // PHASE 3: If suggest worked, try to close immediately
  // ==============================
  if (matchedCount === txnIds.length) {
    console.log("\n\n=== PHASE 3: ALL MATCHED — TRYING CLOSE ===\n");
    const freshRecon = (await api("GET", `bank/reconciliation/${reconId}?fields=*`)).data;
    console.log(`Recon state: v=${freshRecon.value?.version}`);

    const closeRes = (await api("PUT", `bank/reconciliation/${reconId}`, {
      id: reconId, version: freshRecon.value?.version,
      account: { id: acctMap[1920] }, accountingPeriod: { id: mayPeriod.id },
      type: "MANUAL", bankAccountClosingBalanceCurrency: 5850, isClosed: true,
    })).data;
    console.log(`Close: ${closeRes?.value ? "SUCCESS" : "FAILED"} ${JSON.stringify(closeRes).slice(0, 300)}`);
  } else {
    // ==============================
    // PHASE 3b: Test :adjustment for unmatched
    // ==============================
    console.log("\n\n=== PHASE 3b: TEST :adjustment FOR UNMATCHED ===\n");

    // Find unmatched txns
    for (const id of txnIds) {
      const t = (await api("GET", `bank/statement/transaction/${id}?fields=*`)).data;
      if (!t.value?.matched) {
        console.log(`\nUnmatched txn ${id}: amount=${t.value?.amountCurrency} desc="${t.value?.description}"`);

        // Try adjustment with paymentType if it's a bankgebyr
        const isNeg = t.value?.amountCurrency < 0;
        const reconPTs = (await api("GET", "bank/reconciliation/paymentType?count=100&fields=*")).data;

        // For negative amounts, try adjustment
        console.log(`  Trying :adjustment...`);
        const adjRes = (await api("PUT", `bank/reconciliation/${reconId}/:adjustment`, {
          bankTransactions: [{ id }],
          amount: Math.abs(t.value?.amountCurrency),
          date: t.value?.date || "2027-05-20",
          postingDate: t.value?.date || "2027-05-20",
          description: t.value?.description || "Adjustment",
          interimAccount: { id: acctMap[2050] },
        })).data;
        console.log(`  Result: ${JSON.stringify(adjRes).slice(0, 400)}`);

        // Check if it matched now
        const check = (await api("GET", `bank/statement/transaction/${id}?fields=id,matched,matchType`)).data;
        console.log(`  After adjustment: matched=${check.value?.matched} type=${check.value?.matchType}`);
      }
    }

    // Also try manual matching for any remaining
    console.log("\n--- Manual match fallback ---");
    for (const id of txnIds) {
      const t = (await api("GET", `bank/statement/transaction/${id}?fields=id,amountCurrency,matched`)).data;
      if (!t.value?.matched) {
        const amt = t.value?.amountCurrency;
        // Find matching posting
        const matchPost = p1920.find((p: any) => Math.abs(p.amount - amt) < 0.01);
        if (matchPost) {
          console.log(`  Matching txn ${id} (${amt}) → posting ${matchPost.id} (${matchPost.amount})`);
          await api("POST", "bank/reconciliation/match", {
            bankReconciliation: { id: reconId },
            transactions: [{ id }],
            postings: [{ id: matchPost.id }],
          });
        }
      }
    }

    // Final check
    console.log("\nFinal txn status:");
    let finalMatched = 0;
    for (const id of txnIds) {
      const t = (await api("GET", `bank/statement/transaction/${id}?fields=id,amountCurrency,matched,matchType`)).data;
      if (t.value?.matched) finalMatched++;
      console.log(`  txn ${id}: ${t.value?.amountCurrency} matched=${t.value?.matched} type=${t.value?.matchType}`);
    }

    // Try close
    if (finalMatched === txnIds.length) {
      console.log("\n>>> All matched! Closing recon...");
      const freshRecon = (await api("GET", `bank/reconciliation/${reconId}?fields=*`)).data;
      const closeRes = (await api("PUT", `bank/reconciliation/${reconId}`, {
        id: reconId, version: freshRecon.value?.version,
        account: { id: acctMap[1920] }, accountingPeriod: { id: mayPeriod.id },
        type: "MANUAL", bankAccountClosingBalanceCurrency: 5850, isClosed: true,
      })).data;
      console.log(`Close: ${closeRes?.value ? "SUCCESS" : "FAILED"}`);
    }
  }

  // ==============================
  // FINAL CLEANUP
  // ==============================
  console.log("\n\n=== FINAL CLEANUP ===\n");

  // Reopen recon if closed
  const finalRecon = (await api("GET", `bank/reconciliation/${reconId}?fields=*`)).data;
  if (finalRecon.value?.isClosed) {
    await api("PUT", `bank/reconciliation/${reconId}`, {
      id: reconId, version: finalRecon.value.version,
      account: { id: acctMap[1920] }, accountingPeriod: { id: mayPeriod.id },
      type: "MANUAL", bankAccountClosingBalanceCurrency: 0, isClosed: false,
    });
  }

  const cleanMatches = (await api("GET", `bank/reconciliation/match?bankReconciliationId=${reconId}&count=100&fields=id`)).data;
  for (const m of (cleanMatches.values || [])) {
    await api("DELETE", `bank/reconciliation/match/${m.id}`);
  }
  await api("DELETE", `bank/reconciliation/${reconId}`);
  if (bsId) await api("DELETE", `bank/statement/${bsId}`);
  console.log("All cleaned up.");
  console.log("\n=== DONE ===");
}

main().catch(console.error);
