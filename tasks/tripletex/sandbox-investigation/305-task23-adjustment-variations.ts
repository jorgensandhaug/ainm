/**
 * 305-task23-adjustment-variations.ts — Try many body variations for :adjustment
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
  const status = res.ok ? "OK " : "ERR";
  console.log(`${status} ${res.status} ${method} /${path.split("?")[0]}`);
  if (!res.ok) {
    const errText = typeof json === "string" ? json.slice(0, 500) : JSON.stringify(json).slice(0, 500);
    console.error(`    ${errText}`);
  }
  return json;
}

async function main() {
  console.log("=== 305: :adjustment BODY VARIATIONS ===\n");

  const accts = await api("GET", "ledger/account?number=1920,2050,7770,8050&fields=id,number");
  const acctMap: Record<number, number> = {};
  for (const a of (accts.values || [])) acctMap[a.number] = a.id;

  const periods = await api("GET", "ledger/accountingPeriod?startFrom=2027-06-01&startTo=2027-07-01&count=1&fields=*");
  const period = periods.values?.[0];

  // Import bank statement
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
  console.log(`Bank statement: id=${bsId}, txns=[${txnIds.join(",")}]`);

  // Get full txn objects
  const txnFull = await api("GET", `bank/statement/transaction/${txnIds[0]}?fields=*`);
  console.log(`\nTxn 0 full:`, JSON.stringify(txnFull.value).slice(0, 500));

  // Create recon
  const reconRes = await api("POST", "bank/reconciliation", {
    account: { id: acctMap[1920] },
    accountingPeriod: { id: period.id },
    type: "MANUAL",
    bankAccountClosingBalanceCurrency: 0,
    isClosed: false,
  });
  const reconId = reconRes?.value?.id;
  console.log(`\nRecon: id=${reconId}`);

  const ptRes = await api("GET", "bank/reconciliation/paymentType?count=100&fields=*");
  const bankgebyr = ptRes.values?.find((pt: any) => pt.description === "Bankgebyr");
  console.log(`Bankgebyr PT: id=${bankgebyr?.id}`);

  // ============================================
  // VARIATION 1: amount only, no bankTransactions
  // ============================================
  console.log("\n--- VAR 1: amount only (no bankTransactions) ---");
  const v1 = await api("PUT", `bank/reconciliation/${reconId}/:adjustment`, [{
    paymentType: { id: bankgebyr.id },
    amount: 150,
    date: "2027-06-15",
    postingDate: "2027-06-15",
    description: "Fee adjustment",
  }]);
  console.log(`  Result: ${JSON.stringify(v1).slice(0, 300)}`);

  // Check matches after v1
  const m1 = await api("GET", `bank/reconciliation/match?bankReconciliationId=${reconId}&count=100&fields=*`);
  console.log(`  Matches: ${m1.values?.length || 0}`);
  if (m1.values?.length > 0) {
    for (const m of m1.values) {
      console.log(`    match ${m.id}: type=${m.type} txns=${m.transactions?.length} postings=${m.postings?.length}`);
      for (const t of (m.transactions || [])) console.log(`      txn ${t.id}: ${t.amountCurrency}`);
      for (const p of (m.postings || [])) console.log(`      posting ${p.id}: ${p.amount}`);
    }
  }

  // Clean matches for next test
  for (const m of (m1.values || [])) await api("DELETE", `bank/reconciliation/match/${m.id}`);

  // ============================================
  // VARIATION 2: bankTransactions with full object
  // ============================================
  console.log("\n--- VAR 2: bankTransactions with amountCurrency ---");
  const v2 = await api("PUT", `bank/reconciliation/${reconId}/:adjustment`, [{
    bankTransactions: [{ id: txnIds[1], amountCurrency: -150 }],
    paymentType: { id: bankgebyr.id },
    amount: 150,
    date: "2027-06-15",
    postingDate: "2027-06-15",
    description: "Fee with full txn",
  }]);
  console.log(`  Result: ${JSON.stringify(v2).slice(0, 300)}`);
  const m2 = await api("GET", `bank/reconciliation/match?bankReconciliationId=${reconId}&count=100&fields=*`);
  console.log(`  Matches: ${m2.values?.length || 0}`);
  for (const m of (m2.values || [])) await api("DELETE", `bank/reconciliation/match/${m.id}`);

  // ============================================
  // VARIATION 3: interimAccount only, no paymentType
  // ============================================
  console.log("\n--- VAR 3: interimAccount, no paymentType ---");
  const v3 = await api("PUT", `bank/reconciliation/${reconId}/:adjustment`, [{
    amount: 5000,
    date: "2027-06-05",
    postingDate: "2027-06-05",
    description: "Payment A via interimAccount",
    interimAccount: { id: acctMap[2050] },
  }]);
  console.log(`  Result: ${JSON.stringify(v3).slice(0, 300)}`);
  const m3 = await api("GET", `bank/reconciliation/match?bankReconciliationId=${reconId}&count=100&fields=*`);
  console.log(`  Matches: ${m3.values?.length || 0}`);
  for (const m of (m3.values || [])) {
    console.log(`    match ${m.id}: type=${m.type}`);
    for (const t of (m.transactions || [])) console.log(`      txn ${t.id}: ${t.amountCurrency}`);
    for (const p of (m.postings || [])) console.log(`      posting ${p.id}: ${p.amount}`);
    await api("DELETE", `bank/reconciliation/match/${m.id}`);
  }

  // ============================================
  // VARIATION 4: multiple adjustments in one array
  // ============================================
  console.log("\n--- VAR 4: multiple adjustments in one call ---");
  const v4 = await api("PUT", `bank/reconciliation/${reconId}/:adjustment`, [
    {
      amount: 5000,
      date: "2027-06-05",
      postingDate: "2027-06-05",
      description: "Payment A",
      interimAccount: { id: acctMap[2050] },
    },
    {
      paymentType: { id: bankgebyr.id },
      amount: 150,
      date: "2027-06-15",
      postingDate: "2027-06-15",
      description: "Bank fee",
    },
  ]);
  console.log(`  Result: ${JSON.stringify(v4).slice(0, 500)}`);
  const m4 = await api("GET", `bank/reconciliation/match?bankReconciliationId=${reconId}&count=100&fields=*`);
  console.log(`  Matches: ${m4.values?.length || 0}`);
  for (const m of (m4.values || [])) {
    console.log(`    match ${m.id}: type=${m.type}`);
    for (const t of (m.transactions || [])) console.log(`      txn ${t.id}: ${t.amountCurrency}`);
    for (const p of (m.postings || [])) console.log(`      posting ${p.id}: ${p.amount} desc="${p.description}"`);
  }

  // Check txn status
  for (const txnId of txnIds) {
    const t = await api("GET", `bank/statement/transaction/${txnId}?fields=id,amountCurrency,matched,matchType`);
    console.log(`  txn ${txnId}: amount=${t.value?.amountCurrency} matched=${t.value?.matched} type=${t.value?.matchType}`);
  }

  // ============================================
  // CLEANUP
  // ============================================
  console.log("\n\n=== CLEANUP ===");
  const allMatches = await api("GET", `bank/reconciliation/match?bankReconciliationId=${reconId}&count=100&fields=id`);
  for (const m of (allMatches.values || [])) await api("DELETE", `bank/reconciliation/match/${m.id}`);
  await api("DELETE", `bank/reconciliation/${reconId}`);
  if (bsId) await api("DELETE", `bank/statement/${bsId}`);
  console.log("Done.");
}

main().catch(console.error);
