const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "s8fAqk3ESVDVPDG6XbOyk9H4nQiKJLAwjIIEzPYuDQ0";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const YEAR = "2025";
const DATE = "2025-12-31";

const r2 = (v: number) => Math.round(v * 100) / 100;

// Depreciation calculations
const assets = [
  { name: "IT-utstyr", cost: 204150, life: 4, assetAcct: 1210 },
  { name: "Inventar", cost: 237550, life: 8, assetAcct: 1240 },
  { name: "Programvare", cost: 307500, life: 4, assetAcct: 1250 },
];
const deps = assets.map(a => ({ ...a, amount: r2(a.cost / a.life) }));
console.log("Depreciation amounts:", deps.map(d => `${d.name}: ${d.amount}`));

const PREPAID = 44300;

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
    console.error("ERROR:", typeof data === "string" ? data : JSON.stringify(data, null, 2));
    throw new Error(`${method} ${path} failed: ${res.status}`);
  }
  return data;
}

async function main() {
  // Phase 1: GET all needed accounts
  const acctNumbers = "1209,6010,1700,6300,7500,8300,2500,8800,2050";
  const acctRes = await api("GET", `/ledger/account?number=${acctNumbers}&fields=id,number,name&count=100`);
  const accts: Record<number, { id: number; name: string }> = {};
  for (const a of acctRes.values) {
    accts[a.number] = { id: a.id, name: a.name };
  }
  console.log("Found accounts:", Object.keys(accts).map(Number).sort((a, b) => a - b).join(", "));

  // Determine prepaid contra from 1700 name
  let contraAcct = 6300; // default
  if (accts[1700]) {
    const name1700 = accts[1700].name.toLowerCase();
    if (name1700.includes("forsikring")) contraAcct = 7500;
    console.log(`Account 1700 name: "${accts[1700].name}" → contra: ${contraAcct}`);
  }

  // Phase 1b: Create missing accounts
  const needed = [1209, 6010, 1700, contraAcct, 8300, 2500, 8800, 2050];
  const missing = needed.filter(n => !accts[n]);
  console.log("Missing accounts:", missing.length > 0 ? missing.join(", ") : "none");

  if (missing.length === 1) {
    const nameMap: Record<number, string> = { 1209: "Akkumulerte avskrivninger" };
    const created = await api("POST", "/ledger/account", { number: missing[0], name: nameMap[missing[0]] || `Account ${missing[0]}` });
    accts[missing[0]] = { id: created.value.id, name: created.value.name };
  } else if (missing.length > 1) {
    const nameMap: Record<number, string> = { 1209: "Akkumulerte avskrivninger" };
    const batch = missing.map(n => ({ number: n, name: nameMap[n] || `Account ${n}` }));
    const created = await api("POST", "/ledger/account/list", batch);
    for (const a of created.values) {
      accts[a.number] = { id: a.id, name: a.name };
    }
  }

  const depCostId = accts[6010].id;
  const accumDepId = accts[1209].id;

  // Phase 2: Post 3 depreciation vouchers + 1 prepaid reversal
  for (const d of deps) {
    await api("POST", "/ledger/voucher", {
      date: DATE,
      description: `Avskrivning ${d.name} ${YEAR}`,
      postings: [
        { row: 1, account: { id: depCostId }, amountGross: d.amount, amountGrossCurrency: d.amount, description: `Avskrivning ${d.name}` },
        { row: 2, account: { id: accumDepId }, amountGross: -d.amount, amountGrossCurrency: -d.amount, description: `Akk. avskrivning ${d.name}` },
      ],
    });
  }

  // Prepaid reversal
  await api("POST", "/ledger/voucher", {
    date: DATE,
    description: "Periodisering forskuddsbetalte kostnader",
    postings: [
      { row: 1, account: { id: accts[contraAcct].id }, amountGross: PREPAID, amountGrossCurrency: PREPAID, description: "Periodisering leiekostnad" },
      { row: 2, account: { id: accts[1700].id }, amountGross: -PREPAID, amountGrossCurrency: -PREPAID, description: "Forskuddsbetalte kostnader" },
    ],
  });

  // Phase 3: Balance sheet for tax calculation (post-then-read)
  const bsRes = await api("GET", `/balanceSheet?dateFrom=${YEAR}-01-01&dateTo=2026-01-01&accountNumberFrom=3000&accountNumberTo=8299&fields=*,account(id,number,name)&count=1000`);
  let sumBalanceOut = 0;
  for (const row of bsRes.values) {
    sumBalanceOut += row.balanceOut || 0;
  }
  const preTaxProfit = r2(-sumBalanceOut);
  console.log(`Pre-tax profit: ${preTaxProfit} (sumBalanceOut: ${sumBalanceOut})`);

  const taxAmount = Math.round(Math.max(0, preTaxProfit) * 0.22);
  console.log(`Tax amount (22%): ${taxAmount}`);

  // Phase 4: Tax voucher (only if taxAmount > 0)
  if (taxAmount > 0) {
    await api("POST", "/ledger/voucher", {
      date: DATE,
      description: `Skattekostnad ${YEAR}`,
      postings: [
        { row: 1, account: { id: accts[8300].id }, amountGross: taxAmount, amountGrossCurrency: taxAmount, description: "Skattekostnad" },
        { row: 2, account: { id: accts[2500].id }, amountGross: -taxAmount, amountGrossCurrency: -taxAmount, description: "Betalbar skatt" },
      ],
    });
  }

  // Phase 5: Result disposition (mandatory)
  const postTaxResult = r2(preTaxProfit - taxAmount);
  console.log(`Post-tax result: ${postTaxResult}`);

  if (postTaxResult > 0) {
    await api("POST", "/ledger/voucher", {
      date: DATE,
      description: `Disponering av årsresultat ${YEAR}`,
      postings: [
        { row: 1, account: { id: accts[8800].id }, amountGross: postTaxResult, amountGrossCurrency: postTaxResult, description: "Årsresultat" },
        { row: 2, account: { id: accts[2050].id }, amountGross: -postTaxResult, amountGrossCurrency: -postTaxResult, description: "Annen egenkapital" },
      ],
    });
  } else if (postTaxResult < 0) {
    await api("POST", "/ledger/voucher", {
      date: DATE,
      description: `Disponering av årsresultat ${YEAR}`,
      postings: [
        { row: 1, account: { id: accts[2050].id }, amountGross: Math.abs(postTaxResult), amountGrossCurrency: Math.abs(postTaxResult), description: "Annen egenkapital" },
        { row: 2, account: { id: accts[8800].id }, amountGross: -Math.abs(postTaxResult), amountGrossCurrency: -Math.abs(postTaxResult), description: "Årsresultat" },
      ],
    });
  } else {
    console.log("Post-tax result is zero, skipping disposition voucher.");
  }

  console.log("\nDone. Year-end closing complete.");
}

main().catch(e => { console.error(e); process.exit(1); });
