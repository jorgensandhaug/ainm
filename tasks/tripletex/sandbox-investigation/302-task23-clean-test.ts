/**
 * 302-task23-clean-test.ts — Test :suggest and :adjustment in a clean period
 *
 * Uses May 2027 (far future, should be clean)
 * Steps:
 * 1. Clean up any existing state in the period
 * 2. Create voucher postings on 1920
 * 3. Import bank statement
 * 4. Create recon
 * 5. Test :suggest (auto-match)
 * 6. Test :adjustment (create voucher + match)
 * 7. Clean up
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
  if (!res.ok) {
    console.error(`ERR ${res.status} ${method} /${path.split("?")[0]}: ${typeof json === "string" ? json.slice(0, 400) : JSON.stringify(json).slice(0, 400)}`);
  } else {
    console.log(`OK  ${res.status} ${method} /${path.split("?")[0]}`);
  }
  return json;
}

async function main() {
  console.log("=== CLEAN TEST IN MAY 2027 ===\n");

  // Get accounts
  const accts = await api("GET", "ledger/account?number=1920,2050,2400,2600,7770,8050&fields=*");
  const acctMap: Record<number, number> = {};
  for (const a of (accts.values || [])) acctMap[a.number] = a.id;

  // Get period for May 2027
  const periods = await api("GET", "ledger/accountingPeriod?startFrom=2027-05-01&startTo=2027-06-01&count=1&fields=*");
  const mayPeriod = periods.values?.[0];
  if (!mayPeriod) { console.error("No May 2027 period found"); return; }
  console.log(`May 2027 period: id=${mayPeriod.id} ${mayPeriod.start} → ${mayPeriod.end}`);

  // Check for existing recons
  const existingRecons = await api("GET", `bank/reconciliation?accountingPeriodId=${mayPeriod.id}&count=10&fields=*`);
  console.log(`Existing recons: ${existingRecons.values?.length || 0}`);

  // Check for existing bank statements in May 2027
  const existingBS = await api("GET", `bank/statement?count=100&fields=*`);
  const mayBS = (existingBS.values || []).filter((s: any) =>
    s.fromDate >= "2027-05-01" && s.fromDate < "2027-06-01"
  );
  console.log(`Existing bank statements in May 2027: ${mayBS.length}`);

  // Clean up existing bank statements in May
  for (const bs of mayBS) {
    console.log(`  Deleting bank statement ${bs.id}...`);
    await api("DELETE", `bank/statement/${bs.id}`);
  }

  // Clean up existing recons
  for (const r of (existingRecons.values || [])) {
    if (r.isClosed) {
      const fresh = await api("GET", `bank/reconciliation/${r.id}?fields=*`);
      await api("PUT", `bank/reconciliation/${r.id}`, {
        id: r.id, version: fresh.value.version,
        account: { id: acctMap[1920] }, accountingPeriod: { id: mayPeriod.id },
        type: "MANUAL", bankAccountClosingBalanceCurrency: 0, isClosed: false,
      });
    }
    const matches = await api("GET", `bank/reconciliation/match?bankReconciliationId=${r.id}&count=100&fields=id`);
    for (const m of (matches.values || [])) {
      await api("DELETE", `bank/reconciliation/match/${m.id}`);
    }
    await api("DELETE", `bank/reconciliation/${r.id}`);
  }

  // Also clean up the Sep statement I accidentally created
  const sepBS = (existingBS.values || []).filter((s: any) =>
    s.fromDate >= "2026-09-01" && s.fromDate < "2026-10-01"
  );
  for (const bs of sepBS) {
    console.log(`  Cleaning up Sep statement ${bs.id}...`);
    await api("DELETE", `bank/statement/${bs.id}`);
  }

  // ======================================
  // STEP 1: Create postings on 1920 for May 2027
  // ======================================
  console.log("\n--- STEP 1: Create voucher with 1920 postings ---");
  const vRes = await api("POST", "ledger/voucher", {
    date: "2027-05-05",
    description: "Bank recon test - May 2027",
    postings: [
      // +5000 on 1920 (simulating customer payment)
      { row: 1, date: "2027-05-05", description: "Innbetaling fra Kunde A", account: { id: acctMap[1920] },
        amount: 5000, amountCurrency: 5000, amountGross: 5000, amountGrossCurrency: 5000 },
      { row: 2, date: "2027-05-05", description: "Innbetaling fra Kunde A", account: { id: acctMap[2050] },
        amount: -5000, amountCurrency: -5000, amountGross: -5000, amountGrossCurrency: -5000 },
      // +3000 on 1920
      { row: 3, date: "2027-05-10", description: "Innbetaling fra Kunde B", account: { id: acctMap[1920] },
        amount: 3000, amountCurrency: 3000, amountGross: 3000, amountGrossCurrency: 3000 },
      { row: 4, date: "2027-05-10", description: "Innbetaling fra Kunde B", account: { id: acctMap[2050] },
        amount: -3000, amountCurrency: -3000, amountGross: -3000, amountGrossCurrency: -3000 },
      // -2000 on 1920 (simulating supplier payment)
      { row: 5, date: "2027-05-15", description: "Betaling Leverandør X", account: { id: acctMap[2050] },
        amount: 2000, amountCurrency: 2000, amountGross: 2000, amountGrossCurrency: 2000 },
      { row: 6, date: "2027-05-15", description: "Betaling Leverandør X", account: { id: acctMap[1920] },
        amount: -2000, amountCurrency: -2000, amountGross: -2000, amountGrossCurrency: -2000 },
      // -150 on 1920 (bank fee)
      { row: 7, date: "2027-05-20", description: "Bankgebyr", account: { id: acctMap[7770] },
        amount: 150, amountCurrency: 150, amountGross: 150, amountGrossCurrency: 150 },
      { row: 8, date: "2027-05-20", description: "Bankgebyr", account: { id: acctMap[1920] },
        amount: -150, amountCurrency: -150, amountGross: -150, amountGrossCurrency: -150 },
    ],
  });
  const voucherId = vRes?.value?.id;
  console.log(`Voucher: id=${voucherId}`);

  // ======================================
  // STEP 2: Import bank statement for May 2027
  // ======================================
  console.log("\n--- STEP 2: Import bank statement ---");
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
  const importRes = await api("POST",
    `bank/statement/import?bankId=112&accountId=${acctMap[1920]}&fromDate=2027-05-01&toDate=2027-06-01&fileFormat=SBANKEN_BEDRIFT_CSV`,
    formData, true
  );
  const bsId = importRes?.value?.id;
  const txnIds = (importRes?.value?.transactions || []).map((t: any) => t.id);
  console.log(`Bank statement: id=${bsId}, txns: [${txnIds.join(",")}]`);

  // Verify txns
  for (const id of txnIds) {
    const t = await api("GET", `bank/statement/transaction/${id}?fields=*`);
    console.log(`  txn ${id}: amount=${t.value?.amountCurrency} desc="${t.value?.description}"`);
  }

  // Get postings on 1920 for May
  const postingsRes = await api("GET", `ledger/posting?accountId=${acctMap[1920]}&dateFrom=2027-05-01&dateTo=2027-06-01&count=100&fields=id,date,amount,description`);
  const postings1920 = postingsRes.values || [];
  console.log(`\nPostings on 1920 (May): ${postings1920.length}`);
  for (const p of postings1920) {
    console.log(`  posting ${p.id}: date=${p.date} amount=${p.amount} desc="${p.description}"`);
  }

  // ======================================
  // STEP 3: Create recon + test :suggest
  // ======================================
  console.log("\n--- STEP 3: Create recon + test :suggest ---");
  const reconRes = await api("POST", "bank/reconciliation", {
    account: { id: acctMap[1920] },
    accountingPeriod: { id: mayPeriod.id },
    type: "MANUAL",
    bankAccountClosingBalanceCurrency: 0,
    isClosed: false,
  });
  const reconId = reconRes?.value?.id;
  console.log(`Recon: id=${reconId} v=${reconRes?.value?.version}`);

  if (!reconId) {
    console.error("Failed to create recon — aborting");
    // Clean up
    if (bsId) await api("DELETE", `bank/statement/${bsId}`);
    return;
  }

  // Test :suggest
  console.log("\n>>> Testing PUT /bank/reconciliation/match/:suggest...");
  const suggestRes = await api("PUT", `bank/reconciliation/match/:suggest?bankReconciliationId=${reconId}`);
  const suggestions = suggestRes?.values || [];
  console.log(`\nSuggestions returned: ${suggestions.length}`);
  for (const s of suggestions) {
    const txnDesc = (s.transactions || []).map((t: any) => `${t.id}(${t.amountCurrency || '?'})`).join(",");
    const postDesc = (s.postings || []).map((p: any) => `${p.id}(${p.amount || '?'})`).join(",");
    console.log(`  Match type=${s.type}`);
    console.log(`    txns: [${txnDesc}]`);
    console.log(`    postings: [${postDesc}]`);
  }

  // Check match state
  const matches1 = await api("GET", `bank/reconciliation/match?bankReconciliationId=${reconId}&count=100&fields=*`);
  console.log(`\nMatches after suggest: ${matches1.values?.length || 0}`);
  for (const m of (matches1.values || [])) {
    console.log(`  id=${m.id} type=${m.type} approved=${m.approved}`);
    for (const t of (m.transactions || [])) {
      console.log(`    txn: id=${t.id} amount=${t.amountCurrency}`);
    }
    for (const p of (m.postings || [])) {
      console.log(`    posting: id=${p.id} amount=${p.amount}`);
    }
  }

  // Check txn matched status
  console.log("\nTxn match status after suggest:");
  for (const id of txnIds) {
    const t = await api("GET", `bank/statement/transaction/${id}?fields=id,amountCurrency,matched,matchType`);
    console.log(`  txn ${id}: matched=${t.value?.matched} type=${t.value?.matchType}`);
  }

  // ======================================
  // STEP 4: If suggest didn't match everything, test :adjustment
  // ======================================
  console.log("\n--- STEP 4: Test :adjustment for unmatched txns ---");

  // Find unmatched txns
  const unmatchedTxns: number[] = [];
  for (const id of txnIds) {
    const t = await api("GET", `bank/statement/transaction/${id}?fields=id,matched`);
    if (!t.value?.matched) unmatchedTxns.push(id);
  }
  console.log(`Unmatched txns: ${unmatchedTxns.length}`);

  if (unmatchedTxns.length > 0) {
    // Get recon payment types for adjustment
    const reconPTs = await api("GET", "bank/reconciliation/paymentType?count=100&fields=*");
    console.log(`Recon payment types available: ${(reconPTs.values || []).map((pt:any) => `${pt.id}="${pt.description}"`).join(", ")}`);

    // Try adjustment on first unmatched txn
    const firstUnmatched = unmatchedTxns[0];
    const firstTxnData = await api("GET", `bank/statement/transaction/${firstUnmatched}?fields=*`);
    const txnAmount = firstTxnData.value?.amountCurrency || 0;
    console.log(`\nTrying adjustment for txn ${firstUnmatched} (amount=${txnAmount})...`);

    // Try with a payment type
    const bankgebyrPT = (reconPTs.values || []).find((pt: any) => pt.description === "Bankgebyr");

    // Try 1: With paymentType
    if (bankgebyrPT) {
      console.log(`\n>>> Attempt 1: adjustment with paymentType "Bankgebyr"...`);
      const adj = await api("PUT", `bank/reconciliation/${reconId}/:adjustment`, {
        paymentType: { id: bankgebyrPT.id },
        bankTransactions: [{ id: firstUnmatched }],
        amount: Math.abs(txnAmount),
        date: "2027-05-20",
        postingDate: "2027-05-20",
        description: "Bankgebyr adjustment test",
      });
      console.log(`Result: ${JSON.stringify(adj).slice(0, 500)}`);
    }

    // Try 2: With interimAccount
    console.log(`\n>>> Attempt 2: adjustment with interimAccount...`);
    const adj2 = await api("PUT", `bank/reconciliation/${reconId}/:adjustment`, {
      bankTransactions: [{ id: unmatchedTxns[0] }],
      amount: Math.abs(txnAmount),
      date: "2027-05-20",
      postingDate: "2027-05-20",
      description: "Adjustment test 2",
      interimAccount: { id: acctMap[2050] },
    });
    console.log(`Result: ${JSON.stringify(adj2).slice(0, 500)}`);

    // Try 3: Multiple txns
    if (unmatchedTxns.length > 1) {
      console.log(`\n>>> Attempt 3: adjustment with multiple txns...`);
      const adj3 = await api("PUT", `bank/reconciliation/${reconId}/:adjustment`, {
        bankTransactions: unmatchedTxns.map(id => ({ id })),
        amount: 0, // try net amount
        date: "2027-05-20",
        postingDate: "2027-05-20",
        description: "Multi-txn adjustment",
        interimAccount: { id: acctMap[2050] },
      });
      console.log(`Result: ${JSON.stringify(adj3).slice(0, 500)}`);
    }
  }

  // ======================================
  // STEP 5: Try to close recon
  // ======================================
  console.log("\n--- STEP 5: Final state check ---");

  // Check all matches
  const finalMatches = await api("GET", `bank/reconciliation/match?bankReconciliationId=${reconId}&count=100&fields=*`);
  console.log(`Total matches: ${finalMatches.values?.length || 0}`);

  // Get fresh recon
  const freshRecon = await api("GET", `bank/reconciliation/${reconId}?fields=*`);
  console.log(`Recon state: isClosed=${freshRecon.value?.isClosed} closing=${freshRecon.value?.bankAccountClosingBalanceCurrency} v=${freshRecon.value?.version}`);

  // Try closing with CSV closing balance
  console.log("\n>>> Trying to close recon with balance 5850...");
  const closeRes = await api("PUT", `bank/reconciliation/${reconId}`, {
    id: reconId, version: freshRecon.value?.version,
    account: { id: acctMap[1920] }, accountingPeriod: { id: mayPeriod.id },
    type: "MANUAL", bankAccountClosingBalanceCurrency: 5850, isClosed: true,
  });
  console.log(`Close result: ${JSON.stringify(closeRes).slice(0, 300)}`);

  // Final txn status
  console.log("\nFinal txn status:");
  for (const id of txnIds) {
    const t = await api("GET", `bank/statement/transaction/${id}?fields=id,amountCurrency,matched,matchType`);
    console.log(`  txn ${id}: amount=${t.value?.amountCurrency} matched=${t.value?.matched} type=${t.value?.matchType}`);
  }

  // ======================================
  // CLEANUP
  // ======================================
  console.log("\n--- CLEANUP ---");

  // Reopen recon if closed
  const finalRecon = await api("GET", `bank/reconciliation/${reconId}?fields=*`);
  if (finalRecon.value?.isClosed) {
    await api("PUT", `bank/reconciliation/${reconId}`, {
      id: reconId, version: finalRecon.value.version,
      account: { id: acctMap[1920] }, accountingPeriod: { id: mayPeriod.id },
      type: "MANUAL", bankAccountClosingBalanceCurrency: 0, isClosed: false,
    });
  }

  // Delete matches
  const cleanMatches = await api("GET", `bank/reconciliation/match?bankReconciliationId=${reconId}&count=100&fields=id`);
  for (const m of (cleanMatches.values || [])) {
    await api("DELETE", `bank/reconciliation/match/${m.id}`);
  }

  // Delete recon
  await api("DELETE", `bank/reconciliation/${reconId}`);

  // Delete bank statement
  if (bsId) await api("DELETE", `bank/statement/${bsId}`);

  console.log("Cleanup complete.");
  console.log("\n=== DONE ===");
}

main().catch(console.error);
