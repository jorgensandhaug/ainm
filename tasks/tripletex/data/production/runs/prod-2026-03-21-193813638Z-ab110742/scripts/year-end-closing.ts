const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "NUP_VQFhq8LyzVPvrpUfd-HNp-qgMk310SQFJA4Zhto";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const r2 = (v: number) => Math.round(v * 100) / 100;

// Depreciation calculations
const assets = [
  { name: "Programvare", cost: 111950, life: 9, acct: 1250 },
  { name: "Kontormaskiner", cost: 351450, life: 9, acct: 1200 },
  { name: "Inventar", cost: 418800, life: 10, acct: 1240 },
];
const deps = assets.map(a => ({ ...a, dep: r2(a.cost / a.life) }));
console.log("Depreciation amounts:", deps.map(d => `${d.name}: ${d.dep}`));

const PREPAID = 79750;
const YEAR = 2025;

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
    console.error("ERROR:", JSON.stringify(data).slice(0, 500));
    throw new Error(`${res.status} ${method} ${path}`);
  }
  return data;
}

async function main() {
  // Phase 1: Account lookup
  const acctRes = await api("GET", "/ledger/account?number=1209,6010,1700,6300,8700,2920&fields=id,number,name&count=100");
  const accounts: Record<number, { id: number; number: number; name: string }> = {};
  for (const a of acctRes.values || []) {
    accounts[a.number] = a;
  }
  console.log("Found accounts:", Object.keys(accounts).map(Number));

  // Check account 1700 name for prepaid contra mapping
  const acct1700 = accounts[1700];
  let contraNumber = 6300; // default
  if (acct1700) {
    console.log("Account 1700 name:", acct1700.name);
    if (acct1700.name?.includes("forsikring")) contraNumber = 7500;
  }
  console.log("Prepaid contra account:", contraNumber);

  // Phase 1b: Create missing accounts
  const needed = [1209, 6010, 1700, contraNumber, 8700, 2920];
  const missing = needed.filter(n => !accounts[n]);
  console.log("Missing accounts:", missing);

  const nameMap: Record<number, string> = {
    1209: "Akkumulerte avskrivninger",
    8700: "Skattekostnad på ordinært resultat",
    6010: "Avskrivninger",
    1700: "Forskuddsbetalt leiekostnad",
    6300: "Leie lokale",
    7500: "Forsikringspremie",
    2920: "Betalbar skatt",
  };

  if (missing.length > 0) {
    if (missing.length === 1) {
      const n = missing[0];
      const created = await api("POST", "/ledger/account", { number: n, name: nameMap[n] || `Account ${n}` });
      accounts[n] = created.value;
    } else {
      const batch = missing.map(n => ({ number: n, name: nameMap[n] || `Account ${n}` }));
      const created = await api("POST", "/ledger/account/list", batch);
      for (const a of created.values || []) {
        accounts[a.number] = a;
      }
    }
  }

  const depCostId = accounts[6010].id;
  const accumDepId = accounts[1209].id;
  const prepaidId = accounts[1700].id;
  const contraId = accounts[contraNumber].id;
  const taxExpId = accounts[8700].id;
  const taxPayId = accounts[2920].id;

  // Phase 2: Depreciation vouchers (3 separate POSTs)
  for (const d of deps) {
    await api("POST", "/ledger/voucher", {
      date: `${YEAR}-12-31`,
      description: `Avskrivning ${d.name} ${YEAR}`,
      postings: [
        { row: 1, account: { id: depCostId }, amountGross: d.dep, amountGrossCurrency: d.dep, description: `Avskrivning ${d.name}` },
        { row: 2, account: { id: accumDepId }, amountGross: -d.dep, amountGrossCurrency: -d.dep, description: `Akk. avskrivning ${d.name}` },
      ],
    });
  }

  // Phase 2b: Prepaid expense reversal
  await api("POST", "/ledger/voucher", {
    date: `${YEAR}-12-31`,
    description: "Periodisering forskuddsbetalte kostnader",
    postings: [
      { row: 1, account: { id: contraId }, amountGross: PREPAID, amountGrossCurrency: PREPAID, description: "Periodisering leiekostnad" },
      { row: 2, account: { id: prepaidId }, amountGross: -PREPAID, amountGrossCurrency: -PREPAID, description: "Forskuddsbetalte kostnader" },
    ],
  });

  // Phase 3: Balance sheet for tax calculation
  const bs = await api("GET", `/balanceSheet?dateFrom=${YEAR}-01-01&dateTo=${YEAR + 1}-01-01&accountNumberFrom=3000&accountNumberTo=8700&fields=*,account(id,number,name)&count=1000`);
  let sumBalanceOut = 0;
  for (const row of bs.values || []) {
    sumBalanceOut += row.balanceOut || 0;
  }
  const preTaxProfit = -sumBalanceOut;
  const taxAmount = Math.round(Math.max(0, preTaxProfit) * 0.22);
  console.log(`Balance sheet sum: ${sumBalanceOut}, preTaxProfit: ${preTaxProfit}, taxAmount: ${taxAmount}`);

  // Phase 4: Tax voucher
  if (taxAmount > 0) {
    await api("POST", "/ledger/voucher", {
      date: `${YEAR}-12-31`,
      description: `Skattekostnad ${YEAR}`,
      postings: [
        { row: 1, account: { id: taxExpId }, amountGross: taxAmount, amountGrossCurrency: taxAmount, description: "Skattekostnad" },
        { row: 2, account: { id: taxPayId }, amountGross: -taxAmount, amountGrossCurrency: -taxAmount, description: "Betalbar skatt" },
      ],
    });
  } else {
    console.log("No tax voucher needed (taxAmount <= 0)");
  }

  console.log("DONE — year-end closing complete");
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
