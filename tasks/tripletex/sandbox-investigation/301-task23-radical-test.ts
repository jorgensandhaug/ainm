/**
 * 301-task23-radical-test.ts — Test radical alternative approaches for Task 23
 *
 * Hypothesis:
 * 1. PUT /bank/reconciliation/match/:suggest can auto-match txns to postings
 * 2. PUT /bank/reconciliation/{id}/:adjustment can create voucher + match in one call
 * 3. We might skip OB voucher entirely
 *
 * Use a clean period (Sep 2026) with fresh data.
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
  const logBody = method !== "GET" && body && !isForm ? ` body=${JSON.stringify(body).slice(0, 300)}` : "";
  console.log(`${res.status} ${method} /${path.split("?")[0]}${logBody}`);
  if (!res.ok) {
    const errText = typeof json === "string" ? json.slice(0, 300) : JSON.stringify(json).slice(0, 300);
    console.error(`  ERROR: ${errText}`);
  }
  return json;
}

async function main() {
  // ==============================
  // PHASE 1: Setup — Create test data in a clean period (Sep 2026)
  // ==============================
  console.log("=== PHASE 1: SETUP (Sep 2026) ===\n");

  // Get accounts
  const accts = await api("GET", "ledger/account?number=1920,2050,2400,2600,7770,8050&fields=*");
  const acctMap: Record<number, number> = {};
  for (const a of (accts.values || [])) acctMap[a.number] = a.id;
  console.log("Accounts:", JSON.stringify(acctMap));

  // Get period for Sep 2026
  const periods = await api("GET", "ledger/accountingPeriod?startFrom=2026-09-01&startTo=2026-10-01&count=1&fields=*");
  const sepPeriod = periods.values?.[0];
  console.log(`Sep period: id=${sepPeriod?.id} start=${sepPeriod?.start} end=${sepPeriod?.end}`);

  // Check if any recon exists for Sep 2026
  const existingRecons = await api("GET", `bank/reconciliation?accountingPeriodId=${sepPeriod?.id}&count=10&fields=*`);
  console.log(`Existing recons for Sep: ${existingRecons.values?.length || 0}`);

  // Clean up if exists
  for (const r of (existingRecons.values || [])) {
    if (r.isClosed) {
      // Reopen first
      console.log(`  Reopening recon ${r.id}...`);
      await api("PUT", `bank/reconciliation/${r.id}`, {
        id: r.id, version: r.version,
        account: { id: acctMap[1920] }, accountingPeriod: { id: sepPeriod.id },
        type: "MANUAL", bankAccountClosingBalanceCurrency: 0, isClosed: false,
      });
    }
    // Delete matches
    const matches = await api("GET", `bank/reconciliation/match?bankReconciliationId=${r.id}&count=100&fields=id`);
    for (const m of (matches.values || [])) {
      await api("DELETE", `bank/reconciliation/match/${m.id}`);
    }
    // Delete recon
    await api("DELETE", `bank/reconciliation/${r.id}`);
  }

  // Create a simple voucher with known amounts on 1920
  // Simulate: 3 incoming (customer-like) and 2 outgoing (supplier-like)
  console.log("\nCreating test voucher with postings on 1920...");
  const vRes = await api("POST", "ledger/voucher", {
    date: "2026-09-05",
    description: "Test bank recon voucher - Sep 2026",
    postings: [
      // Customer payment 1: +5000
      { row: 1, date: "2026-09-05", description: "Customer payment A", account: { id: acctMap[1920] },
        amount: 5000, amountCurrency: 5000, amountGross: 5000, amountGrossCurrency: 5000 },
      { row: 2, date: "2026-09-05", description: "Customer payment A", account: { id: acctMap[2050] },
        amount: -5000, amountCurrency: -5000, amountGross: -5000, amountGrossCurrency: -5000 },
      // Customer payment 2: +3000
      { row: 3, date: "2026-09-10", description: "Customer payment B", account: { id: acctMap[1920] },
        amount: 3000, amountCurrency: 3000, amountGross: 3000, amountGrossCurrency: 3000 },
      { row: 4, date: "2026-09-10", description: "Customer payment B", account: { id: acctMap[2050] },
        amount: -3000, amountCurrency: -3000, amountGross: -3000, amountGrossCurrency: -3000 },
      // Supplier payment: -2000
      { row: 5, date: "2026-09-15", description: "Supplier payment X", account: { id: acctMap[2050] },
        amount: 2000, amountCurrency: 2000, amountGross: 2000, amountGrossCurrency: 2000 },
      { row: 6, date: "2026-09-15", description: "Supplier payment X", account: { id: acctMap[1920] },
        amount: -2000, amountCurrency: -2000, amountGross: -2000, amountGrossCurrency: -2000 },
      // Bank fee: -150
      { row: 7, date: "2026-09-20", description: "Bankgebyr", account: { id: acctMap[7770] },
        amount: 150, amountCurrency: 150, amountGross: 150, amountGrossCurrency: 150 },
      { row: 8, date: "2026-09-20", description: "Bankgebyr", account: { id: acctMap[1920] },
        amount: -150, amountCurrency: -150, amountGross: -150, amountGrossCurrency: -150 },
    ],
  });
  const voucherId = vRes?.value?.id;
  console.log(`Voucher created: id=${voucherId}`);

  // Import a bank statement for Sep 2026
  console.log("\nImporting bank statement for Sep 2026...");
  const sbankenCsv = [
    '"Inngående saldo 01.09.2026";"100000,00"',
    '"Utgående saldo 30.09.2026";"105850,00"',
    '"Bokført";"Rentedato";"Beskrivelse";"Beløp"',
    '"05.09.2026";"05.09.2026";"Customer payment A";"5000,00"',
    '"10.09.2026";"10.09.2026";"Customer payment B";"3000,00"',
    '"15.09.2026";"15.09.2026";"Supplier payment X";"-2000,00"',
    '"20.09.2026";"20.09.2026";"Bankgebyr";"-150,00"',
  ].join("\n") + "\n";

  const formData = new FormData();
  formData.append("file", new Blob([sbankenCsv], { type: "text/csv" }), "bankstatement.csv");
  const importRes = await api("POST",
    `bank/statement/import?bankId=112&accountId=${acctMap[1920]}&fromDate=2026-09-01&toDate=2026-10-01&fileFormat=SBANKEN_BEDRIFT_CSV`,
    formData, true
  );
  const bsId = importRes?.value?.id;
  const txnIds = (importRes?.value?.transactions || []).map((t: any) => t.id);
  console.log(`Bank statement: id=${bsId}, txns=${txnIds.length}: [${txnIds.join(",")}]`);

  // Verify txns
  for (const txnId of txnIds) {
    const txn = await api("GET", `bank/statement/transaction/${txnId}?fields=*`);
    console.log(`  txn ${txnId}: amount=${txn.value?.amountCurrency} desc="${txn.value?.description}" matched=${txn.value?.matched}`);
  }

  // Get postings on 1920 for Sep
  const postingsRes = await api("GET", `ledger/posting?accountId=${acctMap[1920]}&dateFrom=2026-09-01&dateTo=2026-10-01&count=100&fields=id,date,amount,description`);
  const postings1920 = postingsRes.values || [];
  console.log(`\nPostings on 1920 (Sep): ${postings1920.length}`);
  for (const p of postings1920) {
    console.log(`  posting ${p.id}: date=${p.date} amount=${p.amount} desc="${p.description}"`);
  }

  // ==============================
  // PHASE 2: TEST :suggest
  // ==============================
  console.log("\n\n=== PHASE 2: TEST :suggest ===\n");

  // Create a reconciliation
  const reconRes = await api("POST", "bank/reconciliation", {
    account: { id: acctMap[1920] },
    accountingPeriod: { id: sepPeriod.id },
    type: "MANUAL",
    bankAccountClosingBalanceCurrency: 0,
    isClosed: false,
  });
  const reconId = reconRes?.value?.id;
  const reconVersion = reconRes?.value?.version;
  console.log(`Recon created: id=${reconId} v=${reconVersion}`);

  // Try :suggest
  console.log("\nCalling PUT /bank/reconciliation/match/:suggest...");
  const suggestRes = await api("PUT", `bank/reconciliation/match/:suggest?bankReconciliationId=${reconId}`);
  const suggestions = suggestRes?.values || [];
  console.log(`Suggestions returned: ${suggestions.length}`);
  for (const s of suggestions) {
    console.log(`  Match id=${s.id} type=${s.type}`);
    console.log(`    txns: [${(s.transactions || []).map((t: any) => `${t.id}(${t.amountCurrency})`).join(",")}]`);
    console.log(`    postings: [${(s.postings || []).map((p: any) => `${p.id}(${p.amount})`).join(",")}]`);
  }

  // Check match state after suggest
  const matchesAfterSuggest = await api("GET", `bank/reconciliation/match?bankReconciliationId=${reconId}&count=100&fields=*`);
  console.log(`Matches after suggest: ${matchesAfterSuggest.values?.length || 0}`);
  for (const m of (matchesAfterSuggest.values || [])) {
    console.log(`  id=${m.id} type=${m.type} txns=${m.transactions?.length} postings=${m.postings?.length}`);
  }

  // Check if txns are now matched
  for (const txnId of txnIds) {
    const txn = await api("GET", `bank/statement/transaction/${txnId}?fields=id,amountCurrency,matched,matchType`);
    console.log(`  txn ${txnId}: matched=${txn.value?.matched} type=${txn.value?.matchType}`);
  }

  // ==============================
  // PHASE 3: TEST :adjustment
  // ==============================
  console.log("\n\n=== PHASE 3: TEST :adjustment ===\n");

  // First, let's clean up any suggestions and try :adjustment instead
  // Delete all matches
  const allMatches = await api("GET", `bank/reconciliation/match?bankReconciliationId=${reconId}&count=100&fields=id`);
  for (const m of (allMatches.values || [])) {
    await api("DELETE", `bank/reconciliation/match/${m.id}`);
  }
  console.log("Cleared all matches.");

  // Get reconciliation payment types
  const reconPayTypes = await api("GET", "bank/reconciliation/paymentType?count=100&fields=*");
  console.log(`Recon payment types: ${reconPayTypes.values?.length || 0}`);
  for (const pt of (reconPayTypes.values || [])) {
    console.log(`  id=${pt.id} desc="${pt.description}" ${JSON.stringify(pt).slice(0, 200)}`);
  }

  // Get recon settings
  const settings = await api("GET", "bank/reconciliation/settings?fields=*");
  console.log(`Settings: ${JSON.stringify(settings).slice(0, 300)}`);

  // Try :adjustment with a simple bank txn
  // Let's try to adjust the first bank txn (+5000 "Customer payment A")
  console.log("\nTrying :adjustment for txn +5000...");

  // Try 1: basic adjustment
  const adj1 = await api("PUT", `bank/reconciliation/${reconId}/:adjustment`, {
    bankTransactions: [{ id: txnIds[0] }],
    amount: 5000,
    date: "2026-09-05",
    description: "Test adjustment",
    postingDate: "2026-09-05",
    interimAccount: { id: acctMap[2050] },
  });
  console.log(`Adjustment result: ${JSON.stringify(adj1).slice(0, 500)}`);

  // Check state
  const matchesAfterAdj = await api("GET", `bank/reconciliation/match?bankReconciliationId=${reconId}&count=100&fields=*`);
  console.log(`Matches after adjustment: ${matchesAfterAdj.values?.length || 0}`);
  for (const m of (matchesAfterAdj.values || [])) {
    console.log(`  id=${m.id} type=${m.type}`);
  }

  // ==============================
  // PHASE 4: Test close without OB
  // ==============================
  console.log("\n\n=== PHASE 4: EXPLORE CLOSE OPTIONS ===\n");

  // What's the actual 1920 balance now?
  const balRes = await api("GET", "balanceSheet?dateFrom=2026-09-01&dateTo=2026-10-01&accountNumberFrom=1920&accountNumberTo=1920&count=1&fields=*");
  console.log(`Balance 1920 (Sep): ${JSON.stringify(balRes.values?.[0])}`);

  // Can we close with CSV saldo (which includes OB) even if 1920 balance doesn't match?
  // We need to check the closing balance validation logic

  // Get fresh recon
  const freshRecon = await api("GET", `bank/reconciliation/${reconId}?fields=*`);
  console.log(`Recon state: ${JSON.stringify(freshRecon.value).slice(0, 300)}`);

  // ==============================
  // CLEANUP
  // ==============================
  console.log("\n\n=== CLEANUP ===\n");
  // Delete matches
  const finalMatches = await api("GET", `bank/reconciliation/match?bankReconciliationId=${reconId}&count=100&fields=id`);
  for (const m of (finalMatches.values || [])) {
    await api("DELETE", `bank/reconciliation/match/${m.id}`);
  }
  // Delete recon
  await api("DELETE", `bank/reconciliation/${reconId}`);
  console.log("Cleaned up recon.");

  // Delete bank statement
  if (bsId) {
    await api("DELETE", `bank/statement/${bsId}`);
    console.log(`Cleaned up bank statement ${bsId}.`);
  }

  console.log("\n=== DONE ===");
}

main().catch(console.error);
