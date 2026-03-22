const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "iELiXSn2FFMwpa4ncwk7bmyvQsdJ_4M4PBouXj9Wvj0";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const YEAR = 2025;
const r2 = (v: number) => Math.round(v * 100) / 100;

const h = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: h };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} → ${res.status}`);
  if (res.status >= 400) console.log("  ERROR:", JSON.stringify(json).slice(0, 500));
  return { status: res.status, data: json };
}

// Depreciation calculations
const dep1 = r2(382900 / 5);  // IT-utstyr
const dep2 = r2(436000 / 10); // Programvare
const dep3 = r2(384600 / 5);  // Inventar
console.log(`Depreciation: IT=${dep1}, Programvare=${dep2}, Inventar=${dep3}`);

async function main() {
  // === Phase 0: Module Activation + Baseline ===
  const mod = await api("POST", "/company/salesmodules", { name: "YEAR_END_REPORTING_AS" });
  console.log("Module activation:", mod.status);

  const yeBaseline = await api("GET", `/yearEnd?year=${YEAR}&fields=*`);
  if (yeBaseline.data?.value) {
    const v = yeBaseline.data.value;
    console.log("Baseline yearEnd:", JSON.stringify({ status: v.status, annualResult: v.annualResult, taxCost: v.taxCost, operatingExpense: v.operatingExpense, yearEndReportPosting: v.yearEndReportPosting }).slice(0, 500));
  }

  const modules = await api("GET", "/company/modules?fields=*");
  if (modules.data?.value) {
    const flags = Object.entries(modules.data.value).filter(([_, v]) => v === true).map(([k]) => k);
    console.log("Active modules:", flags.join(", "));
  }

  // === Phase 1: Account lookup ===
  const acctRes = await api("GET", "/ledger/account?number=1209,6010,1700,6300,7500,8700,2920,8800,2050&fields=id,number,name");
  const accts: Record<number, { id: number; number: number; name: string }> = {};
  for (const a of acctRes.data?.values || []) {
    accts[a.number] = a;
    console.log(`  Account ${a.number}: ${a.name} (id=${a.id})`);
  }

  // Determine prepaid contra from 1700 name
  const acct1700Name = accts[1700]?.name || "";
  let contraNumber = 6300; // default
  if (acct1700Name.toLowerCase().includes("forsikring")) contraNumber = 7500;
  console.log(`Prepaid contra: ${contraNumber} (1700 name="${acct1700Name}")`);

  // === Phase 1b: Create missing accounts ===
  const needed = [1209, 6010, 1700, contraNumber, 8700, 2920, 8800, 2050];
  const missing = needed.filter(n => !accts[n]);
  console.log("Missing accounts:", missing);

  if (missing.length === 1) {
    const names: Record<number, string> = { 1209: "Akkumulerte avskrivninger" };
    const cr = await api("POST", "/ledger/account", { number: missing[0], name: names[missing[0]] || `Account ${missing[0]}` });
    if (cr.data?.value) accts[missing[0]] = cr.data.value;
  } else if (missing.length > 1) {
    const names: Record<number, string> = { 1209: "Akkumulerte avskrivninger" };
    const batch = missing.map(n => ({ number: n, name: names[n] || `Account ${n}` }));
    const cr = await api("POST", "/ledger/account/list", batch);
    for (const a of cr.data?.values || []) accts[a.number] = a;
  }

  // Verify all accounts resolved
  for (const n of needed) {
    if (!accts[n]) { console.error(`FATAL: account ${n} not resolved`); return; }
  }

  // === Phase 2: Depreciation + Prepaid vouchers ===
  const depItems = [
    { name: "IT-utstyr", amount: dep1 },
    { name: "Programvare", amount: dep2 },
    { name: "Inventar", amount: dep3 },
  ];

  const voucherIds: number[] = [];

  for (const item of depItems) {
    const v = await api("POST", "/ledger/voucher", {
      date: `${YEAR}-12-31`,
      description: `Avskrivning ${item.name} ${YEAR}`,
      postings: [
        { row: 1, account: { id: accts[6010].id }, amountGross: item.amount, amountGrossCurrency: item.amount, description: `Avskrivning ${item.name}` },
        { row: 2, account: { id: accts[1209].id }, amountGross: -item.amount, amountGrossCurrency: -item.amount, description: `Akk. avskrivning ${item.name}` },
      ],
    });
    const vid = v.data?.value?.id;
    if (vid) {
      voucherIds.push(vid);
      const ver = await api("GET", `/ledger/voucher/${vid}?fields=id,number,date,description,postings(row,account(id,number,name),amountGross,amount)`);
      console.log(`  Voucher ${vid}:`, JSON.stringify(ver.data?.value?.postings?.map((p: any) => `${p.account?.number} ${p.amountGross}`)));
    }
  }

  // Prepaid reversal
  const prepaid = await api("POST", "/ledger/voucher", {
    date: `${YEAR}-12-31`,
    description: "Periodisering forskuddsbetalte kostnader",
    postings: [
      { row: 1, account: { id: accts[contraNumber].id }, amountGross: 52850, amountGrossCurrency: 52850, description: "Periodisering leiekostnad" },
      { row: 2, account: { id: accts[1700].id }, amountGross: -52850, amountGrossCurrency: -52850, description: "Forskuddsbetalte kostnader" },
    ],
  });
  const ppid = prepaid.data?.value?.id;
  if (ppid) {
    voucherIds.push(ppid);
    const ver = await api("GET", `/ledger/voucher/${ppid}?fields=id,number,date,description,postings(row,account(id,number,name),amountGross,amount)`);
    console.log(`  Prepaid voucher ${ppid}:`, JSON.stringify(ver.data?.value?.postings?.map((p: any) => `${p.account?.number} ${p.amountGross}`)));
  }

  // === Phase 3: Balance sheet for tax ===
  const bs = await api("GET", `/balanceSheet?dateFrom=${YEAR}-01-01&dateTo=${YEAR + 1}-01-01&accountNumberFrom=3000&accountNumberTo=8299&fields=*,account(id,number,name)&count=1000`);
  let sumBalanceOut = 0;
  for (const row of bs.data?.values || []) {
    if (row.balanceOut && row.balanceOut !== 0) {
      console.log(`  BS: ${row.account?.number} ${row.account?.name}: balanceOut=${row.balanceOut}`);
      sumBalanceOut += row.balanceOut;
    }
  }
  const preTaxProfit = -(sumBalanceOut);
  const taxAmount = Math.round(Math.max(0, preTaxProfit) * 0.22);
  console.log(`sumBalanceOut=${sumBalanceOut}, preTaxProfit=${preTaxProfit}, taxAmount=${taxAmount}`);

  // === Phase 4: Tax voucher ===
  if (taxAmount > 0) {
    const tv = await api("POST", "/ledger/voucher", {
      date: `${YEAR}-12-31`,
      description: `Skattekostnad ${YEAR}`,
      postings: [
        { row: 1, account: { id: accts[8700].id }, amountGross: taxAmount, amountGrossCurrency: taxAmount, description: "Skattekostnad" },
        { row: 2, account: { id: accts[2920].id }, amountGross: -taxAmount, amountGrossCurrency: -taxAmount, description: "Betalbar skatt" },
      ],
    });
    const tvid = tv.data?.value?.id;
    if (tvid) {
      voucherIds.push(tvid);
      const ver = await api("GET", `/ledger/voucher/${tvid}?fields=id,number,date,description,postings(row,account(id,number,name),amountGross,amount)`);
      console.log(`  Tax voucher ${tvid}:`, JSON.stringify(ver.data?.value?.postings?.map((p: any) => `${p.account?.number} ${p.amountGross}`)));
    }
  } else {
    console.log("No tax (preTaxProfit <= 0), skipping tax voucher");
  }

  // === Phase 5: Result disposition ===
  const postTaxResult = r2(preTaxProfit - taxAmount);
  console.log(`postTaxResult=${postTaxResult}`);

  if (postTaxResult !== 0) {
    const isProfit = postTaxResult > 0;
    const absVal = Math.abs(postTaxResult);
    const disp = await api("POST", "/ledger/voucher", {
      date: `${YEAR}-12-31`,
      description: `Disponering av årsresultat ${YEAR}`,
      postings: isProfit ? [
        { row: 1, account: { id: accts[8800].id }, amountGross: absVal, amountGrossCurrency: absVal, description: "Årsresultat" },
        { row: 2, account: { id: accts[2050].id }, amountGross: -absVal, amountGrossCurrency: -absVal, description: "Annen egenkapital" },
      ] : [
        { row: 1, account: { id: accts[2050].id }, amountGross: absVal, amountGrossCurrency: absVal, description: "Annen egenkapital" },
        { row: 2, account: { id: accts[8800].id }, amountGross: -absVal, amountGrossCurrency: -absVal, description: "Årsresultat" },
      ],
    });
    const did = disp.data?.value?.id;
    if (did) {
      voucherIds.push(did);
      console.log(`  Disposition voucher ${did}`);
    }
  }

  // === Phase 6: Final state verification ===
  const yeFinal = await api("GET", `/yearEnd?year=${YEAR}&fields=*`);
  if (yeFinal.data?.value) {
    const v = yeFinal.data.value;
    console.log("Final yearEnd:", JSON.stringify(v).slice(0, 1000));
  }

  const bsFinal = await api("GET", `/balanceSheet?dateFrom=${YEAR}-01-01&dateTo=${YEAR + 1}-01-01&accountNumberFrom=1000&accountNumberTo=9999&fields=account(number,name),balanceOut&count=2000`);
  console.log("Final balance sheet (non-zero):");
  for (const row of bsFinal.data?.values || []) {
    if (row.balanceOut && row.balanceOut !== 0) {
      console.log(`  ${row.account?.number} ${row.account?.name}: ${row.balanceOut}`);
    }
  }

  const vFinal = await api("GET", `/ledger/voucher?dateFrom=${YEAR}-12-31&dateTo=${YEAR + 1}-01-01&fields=id,number,date,description,postings(row,account(number,name),amountGross)&count=50`);
  console.log("Final vouchers:");
  for (const v of vFinal.data?.values || []) {
    console.log(`  #${v.number} "${v.description}":`, v.postings?.map((p: any) => `${p.account?.number}=${p.amountGross}`).join(", "));
  }

  console.log(`\nDone. Total vouchers created: ${voucherIds.length}`);
}

main().catch(e => console.error("FATAL:", e));
