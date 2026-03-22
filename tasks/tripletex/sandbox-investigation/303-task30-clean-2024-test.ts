// Clean E2E test on year 2024 (no contamination)
// Test: module activation + 8300/2500 vs 8700/2920
// First create seed revenue, then do year-end

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = {
    method,
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, data: json };
}

function log(msg: string) { console.log(msg); }

async function main() {
  const YEAR = 2024;
  const r2 = (v: number) => Math.round(v * 100) / 100;

  // Step 0: Check if 2024 is clean
  log("=== STEP 0: CHECK 2024 STATE ===");
  const existing = await api("GET", `/ledger/voucher?dateFrom=${YEAR}-01-01&dateTo=${YEAR+1}-01-01&fields=id&count=1`);
  log(`Existing 2024 vouchers: ${existing.data?.fullResultSize || 0}`);

  const ye0 = await api("GET", `/yearEnd?year=${YEAR}&fields=*`);
  log(`yearEnd 2024 status: ${ye0.data?.value?.status}`);
  log(`yearEnd 2024 annualResult: ${ye0.data?.value?.annualResult}`);
  log(`yearEnd 2024 taxCost: ${JSON.stringify(ye0.data?.value?.taxCost)}`);

  // Step 1: Ensure module is active
  log("\n=== STEP 1: ACTIVATE MODULE ===");
  const mod = await api("POST", "/company/salesmodules", { name: "YEAR_END_REPORTING_AS" });
  log(`Module activation: ${mod.status} (201=new, 409=already active)`);

  // Step 2: Create seed revenue for 2024 (same as production: ~10M NOK)
  log("\n=== STEP 2: CREATE SEED REVENUE ===");
  // Get account IDs
  const accts = await api("GET", "/ledger/account?number=1500,1920,3000,3900,2700,1700,6010,6300,7500,8300,8700,2500,2920,8800,2050,1200,1209,1210,1230,1240,1250&fields=id,number,name&count=50");
  const acctMap: Record<number, number> = {};
  const acctNames: Record<number, string> = {};
  for (const a of (accts.data?.values || [])) {
    acctMap[a.number] = a.id;
    acctNames[a.number] = a.name;
    log(`  ${a.number} (${a.name}): id=${a.id}`);
  }

  // Create 1209 if missing
  if (!acctMap[1209]) {
    log("\nCreating missing account 1209...");
    const res = await api("POST", "/ledger/account", { number: 1209, name: "Akkumulerte avskrivninger" });
    if (res.status === 201) {
      acctMap[1209] = res.data?.value?.id;
      log(`  Created 1209: id=${res.data?.value?.id}`);
    } else if (res.status === 422) {
      // Already exists from previous run
      log(`  1209 already exists`);
      const re = await api("GET", "/ledger/account?number=1209&fields=id,number,name&count=1");
      acctMap[1209] = re.data?.values?.[0]?.id;
    }
  }

  // Create seed revenue: DR 1500 / CR 3000 = 500,000 NOK (enough for positive profit)
  // Only create if no 2024 vouchers exist
  if ((existing.data?.fullResultSize || 0) === 0) {
    log("\nCreating seed revenue voucher...");
    const seed = await api("POST", "/ledger/voucher", {
      date: `${YEAR}-06-15`,
      description: "Clean test: revenue for year-end 2024",
      postings: [
        { row: 1, account: { id: acctMap[1920] }, amountGross: 500000, amountGrossCurrency: 500000, description: "Andre kortsiktige fordringer" },
        { row: 2, account: { id: acctMap[3900] }, amountGross: -500000, amountGrossCurrency: -500000, description: "Annen driftsrelatert inntekt" },
      ]
    });
    log(`Seed revenue: ${seed.status} id=${seed.data?.value?.id}`);
    if (seed.status !== 201) {
      log(`ERROR: ${JSON.stringify(seed.data)}`);
      return;
    }
  } else {
    log("Skipping seed - already have 2024 vouchers");
  }

  // Step 3: Verify balance sheet before year-end
  log("\n=== STEP 3: BALANCE SHEET BEFORE YEAR-END ===");
  const bs0 = await api("GET", `/balanceSheet?dateFrom=${YEAR}-01-01&dateTo=${YEAR+1}-01-01&accountNumberFrom=3000&accountNumberTo=8299&fields=*,account(id,number,name)&count=500`);
  let sum0 = 0;
  for (const v of (bs0.data?.values || [])) {
    if (v.balanceOut !== 0) {
      log(`  ${v.account.number} ${v.account.name}: ${v.balanceOut}`);
      sum0 += v.balanceOut;
    }
  }
  log(`  Sum: ${sum0}, preTaxProfit: ${-sum0}`);

  // Step 4: Year-end with test data
  // Assets: IT-utstyr (100000/5yr/1210), Programvare (60000/6yr/1250), Inventar (80000/4yr/1240)
  // Prepaid: 10000 on 1700
  const dep1 = r2(100000 / 5);  // 20000
  const dep2 = r2(60000 / 6);   // 10000
  const dep3 = r2(80000 / 4);   // 20000
  const prepaid = 10000;

  log(`\nDepreciation: ${dep1}, ${dep2}, ${dep3} (total: ${dep1+dep2+dep3})`);
  log(`Prepaid: ${prepaid}`);

  // Post depreciation vouchers
  log("\n=== STEP 4: POST DEPRECIATION ===");
  const assets = [
    { name: "IT-utstyr", amount: dep1 },
    { name: "Programvare", amount: dep2 },
    { name: "Inventar", amount: dep3 },
  ];

  for (const asset of assets) {
    const v = await api("POST", "/ledger/voucher", {
      date: `${YEAR}-12-31`,
      description: `Avskrivning ${asset.name} ${YEAR}`,
      postings: [
        { row: 1, account: { id: acctMap[6010] }, amountGross: asset.amount, amountGrossCurrency: asset.amount, description: `Avskrivning ${asset.name}` },
        { row: 2, account: { id: acctMap[1209] }, amountGross: -asset.amount, amountGrossCurrency: -asset.amount, description: `Akk. avskrivning ${asset.name}` },
      ]
    });
    log(`  ${asset.name}: ${v.status} id=${v.data?.value?.id}`);
  }

  // Post prepaid reversal
  log("\n=== STEP 5: POST PREPAID REVERSAL ===");
  const prepaidContra = acctNames[1700]?.includes("forsikring") ? 7500 : 6300;
  log(`  1700 name: "${acctNames[1700]}" → contra: ${prepaidContra}`);
  const pv = await api("POST", "/ledger/voucher", {
    date: `${YEAR}-12-31`,
    description: "Periodisering forskuddsbetalte kostnader",
    postings: [
      { row: 1, account: { id: acctMap[prepaidContra] }, amountGross: prepaid, amountGrossCurrency: prepaid, description: "Periodisering leiekostnad" },
      { row: 2, account: { id: acctMap[1700] }, amountGross: -prepaid, amountGrossCurrency: -prepaid, description: "Forskuddsbetalte kostnader" },
    ]
  });
  log(`  Prepaid: ${pv.status} id=${pv.data?.value?.id}`);

  // Step 5: Balance sheet for tax calculation
  log("\n=== STEP 6: BALANCE SHEET FOR TAX ===");
  const bs1 = await api("GET", `/balanceSheet?dateFrom=${YEAR}-01-01&dateTo=${YEAR+1}-01-01&accountNumberFrom=3000&accountNumberTo=8299&fields=*,account(id,number,name)&count=500`);
  let sumBS = 0;
  for (const v of (bs1.data?.values || [])) {
    if (v.balanceOut !== 0) {
      log(`  ${v.account.number} ${v.account.name}: ${v.balanceOut}`);
      sumBS += v.balanceOut;
    }
  }
  const preTaxProfit = -(sumBS);
  const taxAmount = Math.round(Math.max(0, preTaxProfit) * 0.22);
  const postTaxResult = r2(preTaxProfit - taxAmount);
  log(`\n  sumBalanceOut: ${sumBS}`);
  log(`  preTaxProfit: ${preTaxProfit}`);
  log(`  taxAmount: ${taxAmount}`);
  log(`  postTaxResult: ${postTaxResult}`);

  // ========= TEST A: 8300/2500 =========
  log("\n\n" + "=".repeat(60));
  log("TEST A: Tax on 8300/2500 (matches yearEnd taxCost grouping)");
  log("=".repeat(60));

  if (taxAmount > 0) {
    const taxA = await api("POST", "/ledger/voucher", {
      date: `${YEAR}-12-31`,
      description: `Skattekostnad ${YEAR}`,
      postings: [
        { row: 1, account: { id: acctMap[8300] }, amountGross: taxAmount, amountGrossCurrency: taxAmount, description: "Skattekostnad" },
        { row: 2, account: { id: acctMap[2500] }, amountGross: -taxAmount, amountGrossCurrency: -taxAmount, description: "Betalbar skatt" },
      ]
    });
    log(`  Tax voucher (8300/2500): ${taxA.status} id=${taxA.data?.value?.id}`);
  }

  // Disposition
  if (postTaxResult > 0) {
    const disp = await api("POST", "/ledger/voucher", {
      date: `${YEAR}-12-31`,
      description: `Disponering av årsresultat ${YEAR}`,
      postings: [
        { row: 1, account: { id: acctMap[8800] }, amountGross: postTaxResult, amountGrossCurrency: postTaxResult, description: "Årsresultat" },
        { row: 2, account: { id: acctMap[2050] }, amountGross: -postTaxResult, amountGrossCurrency: -postTaxResult, description: "Annen egenkapital" },
      ]
    });
    log(`  Disposition: ${disp.status} id=${disp.data?.value?.id}`);
  } else if (postTaxResult < 0) {
    const disp = await api("POST", "/ledger/voucher", {
      date: `${YEAR}-12-31`,
      description: `Disponering av årsresultat ${YEAR}`,
      postings: [
        { row: 1, account: { id: acctMap[2050] }, amountGross: Math.abs(postTaxResult), amountGrossCurrency: Math.abs(postTaxResult), description: "Annen egenkapital" },
        { row: 2, account: { id: acctMap[8800] }, amountGross: -Math.abs(postTaxResult), amountGrossCurrency: -Math.abs(postTaxResult), description: "Årsresultat" },
      ]
    });
    log(`  Disposition (loss): ${disp.status} id=${disp.data?.value?.id}`);
  }

  // Check yearEnd after 8300/2500
  log("\n--- yearEnd after 8300/2500 ---");
  const yeA = await api("GET", `/yearEnd?year=${YEAR}&fields=*`);
  const yA = yeA.data?.value;
  log(`  status: ${yA?.status}`);
  log(`  annualResult: ${yA?.annualResult}`);
  log(`  taxCost.sumAmount: ${yA?.taxCost?.sumAmount}`);
  for (const p of (yA?.taxCost?.posts || [])) {
    log(`    taxCost post: groupNumber=${p.groupNumber}, grouping=${p.grouping}, sumAmount=${p.sumAmount}`);
  }
  log(`  operatingExpense.sumAmount: ${yA?.operatingExpense?.sumAmount}`);
  log(`  yearEndReportPosting: ${JSON.stringify(yA?.yearEndReportPosting)}`);
  log(`  equity posts:`);
  for (const p of (yA?.equity?.posts || [])) {
    log(`    ${p.groupNumber}: ${p.name} = ${p.sumAmount}`);
  }
  log(`  currentDebt posts:`);
  for (const p of (yA?.currentDebt?.posts || [])) {
    log(`    ${p.groupNumber}: ${p.name} = ${p.sumAmount}`);
  }

  // Full balance sheet
  log("\n--- Final balance sheet ---");
  const bsFinal = await api("GET", `/balanceSheet?dateFrom=${YEAR}-01-01&dateTo=${YEAR+1}-01-01&accountNumberFrom=1000&accountNumberTo=9999&fields=account(number,name),balanceOut&count=500`);
  for (const v of (bsFinal.data?.values || [])) {
    if (v.balanceOut !== 0) {
      log(`  ${v.account.number} ${v.account.name}: ${v.balanceOut}`);
    }
  }

  // All year-end vouchers
  log("\n--- All ${YEAR} vouchers ---");
  const allV = await api("GET", `/ledger/voucher?dateFrom=${YEAR}-01-01&dateTo=${YEAR+1}-01-01&fields=id,number,date,description,postings(row,account(number,name),amountGross)&count=50`);
  for (const v of (allV.data?.values || [])) {
    log(`\n  Voucher ${v.number}: ${v.date} - ${v.description}`);
    for (const p of (v.postings || [])) {
      log(`    row ${p.row}: ${p.account?.number} ${p.account?.name}: ${p.amountGross}`);
    }
  }
}

main().catch(console.error);
