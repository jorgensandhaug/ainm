/**
 * Task 30 — Full pipeline test with module activation + prompt accounts.
 *
 * Changes from current production pipeline:
 * 1. Activate YEAR_END_REPORTING_AS module (Phase 0)
 * 2. Use 8700/2920 for tax (prompt's accounts, NOT the disproven 8300/2500)
 * 3. Everything else same
 *
 * Goal: see if module activation changes the score.
 */
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);

const r2 = (v: number) => Math.round(v * 100) / 100;

// Simulating the production prompt
const YEAR = "2025";
const DATE = "2025-12-31";
const assets = [
  { name: "IT-utstyr", cost: 204150, life: 4, assetAcct: 1210 },
  { name: "Inventar", cost: 237550, life: 8, assetAcct: 1240 },
  { name: "Programvare", cost: 307500, life: 4, assetAcct: 1250 },
];
const deps = assets.map(a => ({ ...a, amount: r2(a.cost / a.life) }));
const PREPAID = 44300;

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: { Authorization: AUTH, "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  const status = res.status;
  if (!res.ok && status !== 409) {
    console.log(`${method} ${path} → ${status}`);
    console.error("  ERROR:", typeof data === "string" ? data.slice(0, 300) : JSON.stringify(data, null, 2).slice(0, 500));
  } else {
    console.log(`${method} ${path} → ${status}${status === 409 ? " (already active)" : ""}`);
  }
  return { status, data, ok: res.ok };
}

