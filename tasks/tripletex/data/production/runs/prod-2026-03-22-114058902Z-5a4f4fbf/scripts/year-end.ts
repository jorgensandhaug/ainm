const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "kzOSKeG2PVrWKuoXk2ANwspNz3EZ7wavZ-u1_EpmCxQ";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const r2 = (v: number) => Math.round(v * 100) / 100;

const dep1 = r2(170000 / 4);   // Inventar: 42500.00
const dep2 = r2(176500 / 5);   // Kontormaskiner: 35300.00
const dep3 = r2(360100 / 9);   // IT-utstyr: 40011.11

const PREPAID = 59500;
const YEAR = 2025;

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = {
    method,
    headers: { "Authorization": AUTH, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok && res.status !== 409) {
    console.error(`${method} ${path} → ${res.status}`, JSON.stringify(data).slice(0, 300));
  } else {
    console.log(`${method} ${path} → ${res.status}`);
  }
  return { status: res.status, data };
}

async function main() {
  console.log("=== Depreciation amounts ===");
  console.log(`Inventar: ${dep1}, Kontormaskiner: ${dep2}, IT-utstyr: ${dep3}`);
  console.log(`Total dep: ${r2(dep1 + dep2 + dep3)}`);

  // Phase 0: Module activation
  console.log("\n=== Phase 0: Module Activation ===");
  const mod = await api("POST", "/company/salesmodules", { name: "YEAR_END_REPORTING_AS" });
  console.log("Module:", mod.status === 201 ? "activated" : mod.status === 409 ? "already active" : `other(${mod.status})`);

  // Phase 0b: Baseline yearEnd
  const yeBaseline = await api("GET", `/yearEnd?year=${YEAR}&fields=*`);
  if (yeBaseline.data?.value) {
    const ye = yeBaseline.data.value;
    console.log("Baseline yearEnd:", JSON.stringify({ status: ye.status, annualResult: ye.annualResult, taxCost: ye.taxCost, operatingExpense: ye.operatingExpense }));
  }

  // Phase 0c: Module verification
  const modules = await api("GET", "/company/modules?fields=*");
  if (modules.data?.value) {
    const m = modules.data.value;
    const trueFlags = Object.entries(m).filter(([, v]) => v === true).map(([k]) => k);
    console.log("True module flags:", trueFlags.join(", "));
  }

  // Phase 1: Account lookup
  console.log("\n=== Phase 1: Account Lookup ===");
  const acctRes = await api("GET", "/ledger/account?number=1209,6010,1700,6300,7500,8700,2920,8800,2050&fields=id,number,name");
  const accounts: Record<number, { id: number; number: number; name: string }> = {};
  if (acctRes.data?.values) {
    for (const a of acctRes.data.values) {
      accounts[a.number] = a;
      console.log(`  ${a.number}: ${a.name} (id=${a.id})`);
    }
  }

  // Phase 1b: Create missing accounts
  const needed = [1209, 6010, 1700, 6300, 7500, 8700, 2920, 8800, 2050];
  const missing = needed.filter(n => !accounts[n]);
  if (missing.length > 0) {
    console.log(`\nCreating missing accounts: ${missing.join(", ")}`);
    const nameMap: Record<number, string> = { 1209: "Akkumulerte avskrivninger" };
    if (missing.length === 1) {
      const n = missing[0];
      const created = await api("POST", "/ledger/account", { number: n, name: nameMap[n] || `Account ${n}` });
      if (created.data?.value) accounts[n] = created.data.value;
    } else {
      const batch = missing.map(n => ({ number: n, name: nameMap[n] || `Account ${n}` }));
      const created = await api("POST", "/ledger/account/list", batch);
      if (created.data?.values) {
        for (const a of created.data.values) accounts[a.number] = a;
      }
    }
  }

  // Determine prepaid contra
  const acct1700 = accounts[1700];
  let contraNum = 6300;
  if (acct1700?.name?.toLowerCase().includes("forsikring")) contraNum = 7500;
  console.log(`\n1700 name: "${acct1700?.name}" → contra: ${contraNum}`);

  const depCostId = accounts[6010].id;
  const accumDepId = accounts[1209].id;
  const contraId = accounts[contraNum].id;
  const prepaidId = accounts[1700].id;
  const taxExpId = accounts[8700].id;
  const taxPayId = accounts[2920].id;
  const resultId = accounts[8800].id;
  const equityId = accounts[2050].id;

  // Phase 2: Depreciation vouchers (3 separate)
  console.log("\n=== Phase 2: Depreciation Vouchers ===");
  const depItems = [
    { name: "Inventar", amount: dep1 },
    { name: "Kontormaskiner", amount: dep2 },
    { name: "IT-utstyr", amount: dep3 },
  ];

  for (const item of depItems) {
    const v = await api("POST", "/ledger/voucher", {
      date: `${YEAR}-12-31`,
      description: `Avskrivning ${item.name} ${YEAR}`,
      postings: [
        { row: 1, account: { id: depCostId }, amountGross: item.amount, amountGrossCurrency: item.amount, description: `Avskrivning ${item.name}` },
        { row: 2, account: { id: accumDepId }, amountGross: -item.amount, amountGrossCurrency: -item.amount, description: `Akk. avskrivning ${item.name}` },
      ],
    });
    if (v.data?.value?.id) {
      const verify = await api("GET", `/ledger/voucher/${v.data.value.id}?fields=id,number,date,description,postings(row,account(id,number,name),amountGross,amount)`);
      const ps = verify.data?.value?.postings;
      if (ps) console.log(`  ${item.name}:`, ps.map((p: any) => `row${p.row} ${p.account?.number} ${p.amountGross}`).join(" | "));
    }
  }

  // Prepaid expense reversal
  console.log("\n=== Phase 2b: Prepaid Reversal ===");
  const prepV = await api("POST", "/ledger/voucher", {
    date: `${YEAR}-12-31`,
    description: "Periodisering forskuddsbetalte kostnader",
    postings: [
      { row: 1, account: { id: contraId }, amountGross: PREPAID, amountGrossCurrency: PREPAID, description: `Periodisering ${contraNum === 7500 ? "forsikringspremie" : "leiekostnad"}` },
      { row: 2, account: { id: prepaidId }, amountGross: -PREPAID, amountGrossCurrency: -PREPAID, description: "Forskuddsbetalte kostnader" },
    ],
  });
  if (prepV.data?.value?.id) {
    const verify = await api("GET", `/ledger/voucher/${prepV.data.value.id}?fields=id,number,date,description,postings(row,account(id,number,name),amountGross,amount)`);
    const ps = verify.data?.value?.postings;
    if (ps) console.log(`  Prepaid:`, ps.map((p: any) => `row${p.row} ${p.account?.number} ${p.amountGross}`).join(" | "));
  }

  // Phase 3: Balance sheet for tax calculation
  console.log("\n=== Phase 3: Balance Sheet (tax calc) ===");
  const bs = await api("GET", `/balanceSheet?dateFrom=${YEAR}-01-01&dateTo=${YEAR + 1}-01-01&accountNumberFrom=3000&accountNumberTo=8299&fields=*,account(id,number,name)&count=1000`);
  let sumBalanceOut = 0;
  if (bs.data?.values) {
    for (const row of bs.data.values) {
      if (row.balanceOut !== 0) {
        console.log(`  ${row.account.number} ${row.account.name}: ${row.balanceOut}`);
        sumBalanceOut += row.balanceOut;
      }
    }
  }
  sumBalanceOut = r2(sumBalanceOut);
  const preTaxProfit = r2(-sumBalanceOut);
  const taxAmount = Math.round(Math.max(0, preTaxProfit) * 0.22);
  console.log(`\nsumBalanceOut=${sumBalanceOut}, preTaxProfit=${preTaxProfit}, taxAmount=${taxAmount}`);

  // Phase 4: Tax voucher
  if (taxAmount > 0) {
    console.log("\n=== Phase 4: Tax Voucher ===");
    const tv = await api("POST", "/ledger/voucher", {
      date: `${YEAR}-12-31`,
      description: `Skattekostnad ${YEAR}`,
      postings: [
        { row: 1, account: { id: taxExpId }, amountGross: taxAmount, amountGrossCurrency: taxAmount, description: "Skattekostnad" },
        { row: 2, account: { id: taxPayId }, amountGross: -taxAmount, amountGrossCurrency: -taxAmount, description: "Betalbar skatt" },
      ],
    });
    if (tv.data?.value?.id) {
      const verify = await api("GET", `/ledger/voucher/${tv.data.value.id}?fields=id,number,date,description,postings(row,account(id,number,name),amountGross,amount)`);
      const ps = verify.data?.value?.postings;
      if (ps) console.log(`  Tax:`, ps.map((p: any) => `row${p.row} ${p.account?.number} ${p.amountGross}`).join(" | "));
    }
  } else {
    console.log("\n=== Phase 4: Skipped (no tax on loss/zero) ===");
  }

  // Phase 5: Result disposition
  const postTaxResult = r2(preTaxProfit - taxAmount);
  console.log(`\npostTaxResult=${postTaxResult}`);

  if (postTaxResult !== 0) {
    console.log("\n=== Phase 5: Result Disposition ===");
    let postings;
    if (postTaxResult > 0) {
      postings = [
        { row: 1, account: { id: resultId }, amountGross: postTaxResult, amountGrossCurrency: postTaxResult, description: "Årsresultat" },
        { row: 2, account: { id: equityId }, amountGross: -postTaxResult, amountGrossCurrency: -postTaxResult, description: "Annen egenkapital" },
      ];
    } else {
      const abs = Math.abs(postTaxResult);
      postings = [
        { row: 1, account: { id: equityId }, amountGross: abs, amountGrossCurrency: abs, description: "Annen egenkapital" },
        { row: 2, account: { id: resultId }, amountGross: -abs, amountGrossCurrency: -abs, description: "Årsresultat" },
      ];
    }
    const dv = await api("POST", "/ledger/voucher", {
      date: `${YEAR}-12-31`,
      description: `Disponering av årsresultat ${YEAR}`,
      postings,
    });
    if (dv.data?.value?.id) {
      const verify = await api("GET", `/ledger/voucher/${dv.data.value.id}?fields=id,number,date,description,postings(row,account(id,number,name),amountGross,amount)`);
      const ps = verify.data?.value?.postings;
      if (ps) console.log(`  Disposition:`, ps.map((p: any) => `row${p.row} ${p.account?.number} ${p.amountGross}`).join(" | "));
    }
  } else {
    console.log("\n=== Phase 5: Skipped (zero result) ===");
  }

  // Phase 6: Final verification
  console.log("\n=== Phase 6: Final Verification ===");
  const yeFinal = await api("GET", `/yearEnd?year=${YEAR}&fields=*`);
  if (yeFinal.data?.value) {
    console.log("Final yearEnd:", JSON.stringify(yeFinal.data.value, null, 2));
  }

  const bsFinal = await api("GET", `/balanceSheet?dateFrom=${YEAR}-01-01&dateTo=${YEAR + 1}-01-01&accountNumberFrom=1000&accountNumberTo=9999&fields=account(number,name),balanceOut&count=2000`);
  if (bsFinal.data?.values) {
    console.log("\nFinal balance (non-zero balanceOut):");
    for (const row of bsFinal.data.values) {
      if (row.balanceOut !== 0) console.log(`  ${row.account.number} ${row.account.name}: ${row.balanceOut}`);
    }
  }

  const vFinal = await api("GET", `/ledger/voucher?dateFrom=${YEAR}-12-31&dateTo=${YEAR + 1}-01-01&fields=id,number,date,description,postings(row,account(number,name),amountGross)&count=50`);
  if (vFinal.data?.values) {
    console.log("\nAll year-end vouchers:");
    for (const v of vFinal.data.values) {
      console.log(`  #${v.number} ${v.description}:`, v.postings?.map((p: any) => `row${p.row} ${p.account?.number} ${p.amountGross}`).join(" | "));
    }
  }

  console.log("\n=== DONE ===");
}

main().catch(console.error);
