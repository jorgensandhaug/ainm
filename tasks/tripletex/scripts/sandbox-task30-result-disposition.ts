// Test: Does the year-end closing require a RESULT DISPOSITION voucher?
// Standard Norwegian year-end: after computing tax, transfer net result to equity
// Debit 8960 (Overføringer annen egenkapital) / Credit 2050 (Annen egenkapital)
// OR for a loss: Debit 2050 / Credit 8960

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const r2 = (v: number) => Math.round(v * 100) / 100;

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = {
    method,
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  console.log(`${method} ${path} → ${res.status}`);
  if (!res.ok) {
    console.log("  ERROR:", JSON.stringify(data).slice(0, 500));
    return null;
  }
  return data;
}

async function main() {
  // Step 1: Get account IDs for ALL needed accounts
  const allAccts = await api("GET", "/ledger/account?number=1209,6010,1700,6300,8700,2920,8960,2050&fields=id,number,name&count=100");
  const accts: Record<number, any> = {};
  for (const a of allAccts?.values || []) accts[a.number] = a;
  console.log("Found:", Object.keys(accts).map(Number));

  // Create missing if needed
  const needed = [1209, 8700];
  const missing = needed.filter(n => !accts[n]);
  if (missing.length > 0) {
    const nameMap: Record<number, string> = {
      1209: "Akkumulerte avskrivninger",
      8700: "Skattekostnad på ordinært resultat",
    };
    const batch = missing.map(n => ({ number: n, name: nameMap[n] }));
    console.log("Creating missing:", missing);
    if (batch.length === 1) {
      const r = await api("POST", "/ledger/account", batch[0]);
      if (r) accts[batch[0].number] = r.value;
    } else {
      const r = await api("POST", "/ledger/account/list", batch);
      if (r) for (const a of r.values) accts[a.number] = a;
    }
  }

  // Step 2: Depreciation — using dummy amounts
  const assets = [
    { name: "Programvare", cost: 111950, life: 9 },
    { name: "Kontormaskiner", cost: 351450, life: 9 },
    { name: "Inventar", cost: 418800, life: 10 },
  ];
  const deps = assets.map(a => ({ ...a, dep: r2(a.cost / a.life) }));
  const totalDep = r2(deps.reduce((s, d) => s + d.dep, 0));
  console.log("\nDepreciation amounts:", deps.map(d => `${d.name}: ${d.dep}`));
  console.log("Total depreciation:", totalDep);

  for (const d of deps) {
    await api("POST", "/ledger/voucher", {
      date: "2025-12-31",
      description: `Avskrivning ${d.name} 2025`,
      postings: [
        { row: 1, account: { id: accts[6010].id }, amountGross: d.dep, amountGrossCurrency: d.dep, description: `Avskrivning ${d.name}` },
        { row: 2, account: { id: accts[1209].id }, amountGross: -d.dep, amountGrossCurrency: -d.dep, description: `Akk. avskrivning ${d.name}` },
      ],
    });
  }

  // Step 3: Prepaid reversal
  const PREPAID = 79750;
  await api("POST", "/ledger/voucher", {
    date: "2025-12-31",
    description: "Periodisering forskuddsbetalte kostnader",
    postings: [
      { row: 1, account: { id: accts[6300].id }, amountGross: PREPAID, amountGrossCurrency: PREPAID, description: "Periodisering leiekostnad" },
      { row: 2, account: { id: accts[1700].id }, amountGross: -PREPAID, amountGrossCurrency: -PREPAID, description: "Forskuddsbetalte kostnader" },
    ],
  });

  // Step 4: Balance sheet for tax
  const bs = await api("GET", "/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=3000&accountNumberTo=8700&fields=*,account(id,number,name)&count=1000");
  let sumBal = 0;
  for (const row of bs?.values || []) sumBal += row.balanceOut || 0;
  const preTaxProfit = -sumBal;
  const taxAmount = Math.round(Math.max(0, preTaxProfit) * 0.22);
  console.log(`\nBalance sheet sum: ${sumBal}, preTaxProfit: ${preTaxProfit}, taxAmount: ${taxAmount}`);

  // Step 5: Tax voucher
  if (taxAmount > 0) {
    await api("POST", "/ledger/voucher", {
      date: "2025-12-31",
      description: "Skattekostnad 2025",
      postings: [
        { row: 1, account: { id: accts[8700].id }, amountGross: taxAmount, amountGrossCurrency: taxAmount, description: "Skattekostnad" },
        { row: 2, account: { id: accts[2920].id }, amountGross: -taxAmount, amountGrossCurrency: -taxAmount, description: "Betalbar skatt" },
      ],
    });
  }

  // Step 6: RESULT DISPOSITION — the new step!
  // After-tax result = preTaxProfit - taxAmount
  const afterTaxResult = preTaxProfit - taxAmount;
  console.log(`\nAfter-tax result: ${afterTaxResult}`);

  if (afterTaxResult !== 0) {
    // For profit: Debit 8960, Credit 2050
    // For loss: Debit 2050, Credit 8960
    // Actually, let's check which standard accounts to use
    console.log("Posting result disposition...");

    if (afterTaxResult > 0) {
      // Profit: transfer to equity
      await api("POST", "/ledger/voucher", {
        date: "2025-12-31",
        description: "Overføring til annen egenkapital",
        postings: [
          { row: 1, account: { id: accts[8960].id }, amountGross: afterTaxResult, amountGrossCurrency: afterTaxResult, description: "Overføring til annen egenkapital" },
          { row: 2, account: { id: accts[2050].id }, amountGross: -afterTaxResult, amountGrossCurrency: -afterTaxResult, description: "Annen egenkapital" },
        ],
      });
    } else {
      // Loss: transfer loss to equity (debit 2050, credit 8960)
      const lossAmt = Math.abs(afterTaxResult);
      await api("POST", "/ledger/voucher", {
        date: "2025-12-31",
        description: "Overføring av udekket tap",
        postings: [
          { row: 1, account: { id: accts[2050].id }, amountGross: lossAmt, amountGrossCurrency: lossAmt, description: "Udekket tap" },
          { row: 2, account: { id: accts[8960].id }, amountGross: -lossAmt, amountGrossCurrency: -lossAmt, description: "Overføring annen egenkapital" },
        ],
      });
    }
  }

  // Step 7: Verify final state
  console.log("\n=== Final state verification ===");

  // Check balances on key accounts
  const finalBS = await api("GET", "/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=1000&accountNumberTo=9999&fields=*,account(number,name)&count=1000");
  console.log("\nNon-zero balances:");
  for (const row of finalBS?.values || []) {
    if (Math.abs(row.balanceOut || 0) > 0.01) {
      console.log(`  ${row.account?.number} (${row.account?.name}): ${row.balanceOut}`);
    }
  }

  // Check yearEnd module
  console.log("\n=== Year-end module state ===");
  const ye = await api("GET", "/yearEnd?fields=annualResult,status");
  if (ye) console.log(JSON.stringify(ye.value, null, 2));

  console.log("\n=== DONE ===");
  console.log("Flow: GET accounts + POST create_missing + 3x POST dep + POST prepaid + GET BS + POST tax + POST result_disposition");
  console.log("Total calls: 9 (with missing accounts) or 8 (without)");
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
