/**
 * 304-task23-adjustment-test.ts — Test :adjustment with correct body format
 *
 * Key finding from 303: body must be an ARRAY, not an object.
 * Also tests closing with correct balance.
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
  const logBody = method !== "GET" && body && !isForm ? ` body=${JSON.stringify(body).slice(0, 400)}` : "";
  const status = res.ok ? "OK " : "ERR";
  console.log(`${status} ${res.status} ${method} /${path.split("?")[0]}${logBody}`);
  if (!res.ok) {
    const errText = typeof json === "string" ? json.slice(0, 400) : JSON.stringify(json).slice(0, 400);
    console.error(`    ${errText}`);
  }
  return json;
}

async function main() {
  console.log("=== 304: TEST :adjustment WITH CORRECT BODY FORMAT ===\n");

  // Get accounts
  const accts = await api("GET", "ledger/account?number=1920,2050,7770,8050&fields=id,number");
  const acctMap: Record<number, number> = {};
  for (const a of (accts.values || [])) acctMap[a.number] = a.id;
  console.log("Accounts:", JSON.stringify(acctMap));

  // Get period for Jun 2027 (a clean period)
  const periods = await api("GET", "ledger/accountingPeriod?startFrom=2027-06-01&startTo=2027-07-01&count=1&fields=*");
  const period = periods.values?.[0];
  console.log(`Period: id=${period?.id} ${period?.start} → ${period?.end}`);

  // Create a simple voucher so we have postings on 1920
  console.log("\n--- Creating voucher ---");
  const vRes = await api("POST", "ledger/voucher", {
    date: "2027-06-05",
    description: "Test bank recon voucher Jun 2027",
    postings: [
      { row: 1, date: "2027-06-05", description: "Payment A", account: { id: acctMap[1920] },
        amount: 5000, amountCurrency: 5000, amountGross: 5000, amountGrossCurrency: 5000 },
      { row: 2, date: "2027-06-05", description: "Payment A", account: { id: acctMap[2050] },
        amount: -5000, amountCurrency: -5000, amountGross: -5000, amountGrossCurrency: -5000 },
      { row: 3, date: "2027-06-15", description: "Bank fee", account: { id: acctMap[7770] },
        amount: 150, amountCurrency: 150, amountGross: 150, amountGrossCurrency: 150 },
      { row: 4, date: "2027-06-15", description: "Bank fee", account: { id: acctMap[1920] },
        amount: -150, amountCurrency: -150, amountGross: -150, amountGrossCurrency: -150 },
    ],
  });
  const voucherId = vRes?.value?.id;
  console.log(`Voucher: id=${voucherId}`);

  // Import bank statement
  console.log("\n--- Importing bank statement ---");
  const csv = [
    '"Inngående saldo 01.06.2027";"0,00"',
    '"Utgående saldo 30.06.2027";"4850,00"',
    '"Bokført";"Rentedato";"Beskrivelse";"Beløp"',
    '"05.06.2027";"05.06.2027";"Payment A";"5000,00"',
    '"15.06.2027";"15.06.2027";"Bank fee";"-150,00"',
  ].join("\n") + "\n";

  const formData = new FormData();
  formData.append("file", new Blob([csv], { type: "text/csv" }), "bankstatement.csv");
  const importRes = await api("POST",
    `bank/statement/import?bankId=112&accountId=${acctMap[1920]}&fromDate=2027-06-01&toDate=2027-07-01&fileFormat=SBANKEN_BEDRIFT_CSV`,
    formData, true
  );
  const bsId = importRes?.value?.id;
  const txnIds = (importRes?.value?.transactions || []).map((t: any) => t.id);
  console.log(`Bank statement: id=${bsId}, txns=${txnIds.length}: [${txnIds.join(",")}]`);

  // Get actual txn details
  for (const txnId of txnIds) {
    const t = await api("GET", `bank/statement/transaction/${txnId}?fields=*`);
    console.log(`  txn ${txnId}: amount=${t.value?.amountCurrency} desc="${t.value?.description}"`);
  }

  // Get postings on 1920 in Jun 2027
  const postingsRes = await api("GET", `ledger/posting?accountId=${acctMap[1920]}&dateFrom=2027-06-01&dateTo=2027-07-01&count=100&fields=id,date,amount,description`);
  const postings = postingsRes.values || [];
  console.log(`\nPostings on 1920 (Jun 2027): ${postings.length}`);
  for (const p of postings) {
    console.log(`  ${p.id}: date=${p.date} amount=${p.amount} desc="${p.description}"`);
  }

  // Find matching postings
  const posting5000 = postings.find((p: any) => p.amount === 5000);
  const postingFee = postings.find((p: any) => p.amount === -150);
  console.log(`\nMatch candidates: 5000→${posting5000?.id}, -150→${postingFee?.id}`);

  // Create reconciliation
  console.log("\n--- Creating reconciliation ---");
  const reconRes = await api("POST", "bank/reconciliation", {
    account: { id: acctMap[1920] },
    accountingPeriod: { id: period.id },
    type: "MANUAL",
    bankAccountClosingBalanceCurrency: 0,
    isClosed: false,
  });
  const reconId = reconRes?.value?.id;
  console.log(`Recon: id=${reconId}`);

  // Get payment types
  const ptRes = await api("GET", "bank/reconciliation/paymentType?count=100&fields=*");
  console.log(`\nPayment types: ${ptRes.values?.length}`);
  for (const pt of (ptRes.values || [])) {
    console.log(`  id=${pt.id} desc="${pt.description}" debit=${pt.debitAccount?.id} credit=${pt.creditAccount?.id}`);
  }
  const bankgebyrPT = ptRes.values?.find((pt: any) => pt.description === "Bankgebyr");

  // ============================================
  // TEST 1: :adjustment with ARRAY body — simple fee
  // ============================================
  console.log("\n\n=== TEST 1: :adjustment with ARRAY body ===\n");

  // Try with just bankTransactions + paymentType (for bank fee)
  const adj1 = await api("PUT", `bank/reconciliation/${reconId}/:adjustment`, [{
    bankTransactions: [{ id: txnIds[1] }],  // -150 bank fee
    paymentType: { id: bankgebyrPT?.id },
    amount: 150,
    date: "2027-06-15",
    postingDate: "2027-06-15",
    description: "Bank fee adjustment",
  }]);
  console.log(`Result: ${JSON.stringify(adj1).slice(0, 500)}`);

  // Check if it created a match
  const matches1 = await api("GET", `bank/reconciliation/match?bankReconciliationId=${reconId}&count=100&fields=*`);
  console.log(`Matches after adj1: ${matches1.values?.length || 0}`);
  for (const m of (matches1.values || [])) {
    console.log(`  match ${m.id}: type=${m.type} txns=${m.transactions?.length} postings=${m.postings?.length}`);
  }

  // Check txn match state
  for (const txnId of txnIds) {
    const t = await api("GET", `bank/statement/transaction/${txnId}?fields=id,amountCurrency,matched,matchType`);
    console.log(`  txn ${txnId}: matched=${t.value?.matched} type=${t.value?.matchType}`);
  }

  // ============================================
  // TEST 2: :adjustment with existing postings (match to existing posting)
  // ============================================
  console.log("\n\n=== TEST 2: :adjustment with postings field ===\n");

  // Try matching the +5000 txn to the existing +5000 posting
  const adj2 = await api("PUT", `bank/reconciliation/${reconId}/:adjustment`, [{
    bankTransactions: [{ id: txnIds[0] }],  // +5000
    postings: [{ id: posting5000?.id }],
    amount: 5000,
    date: "2027-06-05",
    postingDate: "2027-06-05",
    description: "Match payment A",
  }]);
  console.log(`Result: ${JSON.stringify(adj2).slice(0, 500)}`);

  // Check matches
  const matches2 = await api("GET", `bank/reconciliation/match?bankReconciliationId=${reconId}&count=100&fields=*`);
  console.log(`Matches after adj2: ${matches2.values?.length || 0}`);
  for (const m of (matches2.values || [])) {
    console.log(`  match ${m.id}: type=${m.type} txns=${(m.transactions||[]).map((t:any)=>`${t.id}(${t.amountCurrency})`)} postings=${(m.postings||[]).map((p:any)=>`${p.id}(${p.amount})`)}`);
  }

  // ============================================
  // TEST 3: :adjustment with interimAccount (create voucher + match)
  // ============================================
  console.log("\n\n=== TEST 3: :adjustment with interimAccount ===\n");

  // If the +5000 isn't matched yet, try with interimAccount
  const txnStatus = await api("GET", `bank/statement/transaction/${txnIds[0]}?fields=id,matched`);
  if (!txnStatus.value?.matched) {
    const adj3 = await api("PUT", `bank/reconciliation/${reconId}/:adjustment`, [{
      bankTransactions: [{ id: txnIds[0] }],
      interimAccount: { id: acctMap[2050] },
      amount: 5000,
      date: "2027-06-05",
      postingDate: "2027-06-05",
      description: "Create voucher + match for Payment A",
    }]);
    console.log(`Result: ${JSON.stringify(adj3).slice(0, 500)}`);
  } else {
    console.log("Txn already matched, skipping test 3");
  }

  // Final state
  console.log("\n\n=== FINAL STATE ===\n");
  const finalMatches = await api("GET", `bank/reconciliation/match?bankReconciliationId=${reconId}&count=100&fields=*`);
  console.log(`Total matches: ${finalMatches.values?.length || 0}`);
  for (const m of (finalMatches.values || [])) {
    console.log(`  match ${m.id}: type=${m.type}`);
    console.log(`    txns: [${(m.transactions||[]).map((t:any)=>`${t.id}(${t.amountCurrency})`).join(",")}]`);
    console.log(`    postings: [${(m.postings||[]).map((p:any)=>`${p.id}(${p.amount})`).join(",")}]`);
  }

  for (const txnId of txnIds) {
    const t = await api("GET", `bank/statement/transaction/${txnId}?fields=id,amountCurrency,matched,matchType`);
    console.log(`  txn ${txnId}: amount=${t.value?.amountCurrency} matched=${t.value?.matched} type=${t.value?.matchType}`);
  }

  // ============================================
  // TEST 4: Close with correct balance
  // ============================================
  console.log("\n\n=== TEST 4: CLOSE ===\n");

  // Calculate correct closing balance for 1920 in Jun 2027
  const allPostings = await api("GET", `ledger/posting?accountId=${acctMap[1920]}&dateFrom=2027-06-01&dateTo=2027-07-01&count=200&fields=id,amount`);
  let totalBalance = 0;
  for (const p of (allPostings.values || [])) totalBalance += p.amount;
  console.log(`1920 balance in Jun 2027: ${totalBalance} (from ${allPostings.values?.length} postings)`);

  // Get fresh recon
  const freshRecon = await api("GET", `bank/reconciliation/${reconId}?fields=*`);
  console.log(`Recon version: ${freshRecon.value?.version}`);

  // Try close with correct balance
  const closeRes = await api("PUT", `bank/reconciliation/${reconId}`, {
    id: reconId,
    version: freshRecon.value?.version,
    account: { id: acctMap[1920] },
    accountingPeriod: { id: period.id },
    type: "MANUAL",
    bankAccountClosingBalanceCurrency: totalBalance,
    isClosed: true,
  });
  console.log(`Close result: ${JSON.stringify(closeRes).slice(0, 300)}`);

  // ============================================
  // CLEANUP
  // ============================================
  console.log("\n\n=== CLEANUP ===\n");

  // Reopen if closed
  const reconCheck = await api("GET", `bank/reconciliation/${reconId}?fields=*`);
  if (reconCheck.value?.isClosed) {
    await api("PUT", `bank/reconciliation/${reconId}`, {
      id: reconId, version: reconCheck.value.version,
      account: { id: acctMap[1920] }, accountingPeriod: { id: period.id },
      type: "MANUAL", bankAccountClosingBalanceCurrency: 0, isClosed: false,
    });
  }

  // Delete matches
  const cleanMatches = await api("GET", `bank/reconciliation/match?bankReconciliationId=${reconId}&count=100&fields=id`);
  for (const m of (cleanMatches.values || [])) {
    await api("DELETE", `bank/reconciliation/match/${m.id}`);
  }
  await api("DELETE", `bank/reconciliation/${reconId}`);
  if (bsId) await api("DELETE", `bank/statement/${bsId}`);
  console.log("All cleaned up.");
}

main().catch(console.error);