async function main() {
  console.log("=== PHASE 0: Module Activation ===");
  // Activate year-end reporting module (critical hypothesis)
  await api("POST", "/company/salesmodules", { name: "YEAR_END_REPORTING_AS" });

  console.log("\n=== PHASE 1: Account Lookup ===");
  // Include 8700 and 2920 (prompt's accounts), NOT 8300/2500
  const acctNumbers = "1209,6010,1700,6300,7500,8700,2920,8800,2050";
  const acctRes = await api("GET", `/ledger/account?number=${acctNumbers}&fields=id,number,name&count=100`);
  const accts: Record<number, { id: number; name: string }> = {};
  for (const a of acctRes.data.values) {
    accts[a.number] = { id: a.id, name: a.name };
  }
  console.log("Found accounts:", Object.keys(accts).map(Number).sort((a, b) => a - b).join(", "));

  // Determine prepaid contra
  let contraAcct = 6300;
  if (accts[1700]) {
    const name1700 = accts[1700].name.toLowerCase();
    if (name1700.includes("forsikring")) contraAcct = 7500;
    console.log(`Account 1700: "${accts[1700].name}" → contra: ${contraAcct}`);
  }

  console.log("\n=== PHASE 1b: Create Missing Accounts ===");
  const needed = [1209, 6010, 1700, contraAcct, 8700, 2920, 8800, 2050];
  const missing = needed.filter(n => !accts[n]);
  console.log("Missing:", missing.length > 0 ? missing.join(", ") : "none");

  if (missing.length === 1) {
    const nameMap: Record<number, string> = { 1209: "Akkumulerte avskrivninger" };
    const created = await api("POST", "/ledger/account", { number: missing[0], name: nameMap[missing[0]] || `Account ${missing[0]}` });
    if (created.ok) accts[missing[0]] = { id: created.data.value.id, name: created.data.value.name };
  } else if (missing.length > 1) {
    const nameMap: Record<number, string> = { 1209: "Akkumulerte avskrivninger" };
    const batch = missing.map(n => ({ number: n, name: nameMap[n] || `Account ${n}` }));
    const created = await api("POST", "/ledger/account/list", batch);
    if (created.ok) {
      for (const a of created.data.values) accts[a.number] = { id: a.id, name: a.name };
    }
  }

  const depCostId = accts[6010].id;
  const accumDepId = accts[1209].id;

  console.log("\n=== PHASE 2: Depreciation Vouchers (3) + Prepaid Reversal (1) ===");
  const voucherIds: number[] = [];

  // 3 depreciation vouchers
  for (const d of deps) {
    const v = await api("POST", "/ledger/voucher", {
      date: DATE,
      description: `Avskrivning ${d.name} ${YEAR}`,
      postings: [
        { row: 1, account: { id: depCostId }, amountGross: d.amount, amountGrossCurrency: d.amount, description: `Avskrivning ${d.name}` },
        { row: 2, account: { id: accumDepId }, amountGross: -d.amount, amountGrossCurrency: -d.amount, description: `Akk. avskrivning ${d.name}` },
      ],
    });
    if (v.ok) voucherIds.push(v.data.value.id);
  }
  console.log(`Depreciation amounts: ${deps.map(d => `${d.name}=${d.amount}`).join(", ")}`);

  // Prepaid reversal
  const prepV = await api("POST", "/ledger/voucher", {
    date: DATE,
    description: "Periodisering forskuddsbetalte kostnader",
    postings: [
      { row: 1, account: { id: accts[contraAcct].id }, amountGross: PREPAID, amountGrossCurrency: PREPAID, description: "Periodisering leiekostnad" },
      { row: 2, account: { id: accts[1700].id }, amountGross: -PREPAID, amountGrossCurrency: -PREPAID, description: "Forskuddsbetalte kostnader" },
    ],
  });
  if (prepV.ok) voucherIds.push(prepV.data.value.id);

  console.log("\n=== PHASE 3: Balance Sheet for Tax ===");
  const bsRes = await api("GET", `/balanceSheet?dateFrom=${YEAR}-01-01&dateTo=2026-01-01&accountNumberFrom=3000&accountNumberTo=8299&fields=*,account(id,number,name)&count=1000`);
  let sumBalanceOut = 0;
  for (const row of bsRes.data.values) {
    sumBalanceOut += row.balanceOut || 0;
  }
  const preTaxProfit = r2(-sumBalanceOut);
  console.log(`Pre-tax profit: ${preTaxProfit}`);

  const taxAmount = Math.round(Math.max(0, preTaxProfit) * 0.22);
  console.log(`Tax (22%): ${taxAmount}`);

  console.log("\n=== PHASE 4: Tax Voucher (8700/2920) ===");
  if (taxAmount > 0) {
    const taxV = await api("POST", "/ledger/voucher", {
      date: DATE,
      description: `Skattekostnad ${YEAR}`,
      postings: [
        { row: 1, account: { id: accts[8700].id }, amountGross: taxAmount, amountGrossCurrency: taxAmount, description: "Skattekostnad" },
        { row: 2, account: { id: accts[2920].id }, amountGross: -taxAmount, amountGrossCurrency: -taxAmount, description: "Betalbar skatt" },
      ],
    });
    if (taxV.ok) voucherIds.push(taxV.data.value.id);
  } else {
    console.log("  No tax (loss scenario)");
  }

  console.log("\n=== PHASE 5: Disposition (8800/2050) ===");
  const postTaxResult = r2(preTaxProfit - taxAmount);
  console.log(`Post-tax result: ${postTaxResult}`);

  if (postTaxResult > 0) {
    const dispV = await api("POST", "/ledger/voucher", {
      date: DATE,
      description: `Disponering av årsresultat ${YEAR}`,
      postings: [
        { row: 1, account: { id: accts[8800].id }, amountGross: postTaxResult, amountGrossCurrency: postTaxResult, description: "Årsresultat" },
        { row: 2, account: { id: accts[2050].id }, amountGross: -postTaxResult, amountGrossCurrency: -postTaxResult, description: "Annen egenkapital" },
      ],
    });
    if (dispV.ok) voucherIds.push(dispV.data.value.id);
  } else if (postTaxResult < 0) {
    const dispV = await api("POST", "/ledger/voucher", {
      date: DATE,
      description: `Disponering av årsresultat ${YEAR}`,
      postings: [
        { row: 1, account: { id: accts[2050].id }, amountGross: Math.abs(postTaxResult), amountGrossCurrency: Math.abs(postTaxResult), description: "Annen egenkapital" },
        { row: 2, account: { id: accts[8800].id }, amountGross: -Math.abs(postTaxResult), amountGrossCurrency: -Math.abs(postTaxResult), description: "Årsresultat" },
      ],
    });
    if (dispV.ok) voucherIds.push(dispV.data.value.id);
  }

  console.log("\n=== VERIFY: yearEnd state ===");
  const ye = await api("GET", "/yearEnd?year=2025&fields=*");
  if (ye.ok) {
    const d = ye.data.value;
    console.log(`  status: ${d.status}`);
    console.log(`  annualResult: ${d.annualResult}`);
    console.log(`  taxCost: ${JSON.stringify(d.taxCost?.sumAmount)}`);
    console.log(`  yearEndReportPosting: ${JSON.stringify(d.yearEndReportPosting?.sumAmount)} (posts: ${d.yearEndReportPosting?.posts?.length})`);
  }

  // Verify the posted vouchers with their types
  console.log("\n=== VERIFY: Posted vouchers ===");
  for (const vid of voucherIds) {
    const v = await api("GET", `/ledger/voucher/${vid}?fields=id,description,voucherType(id,name),postings(account(number,name),amountGross)`);
    if (v.ok) {
      const vd = v.data.value;
      console.log(`  V${vid}: type=${vd.voucherType?.name || "null"} desc="${vd.description}"`);
      for (const p of vd.postings || []) {
        console.log(`    ${p.account.number} ${p.account.name}: ${p.amountGross}`);
      }
    }
  }

  // Cleanup
  console.log("\n=== CLEANUP ===");
  for (const vid of voucherIds.reverse()) {
    const del = await api("DELETE", `/ledger/voucher/${vid}`);
    console.log(`  DELETE ${vid}: ${del.status}`);
  }

  console.log("\n=== SUMMARY ===");
  console.log(`Total API calls: 1 module + 1 GET accts + ${missing.length > 0 ? 1 : 0} create + 3 dep + 1 prepaid + 1 BS + ${taxAmount > 0 ? 1 : 0} tax + 1 disp = ${3 + (missing.length > 0 ? 1 : 0) + 3 + 1 + 1 + (taxAmount > 0 ? 1 : 0) + 1}`);
  console.log(`Tax accounts used: 8700/2920 (prompt's accounts)`);
  console.log(`Module activated: YEAR_END_REPORTING_AS`);
}

main().catch(e => { console.error(e); process.exit(1); });
