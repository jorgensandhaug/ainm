/**
 * 83-task23-bank-recon-clean.ts — Clean bank reconciliation test
 *
 * Issues from previous run:
 * 1. March period already has closed reconciliation — can't post to 1920
 * 2. Bank statement import failed due to missing Norwegian chars (å, ø)
 *
 * Strategy:
 * - Find a period WITHOUT existing reconciliation
 * - Use proper Norwegian characters in CSV headers
 * - Test the full flow: opening balance → vouchers → bank import → matching → close recon
 */

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + Buffer.from("0:" + TOKEN).toString("base64");

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}/${path}`;
  const headers: Record<string, string> = { Authorization: AUTH };
  if (body && !(body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }
  const opts: RequestInit = { method, headers };
  if (body) opts.body = body instanceof FormData ? body : JSON.stringify(body);
  console.log(`\n>>> ${method} ${path}`);
  if (body && !(body instanceof FormData)) console.log("Body:", JSON.stringify(body, null, 2).slice(0, 800));
  const res = await fetch(url, opts);
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`<<< ${res.status} ${res.statusText}`);
  if (typeof json === "object") {
    const s = JSON.stringify(json, null, 2);
    console.log(s.length > 3000 ? s.slice(0, 3000) + "\n...(truncated)" : s);
  } else console.log(json);
  return { status: res.status, data: json };
}

async function main() {
  // ============================================================
  // STEP 1: Find all existing reconciliations and their periods
  // ============================================================
  console.log("=== Step 1: Find existing reconciliations ===");
  const reconRes = await api("GET", "bank/reconciliation?count=100&fields=id,isClosed,accountingPeriod(id,start,end),bankAccountClosingBalanceCurrency");
  const recons = reconRes.data?.values || [];
  const reconPeriodIds = new Set(recons.map((r: any) => r.accountingPeriod?.id));
  console.log("Reconciled period IDs:", [...reconPeriodIds]);

  // Get all accounting periods
  const allPeriodsRes = await api("GET", "ledger/accountingPeriod?count=20&fields=*");
  const allPeriods = allPeriodsRes.data?.values || [];
  console.log("\nAll periods:");
  for (const p of allPeriods) {
    const hasRecon = reconPeriodIds.has(p.id);
    console.log(`  Period ${p.id}: ${p.start} - ${p.end} (${p.name}) ${hasRecon ? "HAS RECON" : "FREE"}`);
  }

  // Find a free period (one without existing reconciliation)
  const freePeriod = allPeriods.find((p: any) => !reconPeriodIds.has(p.id) && !p.isClosed);
  if (!freePeriod) {
    console.error("No free period available! Let's try to DELETE the open recon on recon 12705486");
    // Try to find and delete the open reconciliation
    const openRecon = recons.find((r: any) => !r.isClosed);
    if (openRecon) {
      console.log("Deleting open recon:", openRecon.id);
      const delRes = await api("DELETE", `bank/reconciliation/${openRecon.id}`);
      console.log("Delete result:", delRes.status);
    }
  }

  // Get account IDs
  const acctRes = await api("GET", "ledger/account?number=1920,2050,2400,2600,7770,8050&fields=id,number,name");
  const accounts = acctRes.data?.values || [];
  const acctMap: Record<number, number> = {};
  for (const a of accounts) acctMap[a.number] = a.id;
  console.log("\nAccounts:", acctMap);

  // ============================================================
  // STEP 2: Check the existing successful bank import (statement 123943126, bankId=112)
  // ============================================================
  console.log("\n=== Step 2: Examine existing successful bank statement import ===");
  const stmt126 = await api("GET", "bank/statement/123943126?fields=*");

  // Get its transactions
  const stmtTxnRes = await api("GET", "bank/statement/transaction?bankStatementId=123943126&count=100&fields=*");
  const stmtTxns = stmtTxnRes.data?.values || [];
  console.log("Statement 123943126 transactions:", stmtTxns.length);
  for (const t of stmtTxns) {
    console.log(`  Txn ${t.id}: date=${t.date}, amount=${t.amountCurrency}, desc=${t.description}, matched=${t.matched}, matchType=${t.matchType}`);
  }

  // ============================================================
  // STEP 3: Try bank statement import with proper Norwegian chars
  // ============================================================
  console.log("\n=== Step 3: Test bank statement import with Norwegian chars ===");

  // Use a period that has NO reconciliation yet
  // Use November 2026 (period likely doesn't exist yet or is free)
  const novPeriodRes = await api("GET", "ledger/accountingPeriod?startFrom=2026-11-01&startTo=2026-11-02&count=1&fields=*");
  const novPeriods = novPeriodRes.data?.values || [];
  console.log("November period:", novPeriods.length > 0 ? novPeriods[0].id : "NOT FOUND");

  // Construct SBANKEN_BEDRIFT_CSV with proper Norwegian chars
  const sbankenCsv = [
    '"Inngående saldo 02.11.2026";"100000,00"',
    '"Utgående saldo 25.11.2026";"105850,00"',
    '"Bokført";"Rentedato";"Beskrivelse";"Beløp"',
    '"02.11.2026";"02.11.2026";"Innbetaling fra Test AS / Faktura 1";"5000,00"',
    '"05.11.2026";"05.11.2026";"Innbetaling fra Test2 AS / Faktura 2";"3000,00"',
    '"10.11.2026";"10.11.2026";"Betaling Supplier Test Leverandor AS";"-2000,00"',
    '"15.11.2026";"15.11.2026";"Bankgebyr";"-150,00"',
  ].join("\n") + "\n";

  console.log("CSV content:\n" + sbankenCsv);

  const formData = new FormData();
  formData.append("file", new Blob([sbankenCsv], { type: "text/csv" }), "bankstatement.csv");

  const importRes = await api("POST",
    `bank/statement/import?bankId=112&accountId=${acctMap[1920]}&fromDate=2026-11-02&toDate=2026-11-16&fileFormat=SBANKEN_BEDRIFT_CSV`,
    formData
  );

  let bankStatementId: number | null = null;
  let bankTransactions: any[] = [];

  if (importRes.status < 400) {
    bankStatementId = importRes.data?.value?.id;
    bankTransactions = importRes.data?.value?.transactions || [];
    console.log("SUCCESS! Bank statement ID:", bankStatementId);
    console.log("Transactions created:", bankTransactions.length);
    for (const t of bankTransactions) {
      console.log(`  Txn ${t.id}: date=${t.date}, amount=${t.amountCurrency}, desc=${t.description}`);
    }
  } else {
    console.log("Import FAILED. Trying to see what the successful import used...");
  }

  // ============================================================
  // STEP 4: Post opening balance + transactions for November
  // ============================================================
  if (novPeriods.length > 0) {
    const novPeriod = novPeriods[0];

    // Check if Nov period has a reconciliation
    const novRecon = recons.find((r: any) => r.accountingPeriod?.id === novPeriod.id);
    if (novRecon) {
      console.log("November already has recon:", novRecon.id, "isClosed:", novRecon.isClosed);
      if (!novRecon.isClosed) {
        // We can work with it
      }
    }

    // Try posting opening balance for November
    console.log("\n=== Step 4: Post opening balance for November ===");
    const obRes = await api("POST", "ledger/voucher", {
      date: "2026-11-02",
      description: "Inngaende balanse",
      postings: [
        {
          row: 1, date: "2026-11-02", description: "Inngaende balanse",
          account: { id: acctMap[1920] },
          amount: 100000, amountCurrency: 100000, amountGross: 100000, amountGrossCurrency: 100000,
          currency: { id: 1 },
        },
        {
          row: 2, date: "2026-11-02", description: "Inngaende balanse",
          account: { id: acctMap[2050] },
          amount: -100000, amountCurrency: -100000, amountGross: -100000, amountGrossCurrency: -100000,
          currency: { id: 1 },
        },
      ],
    });
    console.log("Opening balance:", obRes.status);

    if (obRes.status < 400) {
      // Post test transactions
      console.log("\n=== Step 4b: Post test transactions ===");
      const txnRes = await api("POST", "ledger/voucher", {
        date: "2026-11-02",
        description: "Test bank transactions",
        postings: [
          // Payment 1: DR 1920, CR 2050
          { row: 1, date: "2026-11-02", description: "Innbetaling fra Test AS",
            account: { id: acctMap[1920] }, amount: 5000, amountCurrency: 5000, amountGross: 5000, amountGrossCurrency: 5000 },
          { row: 2, date: "2026-11-02", description: "Innbetaling fra Test AS",
            account: { id: acctMap[2050] }, amount: -5000, amountCurrency: -5000, amountGross: -5000, amountGrossCurrency: -5000 },
          // Payment 2: DR 1920, CR 2050
          { row: 3, date: "2026-11-05", description: "Innbetaling fra Test2 AS",
            account: { id: acctMap[1920] }, amount: 3000, amountCurrency: 3000, amountGross: 3000, amountGrossCurrency: 3000 },
          { row: 4, date: "2026-11-05", description: "Innbetaling fra Test2 AS",
            account: { id: acctMap[2050] }, amount: -3000, amountCurrency: -3000, amountGross: -3000, amountGrossCurrency: -3000 },
          // Supplier payment: DR 2400, CR 1920
          { row: 5, date: "2026-11-10", description: "Betaling Supplier Test Leverandor AS",
            account: { id: acctMap[2400] }, amount: 2000, amountCurrency: 2000, amountGross: 2000, amountGrossCurrency: 2000 },
          { row: 6, date: "2026-11-10", description: "Betaling Supplier Test Leverandor AS",
            account: { id: acctMap[1920] }, amount: -2000, amountCurrency: -2000, amountGross: -2000, amountGrossCurrency: -2000 },
          // Bankgebyr: DR 7770, CR 1920
          { row: 7, date: "2026-11-15", description: "Bankgebyr",
            account: { id: acctMap[7770] }, amount: 150, amountCurrency: 150, amountGross: 150, amountGrossCurrency: 150 },
          { row: 8, date: "2026-11-15", description: "Bankgebyr",
            account: { id: acctMap[1920] }, amount: -150, amountCurrency: -150, amountGross: -150, amountGrossCurrency: -150 },
        ],
      });
      console.log("Transactions:", txnRes.status);

      // Verify balance
      console.log("\n=== Step 4c: Verify balance ===");
      const bsRes = await api("GET", "balanceSheet?dateFrom=2026-11-01&dateTo=2026-12-01&accountNumberFrom=1920&accountNumberTo=1920&count=1&fields=*");
      const balance = bsRes.data?.values?.[0]?.balanceOut;
      console.log("Account 1920 balance for Nov:", balance);
      // Expected: previous balance + 100000 + 5000 + 3000 - 2000 - 150 = previous + 105850

      // ============================================================
      // STEP 5: Get postings on 1920 for November for matching
      // ============================================================
      console.log("\n=== Step 5: Get November postings on 1920 ===");
      const postingsRes = await api("GET", `ledger/posting?accountId=${acctMap[1920]}&dateFrom=2026-11-01&dateTo=2026-11-30&count=100&fields=*`);
      const novPostings = postingsRes.data?.values || [];
      console.log("November 1920 postings:", novPostings.length);
      for (const p of novPostings) {
        console.log(`  Posting ${p.id}: date=${p.date}, amount=${p.amount}, desc=${p.description?.slice(0, 60)}`);
      }

      // ============================================================
      // STEP 6: Try creating matches if we have bank transactions
      // ============================================================
      if (bankTransactions.length > 0) {
        // First, find/get the November reconciliation
        const reconListRes = await api("GET", "bank/reconciliation?count=100&fields=id,isClosed,accountingPeriod(id,start)");
        const reconList = reconListRes.data?.values || [];
        const novRecon = reconList.find((r: any) => r.accountingPeriod?.id === novPeriod.id);

        if (novRecon) {
          console.log("\n=== Step 6: Match bank transactions to postings ===");
          console.log("November reconciliation:", novRecon.id, "isClosed:", novRecon.isClosed);

          // Try :suggest first
          console.log("\n--- 6a: Try auto-suggest ---");
          const suggestRes = await api("PUT", `bank/reconciliation/${novRecon.id}/:suggest`);
          console.log("Suggest result:", suggestRes.status);

          // Check what matches were created
          const matchesRes = await api("GET", `bank/reconciliation/match?bankReconciliationId=${novRecon.id}&count=100&fields=*`);
          const matches = matchesRes.data?.values || [];
          console.log("Matches after suggest:", matches.length);

          // If no auto-matches, try manual matching
          if (matches.length === 0 && novPostings.length > 0) {
            console.log("\n--- 6b: Try manual matching ---");

            // Match each bank transaction to corresponding posting
            for (let i = 0; i < Math.min(bankTransactions.length, novPostings.length); i++) {
              const txn = bankTransactions[i];
              // Find posting with matching amount
              const matchingPosting = novPostings.find((p: any) =>
                Math.abs(p.amount - (txn.amountCurrency || txn.amount)) < 0.01
              );

              if (matchingPosting) {
                console.log(`\nMatching txn ${txn.id} (${txn.amountCurrency}) -> posting ${matchingPosting.id} (${matchingPosting.amount})`);
                const matchRes = await api("POST", "bank/reconciliation/match", {
                  bankReconciliation: { id: novRecon.id },
                  transactions: [{ id: txn.id }],
                  postings: [{ id: matchingPosting.id }],
                });
                console.log("Match result:", matchRes.status);
              }
            }
          }

          // ============================================================
          // STEP 7: Close the reconciliation
          // ============================================================
          console.log("\n=== Step 7: Close reconciliation ===");

          // Get fresh reconciliation state
          const freshRecon = await api("GET", `bank/reconciliation/${novRecon.id}?fields=*`);
          const version = freshRecon.data?.value?.version;

          // Closing balance = the known balance from our test data
          // Since we're adding to existing sandbox balance, use actual balance
          const closingBalance = balance; // use actual balance sheet value
          console.log("Using closing balance:", closingBalance);

          const closeRes = await api("PUT", `bank/reconciliation/${novRecon.id}`, {
            id: novRecon.id,
            version: version,
            account: { id: acctMap[1920] },
            accountingPeriod: { id: novPeriod.id },
            type: "MANUAL",
            bankAccountClosingBalanceCurrency: Math.round((closingBalance || 0) * 100) / 100,
            isClosed: true,
          });
          console.log("Close result:", closeRes.status);

          // Final check on matches
          const finalMatchRes = await api("GET", `bank/reconciliation/match?bankReconciliationId=${novRecon.id}&count=100&fields=*`);
          console.log("Final matches for Nov recon:", finalMatchRes.data?.values?.length || 0);

          // Check the reconciliation's transactions field
          const finalRecon = await api("GET", `bank/reconciliation/${novRecon.id}?fields=*`);
          console.log("Final recon transactions:", finalRecon.data?.value?.transactions?.length || 0);
        }
      } else {
        console.log("\nNo bank transactions from import. Investigating why import failed...");
      }

      // ============================================================
      // STEP 8: Try an alternative import — examine what format the successful import used
      // ============================================================
      if (bankStatementId === null) {
        console.log("\n=== Step 8: Investigate the successful import format ===");

        // Try to see what bank/statement/123943126 looks like in detail
        const stmtDetail = await api("GET", "bank/statement/123943126?fields=*");

        // Also try fetching the transactions with full detail
        const txn1Detail = await api("GET", "bank/statement/transaction/189465786?fields=*");

        // Try the import with proper encoding (UTF-8 BOM)
        console.log("\n--- Try import with UTF-8 BOM ---");
        const bom = "\ufeff";
        const csvWithBom = bom + [
          '"Inng\u00e5ende saldo 02.11.2026";"100000,00"',
          '"Utg\u00e5ende saldo 25.11.2026";"105850,00"',
          '"Bokf\u00f8rt";"Rentedato";"Beskrivelse";"Bel\u00f8p"',
          '"02.11.2026";"02.11.2026";"Innbetaling fra Test AS / Faktura 1";"5000,00"',
          '"05.11.2026";"05.11.2026";"Innbetaling fra Test2 AS / Faktura 2";"3000,00"',
          '"10.11.2026";"10.11.2026";"Betaling Supplier Test Leverandor AS";"-2000,00"',
          '"15.11.2026";"15.11.2026";"Bankgebyr";"-150,00"',
        ].join("\n") + "\n";

        const formData2 = new FormData();
        formData2.append("file", new Blob([csvWithBom], { type: "text/csv;charset=utf-8" }), "bankstatement.csv");

        const import2 = await api("POST",
          `bank/statement/import?bankId=112&accountId=${acctMap[1920]}&fromDate=2026-11-02&toDate=2026-11-16&fileFormat=SBANKEN_BEDRIFT_CSV`,
          formData2
        );

        if (import2.status < 400) {
          bankStatementId = import2.data?.value?.id;
          bankTransactions = import2.data?.value?.transactions || [];
          console.log("SUCCESS with BOM! Statement ID:", bankStatementId);
          console.log("Transactions:", bankTransactions.length);
          for (const t of bankTransactions) {
            console.log(`  Txn ${t.id}: date=${t.date}, amount=${t.amountCurrency}, desc=${t.description}`);
          }
        }
      }

      // ============================================================
      // STEP 9: Test :suggest on the reconciliation with the new statement
      // ============================================================
      if (bankStatementId && novPeriods.length > 0) {
        console.log("\n=== Step 9: Test suggest with real bank statement ===");
        const reconListRes = await api("GET", "bank/reconciliation?count=100&fields=id,isClosed,accountingPeriod(id,start)");
        const reconList = reconListRes.data?.values || [];
        const novRecon = reconList.find((r: any) => r.accountingPeriod?.id === novPeriods[0].id);

        if (novRecon && !novRecon.isClosed) {
          console.log("Trying suggest on recon:", novRecon.id);
          const suggestRes = await api("PUT", `bank/reconciliation/${novRecon.id}/:suggest`);

          // Check matches
          const matchesRes = await api("GET", `bank/reconciliation/match?bankReconciliationId=${novRecon.id}&count=100&fields=*`);
          console.log("Matches after suggest:", matchesRes.data?.values?.length || 0);
          for (const m of (matchesRes.data?.values || [])) {
            console.log(`  Match ${m.id}: txns=${m.transactions?.length}, postings=${m.postings?.length}, type=${m.type}`);
          }
        }
      }
    }
  }

  console.log("\n=== DONE ===");
}

main().catch(e => {
  console.error("FATAL:", e);
  process.exit(1);
});
