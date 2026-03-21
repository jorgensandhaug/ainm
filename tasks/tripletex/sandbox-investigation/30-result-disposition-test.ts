// Task 30: Test result disposition (resultatdisponering) voucher
// Hypothesis: checks 4+5 fail because result disposition entry is missing
// Norwegian "forenklet årsoppgjør" implies transferring annual result to equity

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: RequestInit = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const json = await res.json();
  console.log(`${method} ${path} => ${res.status}`);
  if (res.status >= 400) console.log("  ERR:", JSON.stringify(json, null, 2).slice(0, 500));
  return { status: res.status, data: json };
}

async function main() {
  // 1. Look up result disposition accounts
  console.log("=== 1. Result disposition accounts ===");
  const accRes = await api("GET", "/ledger/account?number=8800,8960,8990,2050,2080,2099&fields=id,number,name");
  const accounts: Record<number, any> = {};
  for (const a of (accRes.data?.values || [])) {
    accounts[a.number] = a;
    console.log(`  ${a.number} "${a.name}" id=${a.id}`);
  }

  // 2. Get the annual result from yearEnd API
  console.log("\n=== 2. Annual result from yearEnd ===");
  const yeRes = await api("GET", "/yearEnd?year=2025&fields=*");
  const annualResult = yeRes.data?.value?.annualResult;
  console.log(`  annualResult: ${annualResult}`);
  console.log(`  status: ${yeRes.data?.value?.status}`);

  // 3. Also compute via balance sheet
  console.log("\n=== 3. Balance sheet P&L sum ===");
  const bsRes = await api("GET", "/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=3000&accountNumberTo=8700&fields=*&count=1000");
  let sumBalanceOut = 0;
  for (const row of (bsRes.data?.values || [])) {
    sumBalanceOut += row.balanceOut || 0;
  }
  const preTaxProfit = -sumBalanceOut;
  console.log(`  sumBalanceOut: ${sumBalanceOut}`);
  console.log(`  preTaxProfit: ${preTaxProfit}`);

  // Also check 8700-8799 range for tax
  const taxBs = await api("GET", "/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=8700&accountNumberTo=8800&fields=*&count=100");
  let taxSum = 0;
  for (const row of (taxBs.data?.values || [])) {
    taxSum += row.balanceOut || 0;
    console.log(`  tax acct ${row.account?.number}: balanceOut=${row.balanceOut}`);
  }

  // 4. Test result disposition voucher
  // For loss: DR 2080 (Udekket tap) / CR 8800 (Årsresultat) — BUT this is the equity side
  // Actually, in Norwegian standard:
  //   If profit: DR 8800 / CR 8960 or CR 2050
  //   If loss:   DR 8990 / CR 8800 or DR 2080 / CR 8800

  // But actually the standard result disposition uses INCOME STATEMENT accounts:
  //   Profit → DR 8960 "Overføringer annen egenkapital" / CR 8960 (wait that's wrong)

  // Let me check: standard result disposition in NS 4102:
  // Profit scenario:
  //   Income statement: CR 8960 (negative = reduce P&L result)
  //   Balance sheet:    DR 2050 (positive = increase equity)
  //   Wait, that's two accounts in different sections...
  //   Actually: DR 8960 (positive, expense) + CR 2050 (negative, equity increase)
  //   But 8960 is an expense line under "result disposition"

  // Loss scenario:
  //   DR 2080 (positive, reduce equity) + CR 8990 (negative, reduce loss)

  // Let's try a simple test:
  const postTaxResult = preTaxProfit; // Simplified, ignoring tax for this test

  console.log(`\n=== 4. Test result disposition voucher (postTaxResult=${postTaxResult}) ===`);

  // Test option A: DR 8960 + CR 2050 (for profit)
  // Test option B: DR 2050 + CR 8990 (for loss)

  // Our sandbox has a loss (annualResult=-1163813), so test loss disposition
  if (postTaxResult <= 0) {
    // Loss: transfer to uncovered loss
    // Standard: DR 8800 (reduces annual result from credit balance to zero)
    //           CR 8990 (creates credit on uncovered loss line)
    // Or: DR 2050/2080 (equity debit) / CR 8800 (result credit)

    console.log("  Testing LOSS disposition (annual result is negative)");

    // Option 1: Use 8800/2080 pair
    const v1 = await api("POST", "/ledger/voucher?sendToLedger=true", {
      date: "2025-12-31",
      description: "Disponering av årsresultat 2025 - test 1",
      postings: [
        { row: 1, date: "2025-12-31", account: { id: accounts[8800]?.id }, amountGross: Math.abs(annualResult), amountGrossCurrency: Math.abs(annualResult), description: "Årsresultat" },
        { row: 2, date: "2025-12-31", account: { id: accounts[2080]?.id }, amountGross: -Math.abs(annualResult), amountGrossCurrency: -Math.abs(annualResult), description: "Udekket tap" },
      ]
    });
    console.log(`  Option 1 (DR 8800 / CR 2080): status=${v1.status} id=${v1.data?.value?.id}`);
    if (v1.data?.value?.postings) {
      for (const p of v1.data.value.postings) {
        console.log(`    row=${p.row} acct=${p.account?.number || p.account?.id} amt=${p.amount}`);
      }
    }
  } else {
    console.log("  Testing PROFIT disposition (annual result is positive)");
    // Profit: DR 8960 / CR 2050
    const v1 = await api("POST", "/ledger/voucher?sendToLedger=true", {
      date: "2025-12-31",
      description: "Disponering av årsresultat 2025 - test 1",
      postings: [
        { row: 1, date: "2025-12-31", account: { id: accounts[8960]?.id }, amountGross: postTaxResult, amountGrossCurrency: postTaxResult, description: "Overføringer annen egenkapital" },
        { row: 2, date: "2025-12-31", account: { id: accounts[2050]?.id }, amountGross: -postTaxResult, amountGrossCurrency: -postTaxResult, description: "Annen egenkapital" },
      ]
    });
    console.log(`  Option 1 (DR 8960 / CR 2050): status=${v1.status} id=${v1.data?.value?.id}`);
    if (v1.data?.value?.postings) {
      for (const p of v1.data.value.postings) {
        console.log(`    row=${p.row} acct=${p.account?.number || p.account?.id} amt=${p.amount}`);
      }
    }
  }

  // 5. Check yearEnd status after posting
  console.log("\n=== 5. YearEnd status after disposition ===");
  const yeAfter = await api("GET", "/yearEnd?year=2025&fields=*");
  console.log(`  annualResult: ${yeAfter.data?.value?.annualResult}`);
  console.log(`  status: ${yeAfter.data?.value?.status}`);

  // 6. Test: what happens with the opposite accounts?
  // For profit: standard Norwegian is
  //   DR 8960 "Overføringer annen egenkapital" (income statement) = positive (expense)
  //   CR 2050 "Annen egenkapital" (balance sheet) = negative (equity increase)
  // For loss:
  //   DR 8800 "Årsresultat" (close the result) = positive
  //   CR 2080 "Udekket tap" = negative

  // Alternative: maybe it's simpler
  //   DR 8800 / CR 2050 for both profit and loss

  console.log("\n=== 6. Test alternative: DR 8800 / CR 2050 ===");
  // Use a small test amount
  const v2 = await api("POST", "/ledger/voucher?sendToLedger=true", {
    date: "2025-12-31",
    description: "Disponering av årsresultat 2025 - test 2",
    postings: [
      { row: 1, date: "2025-12-31", account: { id: accounts[8800]?.id }, amountGross: 100, amountGrossCurrency: 100, description: "Årsresultat test" },
      { row: 2, date: "2025-12-31", account: { id: accounts[2050]?.id }, amountGross: -100, amountGrossCurrency: -100, description: "Annen egenkapital test" },
    ]
  });
  console.log(`  DR 8800 / CR 2050: status=${v2.status} id=${v2.data?.value?.id}`);

  // Test 8960/2050 pair
  const v3 = await api("POST", "/ledger/voucher?sendToLedger=true", {
    date: "2025-12-31",
    description: "Disponering av årsresultat 2025 - test 3",
    postings: [
      { row: 1, date: "2025-12-31", account: { id: accounts[8960]?.id }, amountGross: 100, amountGrossCurrency: 100, description: "Overføringer annen egenkapital" },
      { row: 2, date: "2025-12-31", account: { id: accounts[2050]?.id }, amountGross: -100, amountGrossCurrency: -100, description: "Annen egenkapital" },
    ]
  });
  console.log(`  DR 8960 / CR 2050: status=${v3.status} id=${v3.data?.value?.id}`);

  console.log("\n=== DONE ===");
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
