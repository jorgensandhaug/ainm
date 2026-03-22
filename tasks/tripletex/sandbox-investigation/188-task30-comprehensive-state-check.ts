/**
 * Task 30 — Full pipeline + comprehensive state verification.
 * Goal: understand what the scorer might check by examining every aspect of final state.
 */
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);

const r2 = (v: number) => Math.round(v * 100) / 100;

// Same assets as production run
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
  if (!res.ok && res.status !== 409) {
    console.log(`${method} ${path} → ${res.status} ERROR`);
    console.error("  ", typeof data === "string" ? data.slice(0, 300) : JSON.stringify(data).slice(0, 300));
  }
  return { status: res.status, data, ok: res.ok };
}

async function main() {
  // Phase 0: Module activation
  console.log("=== Phase 0: Module Activation ===");
  await api("POST", "/company/salesmodules", { name: "YEAR_END_REPORTING_AS" });

  // Phase 1: Account lookup
  console.log("\n=== Phase 1: Account Lookup ===");
  const acctNumbers = "1209,6010,1700,6300,7500,8700,2920,8800,2050";
  const acctRes = await api("GET", `/ledger/account?number=${acctNumbers}&fields=id,number,name`);
  const accts: Record<number, { id: number; name: string }> = {};
  for (const a of acctRes.data.values) {
    accts[a.number] = { id: a.id, name: a.name };
    console.log(`  ${a.number}: "${a.name}" (id=${a.id})`);
  }

  let contraAcct = 6300;
  if (accts[1700]) {
    const name1700 = accts[1700].name.toLowerCase();
    if (name1700.includes("forsikring")) contraAcct = 7500;
    console.log(`  1700 name → contra: ${contraAcct}`);
  }

  // Create 1209 if missing
  if (!accts[1209]) {
    const created = await api("POST", "/ledger/account", { number: 1209, name: "Akkumulerte avskrivninger" });
    if (created.ok) accts[1209] = { id: created.data.value.id, name: created.data.value.name };
  }

  // Phase 2: Post vouchers
  console.log("\n=== Phase 2: Post Vouchers ===");
  const voucherIds: number[] = [];

  for (const d of deps) {
    const v = await api("POST", "/ledger/voucher", {
      date: DATE,
      description: `Avskrivning ${d.name} ${YEAR}`,
      postings: [
        { row: 1, account: { id: accts[6010].id }, amountGross: d.amount, amountGrossCurrency: d.amount, description: `Avskrivning ${d.name}` },
        { row: 2, account: { id: accts[1209].id }, amountGross: -d.amount, amountGrossCurrency: -d.amount, description: `Akk. avskrivning ${d.name}` },
      ],
    });
    if (v.ok) { voucherIds.push(v.data.value.id); console.log(`  Dep ${d.name}: ${d.amount} → voucher ${v.data.value.id}`); }
  }

  const prepV = await api("POST", "/ledger/voucher", {
    date: DATE,
    description: "Periodisering forskuddsbetalte kostnader",
    postings: [
      { row: 1, account: { id: accts[contraAcct].id }, amountGross: PREPAID, amountGrossCurrency: PREPAID, description: "Periodisering leiekostnad" },
      { row: 2, account: { id: accts[1700].id }, amountGross: -PREPAID, amountGrossCurrency: -PREPAID, description: "Forskuddsbetalte kostnader" },
    ],
  });
  if (prepV.ok) { voucherIds.push(prepV.data.value.id); console.log(`  Prepaid: ${PREPAID} → voucher ${prepV.data.value.id}`); }

  // Phase 3: Balance sheet for tax
  console.log("\n=== Phase 3: Balance Sheet for Tax ===");
  const bsRes = await api("GET", `/balanceSheet?dateFrom=${YEAR}-01-01&dateTo=2026-01-01&accountNumberFrom=3000&accountNumberTo=8299&fields=*,account(id,number,name)&count=1000`);
  let sumBalanceOut = 0;
  console.log("  P&L account balances:");
  for (const row of bsRes.data.values) {
    if (row.balanceOut !== 0) {
      console.log(`    ${row.account?.number} ${row.account?.name}: in=${row.balanceIn} change=${row.balanceChange} out=${row.balanceOut}`);
    }
    sumBalanceOut += row.balanceOut || 0;
  }
  const preTaxProfit = r2(-sumBalanceOut);
  console.log(`  sumBalanceOut: ${sumBalanceOut}`);
  console.log(`  preTaxProfit: ${preTaxProfit}`);

  const taxAmount = Math.round(Math.max(0, preTaxProfit) * 0.22);
  console.log(`  taxAmount (22%): ${taxAmount}`);

  // Phase 4: Tax voucher
  console.log("\n=== Phase 4: Tax Voucher ===");
  if (taxAmount > 0) {
    const taxV = await api("POST", "/ledger/voucher", {
      date: DATE,
      description: `Skattekostnad ${YEAR}`,
      postings: [
        { row: 1, account: { id: accts[8700].id }, amountGross: taxAmount, amountGrossCurrency: taxAmount, description: "Skattekostnad" },
        { row: 2, account: { id: accts[2920].id }, amountGross: -taxAmount, amountGrossCurrency: -taxAmount, description: "Betalbar skatt" },
      ],
    });
    if (taxV.ok) { voucherIds.push(taxV.data.value.id); console.log(`  Tax: ${taxAmount} → voucher ${taxV.data.value.id}`); }
  } else {
    console.log("  No tax (loss scenario)");
  }

  // Phase 5: Disposition
  console.log("\n=== Phase 5: Disposition ===");
  const postTaxResult = r2(preTaxProfit - taxAmount);
  console.log(`  postTaxResult: ${postTaxResult}`);
  if (postTaxResult > 0) {
    const dispV = await api("POST", "/ledger/voucher", {
      date: DATE,
      description: `Disponering av årsresultat ${YEAR}`,
      postings: [
        { row: 1, account: { id: accts[8800].id }, amountGross: postTaxResult, amountGrossCurrency: postTaxResult, description: "Årsresultat" },
        { row: 2, account: { id: accts[2050].id }, amountGross: -postTaxResult, amountGrossCurrency: -postTaxResult, description: "Annen egenkapital" },
      ],
    });
    if (dispV.ok) { voucherIds.push(dispV.data.value.id); console.log(`  Disp: ${postTaxResult} → voucher ${dispV.data.value.id}`); }
  } else if (postTaxResult < 0) {
    const dispV = await api("POST", "/ledger/voucher", {
      date: DATE,
      description: `Disponering av årsresultat ${YEAR}`,
      postings: [
        { row: 1, account: { id: accts[2050].id }, amountGross: Math.abs(postTaxResult), amountGrossCurrency: Math.abs(postTaxResult), description: "Annen egenkapital" },
        { row: 2, account: { id: accts[8800].id }, amountGross: -Math.abs(postTaxResult), amountGrossCurrency: -Math.abs(postTaxResult), description: "Årsresultat" },
      ],
    });
    if (dispV.ok) { voucherIds.push(dispV.data.value.id); console.log(`  Disp: ${Math.abs(postTaxResult)} → voucher ${dispV.data.value.id}`); }
  }

  // ==========================================
  // COMPREHENSIVE STATE VERIFICATION
  // ==========================================
  console.log("\n========================================");
  console.log("COMPREHENSIVE STATE VERIFICATION");
  console.log("========================================");

  // V1: All vouchers posted with details
  console.log("\n=== V1: Posted Voucher Details ===");
  for (const vid of voucherIds) {
    const v = await api("GET", `/ledger/voucher/${vid}?fields=id,number,date,description,voucherType(id,name),postings(row,account(id,number,name),amountGross,amountGrossCurrency,amountCurrency,amount,description)`);
    if (v.ok) {
      const vd = v.data.value;
      console.log(`  V${vid}: #${vd.number} date=${vd.date} type=${vd.voucherType?.name || "null"} desc="${vd.description}"`);
      for (const p of vd.postings || []) {
        console.log(`    row=${p.row} acct=${p.account.number}(${p.account.name}) gross=${p.amountGross} amount=${p.amount} desc="${p.description}"`);
      }
    }
  }

  // V2: Account balances after all postings
  console.log("\n=== V2: Account Balances (all relevant) ===");
  const allAccts = "1209,1210,1240,1250,1700,2050,2920,6010,6300,8700,8800";
  const bsAll = await api("GET", `/balanceSheet?dateFrom=${YEAR}-01-01&dateTo=2026-01-01&accountNumberFrom=1000&accountNumberTo=8999&fields=*,account(number,name)&count=2000`);
  if (bsAll.ok) {
    for (const r of bsAll.data.values) {
      if (r.balanceOut !== 0 || allAccts.includes(String(r.account?.number))) {
        console.log(`  ${r.account?.number} ${r.account?.name}: in=${r.balanceIn} change=${r.balanceChange} out=${r.balanceOut}`);
      }
    }
  }

  // V3: yearEnd report
  console.log("\n=== V3: yearEnd Report ===");
  const ye = await api("GET", "/yearEnd?year=2025&fields=*");
  if (ye.ok) {
    const v = ye.data.value;
    console.log(`  status: ${v.status}`);
    console.log(`  annualResult: ${v.annualResult}`);
    for (const key of Object.keys(v)) {
      if (v[key] && typeof v[key] === 'object' && 'sumAmount' in v[key]) {
        if (v[key].sumAmount !== 0) {
          console.log(`  ${key}: sumAmount=${v[key].sumAmount}`);
          if (v[key].posts) {
            for (const post of v[key].posts) {
              if (post.sumAmount !== 0) {
                console.log(`    ${post.name}: ${post.sumAmount} (grouping: ${post.grouping})`);
              }
            }
          }
        }
      }
    }
  }

  // V4: yearEnd annualAccounts
  console.log("\n=== V4: yearEnd Annual Accounts ===");
  const yea = await api("GET", "/yearEnd/annualAccounts?year=2025&fields=*");
  if (yea.ok) {
    const v = yea.data.value;
    for (const key of Object.keys(v)) {
      if (v[key] && typeof v[key] === 'object' && 'sumAmount' in v[key]) {
        if (v[key].sumAmount !== 0) {
          console.log(`  ${key}: sumAmount=${v[key].sumAmount}`);
        }
      } else if (typeof v[key] === 'number' && v[key] !== 0) {
        console.log(`  ${key}: ${v[key]}`);
      }
    }
  }

  // V5: Check if 1700 balance is zero (prepaid fully reversed)
  console.log("\n=== V5: Account 1700 State ===");
  const bs1700 = await api("GET", `/balanceSheet?dateFrom=${YEAR}-01-01&dateTo=2026-01-01&accountNumberFrom=1700&accountNumberTo=1700&fields=*,account(number,name)&count=10`);
  if (bs1700.ok) {
    for (const r of bs1700.data.values) {
      console.log(`  1700: in=${r.balanceIn} change=${r.balanceChange} out=${r.balanceOut}`);
    }
    if (bs1700.data.values.length === 0) console.log("  (no entries on 1700)");
  }

  // V6: Check all postings on relevant accounts
  console.log("\n=== V6: Postings on 6010 (depreciation cost) ===");
  const p6010 = await api("GET", `/ledger/posting?accountId=${accts[6010].id}&dateFrom=${DATE}&dateTo=2026-01-01&fields=id,date,amount,amountGross,description,voucher(id,description)&count=20`);
  if (p6010.ok) {
    for (const p of p6010.data.values) {
      console.log(`  ${p.date}: ${p.amountGross} "${p.description}" (voucher: ${p.voucher?.description})`);
    }
  }

  console.log("\n=== V7: Postings on 1209 (accumulated depreciation) ===");
  const p1209 = await api("GET", `/ledger/posting?accountId=${accts[1209].id}&dateFrom=${DATE}&dateTo=2026-01-01&fields=id,date,amount,amountGross,description,voucher(id,description)&count=20`);
  if (p1209.ok) {
    for (const p of p1209.data.values) {
      console.log(`  ${p.date}: ${p.amountGross} "${p.description}" (voucher: ${p.voucher?.description})`);
    }
  }

  // CLEANUP
  console.log("\n=== CLEANUP ===");
  for (const vid of voucherIds.reverse()) {
    await api("DELETE", `/ledger/voucher/${vid}`);
  }
  console.log(`  Deleted ${voucherIds.length} vouchers`);
}

main().catch(e => { console.error(e); process.exit(1); });
