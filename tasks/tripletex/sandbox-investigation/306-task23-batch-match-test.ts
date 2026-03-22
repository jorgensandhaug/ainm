/**
 * 306-task23-batch-match-test.ts — Test MANY_TO_MANY matching to minimize match calls
 *
 * Hypothesis: We can group ALL customer txns+postings into ONE match,
 * and ALL combined-voucher txns+postings into ONE match,
 * reducing L matches → 2 matches.
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
  const logBody = method !== "GET" && body && !isForm ? ` body=${JSON.stringify(body).slice(0, 200)}...` : "";
  console.log(`${status} ${res.status} ${method} /${path.split("?")[0]}${logBody}`);
  if (!res.ok) console.error(`    ${(typeof json === "string" ? json : JSON.stringify(json)).slice(0, 400)}`);
  return json;
}

async function main() {
  console.log("=== 306: MANY_TO_MANY MATCHING TEST ===\n");

  // Accounts
  const accts = await api("GET", "ledger/account?number=1920,2050,2400,2600,7770,8050&fields=id,number");
  const acctMap: Record<number, number> = {};
  for (const a of (accts.values || [])) acctMap[a.number] = a.id;

  // Period: Aug 2027 (clean)
  const periods = await api("GET", "ledger/accountingPeriod?startFrom=2027-08-01&startTo=2027-09-01&count=1&fields=*");
  const period = periods.values?.[0];
  console.log(`Period: id=${period?.id} ${period?.start} → ${period?.end}\n`);

  // Create realistic postings on 1920:
  // - OB: +100000
  // - 3 customer payments: +5000, +3000, +7500 (= +15500)
  // - 2 supplier payments: -8000, -4500 (= -12500)
  // - bankgebyr: -250
  // - renteinntekter: +150
  // Net movement: +15500 - 12500 - 250 + 150 = +2900
  // Closing balance: 100000 + 2900 = 102900

  // Voucher 1: OB
  console.log("--- Creating OB voucher ---");
  const obRes = await api("POST", "ledger/voucher", {
    date: "2027-08-01",
    description: "Inngående balanse Aug 2027",
    postings: [
      { row: 1, date: "2027-08-01", description: "Inngående balanse", account: { id: acctMap[1920] },
        amount: 100000, amountCurrency: 100000, amountGross: 100000, amountGrossCurrency: 100000 },
      { row: 2, date: "2027-08-01", description: "Inngående balanse", account: { id: acctMap[2050] },
        amount: -100000, amountCurrency: -100000, amountGross: -100000, amountGrossCurrency: -100000 },
    ],
  });
  console.log(`OB voucher: id=${obRes?.value?.id}`);

  // Voucher 2: Customer payments (as if from pay endpoint)
  console.log("--- Creating customer payment postings ---");
  const cpRes = await api("POST", "ledger/voucher", {
    date: "2027-08-05",
    description: "Customer payments Aug 2027",
    postings: [
      { row: 1, date: "2027-08-05", description: "Betaling kunde A", account: { id: acctMap[1920] },
        amount: 5000, amountCurrency: 5000, amountGross: 5000, amountGrossCurrency: 5000 },
      { row: 2, date: "2027-08-05", description: "Betaling kunde A", account: { id: acctMap[2050] },
        amount: -5000, amountCurrency: -5000, amountGross: -5000, amountGrossCurrency: -5000 },
      { row: 3, date: "2027-08-10", description: "Betaling kunde B", account: { id: acctMap[1920] },
        amount: 3000, amountCurrency: 3000, amountGross: 3000, amountGrossCurrency: 3000 },
      { row: 4, date: "2027-08-10", description: "Betaling kunde B", account: { id: acctMap[2050] },
        amount: -3000, amountCurrency: -3000, amountGross: -3000, amountGrossCurrency: -3000 },
      { row: 5, date: "2027-08-15", description: "Betaling kunde C", account: { id: acctMap[1920] },
        amount: 7500, amountCurrency: 7500, amountGross: 7500, amountGrossCurrency: 7500 },
      { row: 6, date: "2027-08-15", description: "Betaling kunde C", account: { id: acctMap[2050] },
        amount: -7500, amountCurrency: -7500, amountGross: -7500, amountGrossCurrency: -7500 },
    ],
  });
  console.log(`Customer payment voucher: id=${cpRes?.value?.id}`);

  // Voucher 3: Supplier payments + non-invoice items (combined)
  console.log("--- Creating combined supplier+misc voucher ---");
  const combRes = await api("POST", "ledger/voucher", {
    date: "2027-08-12",
    description: "Combined supplier payments + misc Aug 2027",
    postings: [
      // Supplier A: -8000
      { row: 1, date: "2027-08-12", description: "Betaling Leverandør A", account: { id: acctMap[1920] },
        amount: -8000, amountCurrency: -8000, amountGross: -8000, amountGrossCurrency: -8000 },
      { row: 2, date: "2027-08-12", description: "Betaling Leverandør A", account: { id: acctMap[2400] },
        amount: 8000, amountCurrency: 8000, amountGross: 8000, amountGrossCurrency: 8000 },
      // Supplier B: -4500
      { row: 3, date: "2027-08-18", description: "Betaling Leverandør B", account: { id: acctMap[1920] },
        amount: -4500, amountCurrency: -4500, amountGross: -4500, amountGrossCurrency: -4500 },
      { row: 4, date: "2027-08-18", description: "Betaling Leverandør B", account: { id: acctMap[2400] },
        amount: 4500, amountCurrency: 4500, amountGross: 4500, amountGrossCurrency: 4500 },
      // Bankgebyr: -250
      { row: 5, date: "2027-08-20", description: "Bankgebyr", account: { id: acctMap[1920] },
        amount: -250, amountCurrency: -250, amountGross: -250, amountGrossCurrency: -250 },
      { row: 6, date: "2027-08-20", description: "Bankgebyr", account: { id: acctMap[7770] },
        amount: 250, amountCurrency: 250, amountGross: 250, amountGrossCurrency: 250 },
      // Renteinntekter: +150
      { row: 7, date: "2027-08-25", description: "Renteinntekter", account: { id: acctMap[1920] },
        amount: 150, amountCurrency: 150, amountGross: 150, amountGrossCurrency: 150 },
      { row: 8, date: "2027-08-25", description: "Renteinntekter", account: { id: acctMap[8050] },
        amount: -150, amountCurrency: -150, amountGross: -150, amountGrossCurrency: -150 },
    ],
  });
  console.log(`Combined voucher: id=${combRes?.value?.id}`);

  // Import bank statement
  console.log("\n--- Importing bank statement ---");
  const csv = [
    '"Inngående saldo 01.08.2027";"100000,00"',
    '"Utgående saldo 31.08.2027";"102900,00"',
    '"Bokført";"Rentedato";"Beskrivelse";"Beløp"',
    '"05.08.2027";"05.08.2027";"Betaling kunde A";"5000,00"',
    '"10.08.2027";"10.08.2027";"Betaling kunde B";"3000,00"',
    '"12.08.2027";"12.08.2027";"Betaling Leverandør A";"-8000,00"',
    '"15.08.2027";"15.08.2027";"Betaling kunde C";"7500,00"',
    '"18.08.2027";"18.08.2027";"Betaling Leverandør B";"-4500,00"',
    '"20.08.2027";"20.08.2027";"Bankgebyr";"-250,00"',
    '"25.08.2027";"25.08.2027";"Renteinntekter";"150,00"',
  ].join("\n") + "\n";
  const formData = new FormData();
  formData.append("file", new Blob([csv], { type: "text/csv" }), "bankstatement.csv");
  const importRes = await api("POST",
    `bank/statement/import?bankId=112&accountId=${acctMap[1920]}&fromDate=2027-08-01&toDate=2027-09-01&fileFormat=SBANKEN_BEDRIFT_CSV`,
    formData, true
  );
  const bsId = importRes?.value?.id;
  const txnIdsRaw = (importRes?.value?.transactions || []).map((t: any) => t.id);
  console.log(`Bank statement: id=${bsId}, txns=[${txnIdsRaw.join(",")}]`);

  // GET each txn to know amounts
  type TxnInfo = { id: number; amount: number; desc: string };
  const txns: TxnInfo[] = [];
  for (const txnId of txnIdsRaw) {
    const t = await api("GET", `bank/statement/transaction/${txnId}?fields=id,amountCurrency,description`);
    txns.push({ id: t.value.id, amount: t.value.amountCurrency, desc: t.value.description });
    console.log(`  txn ${t.value.id}: amount=${t.value.amountCurrency} desc="${t.value.description}"`);
  }

  // GET postings on 1920 for Aug
  const postingsRes = await api("GET", `ledger/posting?accountId=${acctMap[1920]}&dateFrom=2027-08-01&dateTo=2027-09-01&count=200&fields=id,date,amount,description`);
  const postings = postingsRes.values || [];
  console.log(`\n1920 postings (Aug 2027): ${postings.length}`);
  for (const p of postings) {
    console.log(`  ${p.id}: date=${p.date} amount=${p.amount} desc="${p.description}"`);
  }

  // Build lookup
  const postingsByDesc = new Map<string, any[]>();
  for (const p of postings) {
    const key = p.description;
    if (!postingsByDesc.has(key)) postingsByDesc.set(key, []);
    postingsByDesc.get(key)!.push(p);
  }

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

  // ============================================
  // TEST A: Individual 1:1 matches (baseline)
  // ============================================
  console.log("\n\n=== TEST A: 1:1 MATCHES (baseline) ===\n");

  // Match each txn to its corresponding posting
  const matchPairs: Array<{ txn: TxnInfo; posting: any }> = [];
  for (const txn of txns) {
    // Find matching posting by description and amount
    const candidates = postingsByDesc.get(txn.desc) || [];
    const match = candidates.find((p: any) => p.amount === txn.amount);
    if (match) {
      matchPairs.push({ txn, posting: match });
    } else {
      console.log(`  NO MATCH for txn ${txn.id} (${txn.amount} "${txn.desc}")`);
      // Try by amount only
      const amtMatch = postings.find((p: any) => p.amount === txn.amount && !matchPairs.some(mp => mp.posting.id === p.id));
      if (amtMatch) {
        matchPairs.push({ txn, posting: amtMatch });
        console.log(`    Found by amount: posting ${amtMatch.id}`);
      }
    }
  }

  let matchCount = 0;
  for (const { txn, posting } of matchPairs) {
    const matchRes = await api("POST", "bank/reconciliation/match", {
      bankReconciliation: { id: reconId },
      transactions: [{ id: txn.id }],
      postings: [{ id: posting.id }],
    });
    matchCount++;
    if (matchRes?.value?.type) {
      console.log(`  Match #${matchCount}: txn ${txn.id}(${txn.amount}) → posting ${posting.id}(${posting.amount}) = ${matchRes.value.type}`);
    }
  }
  console.log(`\nCreated ${matchCount} individual matches (1:1)`);

  // Verify all matched
  for (const txn of txns) {
    const t = await api("GET", `bank/statement/transaction/${txn.id}?fields=id,matched,matchType`);
    console.log(`  txn ${txn.id}: matched=${t.value?.matched} type=${t.value?.matchType}`);
  }

  // Clean for next test
  const allMatches = await api("GET", `bank/reconciliation/match?bankReconciliationId=${reconId}&count=100&fields=id`);
  console.log(`\nCleaning ${allMatches.values?.length} matches...`);
  for (const m of (allMatches.values || [])) await api("DELETE", `bank/reconciliation/match/${m.id}`);

  // ============================================
  // TEST B: MANY_TO_MANY — all txns+postings in ONE match
  // ============================================
  console.log("\n\n=== TEST B: ALL IN ONE MATCH (MANY_TO_MANY) ===\n");

  const allTxnIds = matchPairs.map(mp => ({ id: mp.txn.id }));
  const allPostingIds = matchPairs.map(mp => ({ id: mp.posting.id }));
  console.log(`Trying: ${allTxnIds.length} txns + ${allPostingIds.length} postings in 1 match`);

  const manyRes = await api("POST", "bank/reconciliation/match", {
    bankReconciliation: { id: reconId },
    transactions: allTxnIds,
    postings: allPostingIds,
  });
  console.log(`Result: type=${manyRes?.value?.type}`);

  // Verify
  for (const txn of txns) {
    const t = await api("GET", `bank/statement/transaction/${txn.id}?fields=id,matched,matchType`);
    console.log(`  txn ${txn.id}: matched=${t.value?.matched} type=${t.value?.matchType}`);
  }

  // Clean for next test
  const allMatches2 = await api("GET", `bank/reconciliation/match?bankReconciliationId=${reconId}&count=100&fields=id`);
  for (const m of (allMatches2.values || [])) await api("DELETE", `bank/reconciliation/match/${m.id}`);

  // ============================================
  // TEST C: TWO MANY_TO_MANY matches (by category)
  // ============================================
  console.log("\n\n=== TEST C: TWO CATEGORY MATCHES ===\n");

  // Group 1: Customer payments (positive amounts, including OB)
  // Group 2: Supplier + misc (negative amounts + renteinntekter)
  const group1Pairs = matchPairs.filter(mp => mp.txn.amount > 0);
  const group2Pairs = matchPairs.filter(mp => mp.txn.amount <= 0);

  // Also add renteinntekter to group1 since it's positive
  // Actually let's just split into positive and negative
  console.log(`Group 1 (positive): ${group1Pairs.length} pairs`);
  console.log(`Group 2 (negative): ${group2Pairs.length} pairs`);

  if (group1Pairs.length > 0) {
    const g1Res = await api("POST", "bank/reconciliation/match", {
      bankReconciliation: { id: reconId },
      transactions: group1Pairs.map(mp => ({ id: mp.txn.id })),
      postings: group1Pairs.map(mp => ({ id: mp.posting.id })),
    });
    console.log(`Group 1 match: type=${g1Res?.value?.type}`);
  }
  if (group2Pairs.length > 0) {
    const g2Res = await api("POST", "bank/reconciliation/match", {
      bankReconciliation: { id: reconId },
      transactions: group2Pairs.map(mp => ({ id: mp.txn.id })),
      postings: group2Pairs.map(mp => ({ id: mp.posting.id })),
    });
    console.log(`Group 2 match: type=${g2Res?.value?.type}`);
  }

  // Verify
  for (const txn of txns) {
    const t = await api("GET", `bank/statement/transaction/${txn.id}?fields=id,matched,matchType`);
    console.log(`  txn ${txn.id}: matched=${t.value?.matched} type=${t.value?.matchType}`);
  }

  // Try closing
  console.log("\n--- Attempting close ---");
  // Calculate correct closing balance (all postings on 1920 up to Aug end)
  const balPostings = await api("GET", `ledger/posting?accountId=${acctMap[1920]}&dateTo=2027-09-01&count=500&fields=id,amount`);
  let cumBalance = 0;
  for (const p of (balPostings.values || [])) cumBalance += p.amount;
  console.log(`Cumulative 1920 balance up to Aug end: ${cumBalance} (from ${balPostings.values?.length} postings)`);

  const freshRecon = await api("GET", `bank/reconciliation/${reconId}?fields=*`);
  console.log(`Recon version: ${freshRecon.value?.version}`);

  const closeRes = await api("PUT", `bank/reconciliation/${reconId}`, {
    id: reconId,
    version: freshRecon.value?.version,
    account: { id: acctMap[1920] },
    accountingPeriod: { id: period.id },
    type: "MANUAL",
    bankAccountClosingBalanceCurrency: cumBalance,
    isClosed: true,
  });
  const closed = closeRes?.value?.isClosed;
  console.log(`Close result: isClosed=${closed}`);

  // ============================================
  // CLEANUP
  // ============================================
  console.log("\n\n=== CLEANUP ===");
  const reconCheck = await api("GET", `bank/reconciliation/${reconId}?fields=*`);
  if (reconCheck.value?.isClosed) {
    await api("PUT", `bank/reconciliation/${reconId}`, {
      id: reconId, version: reconCheck.value.version,
      account: { id: acctMap[1920] }, accountingPeriod: { id: period.id },
      type: "MANUAL", bankAccountClosingBalanceCurrency: 0, isClosed: false,
    });
  }
  const cleanMatches = await api("GET", `bank/reconciliation/match?bankReconciliationId=${reconId}&count=100&fields=id`);
  for (const m of (cleanMatches.values || [])) await api("DELETE", `bank/reconciliation/match/${m.id}`);
  await api("DELETE", `bank/reconciliation/${reconId}`);
  if (bsId) await api("DELETE", `bank/statement/${bsId}`);
  console.log("All cleaned up.");
}

main().catch(console.error);
