const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "fT7WmFQRxmKkH_knwR02RFrnTnRRw7RgywxukZZiAG0";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const YEAR = "2025";

const r2 = (v: number) => Math.round(v * 100) / 100;

// Depreciation calculations
const dep1 = r2(329750 / 4);   // Kontormaskiner = 82437.50
const dep2 = r2(217500 / 6);   // Inventar = 36250.00
const dep3 = r2(108950 / 9);   // Programvare = 12105.56

console.log("Depreciation:", dep1, dep2, dep3);

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = {
    method,
    headers: { "Authorization": AUTH, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  console.log(`${method} ${path} → ${res.status}`);
  if (res.status >= 400) {
    console.error("ERROR:", JSON.stringify(data).slice(0, 500));
    throw new Error(`${res.status} on ${method} ${path}`);
  }
  return data;
}

async function main() {
  // Phase 1: Account lookup
  const acctRes = await api("GET", "/ledger/account?number=1209,6010,1700,6300,8700,2920,8960,8990,2050&fields=id,number,name&count=20");
  const accounts: Record<number, { id: number; number: number; name: string }> = {};
  for (const a of (acctRes.values || [])) {
    accounts[a.number] = a;
  }
  console.log("Found accounts:", Object.keys(accounts).join(", "));

  // Determine prepaid contra from 1700 name
  const acct1700 = accounts[1700];
  let contraNumber = 6300; // default
  if (acct1700) {
    const name = acct1700.name.toLowerCase();
    if (name.includes("forsikring")) contraNumber = 7500;
    console.log(`Account 1700 name: "${acct1700.name}" → contra ${contraNumber}`);
  }

  // Phase 1b: Create missing accounts
  const needed = [1209, 6010, 1700, contraNumber, 8700, 2920, 8960, 8990, 2050];
  const missing: { number: number; name: string }[] = [];
  const nameMap: Record<number, string> = {
    1209: "Akkumulerte avskrivninger",
    8700: "Skattekostnad på ordinært resultat",
    6010: "Avskrivning",
    6300: "Leie lokale",
    7500: "Forsikringspremie",
    1700: "Forskuddsbetalt leiekostnad",
    2920: "Betalbar skatt",
    8960: "Overføringer annen egenkapital",
    8990: "Udekket tap",
    2050: "Annen egenkapital",
  };

  for (const n of needed) {
    if (!accounts[n]) missing.push({ number: n, name: nameMap[n] || `Konto ${n}` });
  }

  if (missing.length > 0) {
    console.log("Creating missing accounts:", missing.map(m => m.number).join(", "));
    if (missing.length === 1) {
      const created = await api("POST", "/ledger/account", missing[0]);
      accounts[created.value.number] = created.value;
    } else {
      const created = await api("POST", "/ledger/account/list", missing);
      for (const a of (created.values || [])) {
        accounts[a.number] = a;
      }
    }
  }

  const acctId = (n: number) => accounts[n]?.id;

  // Phase 2: Depreciation vouchers (3 separate) + prepaid reversal (1)
  const depEntries = [
    { name: "Kontormaskiner", amount: dep1 },
    { name: "Inventar", amount: dep2 },
    { name: "Programvare", amount: dep3 },
  ];

  for (const dep of depEntries) {
    await api("POST", "/ledger/voucher", {
      date: `${YEAR}-12-31`,
      description: `Avskrivning ${dep.name} ${YEAR}`,
      postings: [
        { row: 1, account: { id: acctId(6010) }, amountGross: dep.amount, amountGrossCurrency: dep.amount, description: `Avskrivning ${dep.name}` },
        { row: 2, account: { id: acctId(1209) }, amountGross: -dep.amount, amountGrossCurrency: -dep.amount, description: `Akk. avskrivning ${dep.name}` },
      ],
    });
  }

  // Prepaid expense reversal
  await api("POST", "/ledger/voucher", {
    date: `${YEAR}-12-31`,
    description: "Periodisering forskuddsbetalte kostnader",
    postings: [
      { row: 1, account: { id: acctId(contraNumber) }, amountGross: 45900, amountGrossCurrency: 45900, description: "Periodisering leiekostnad" },
      { row: 2, account: { id: acctId(1700) }, amountGross: -45900, amountGrossCurrency: -45900, description: "Forskuddsbetalte kostnader" },
    ],
  });

  // Phase 3: Balance sheet for tax (post-then-read)
  const bsRes = await api("GET", "/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=3000&accountNumberTo=8700&fields=*,account(id,number,name)&count=1000");
  const rows = bsRes.values || [];
  let sumBalanceOut = 0;
  for (const row of rows) {
    sumBalanceOut += row.balanceOut || 0;
  }
  const preTaxProfit = -(sumBalanceOut);
  const taxAmount = Math.round(Math.max(0, preTaxProfit) * 0.22);
  console.log(`Balance sheet sum: ${sumBalanceOut}, preTaxProfit: ${preTaxProfit}, taxAmount: ${taxAmount}`);

  // Phase 4: Tax voucher
  if (taxAmount > 0) {
    await api("POST", "/ledger/voucher", {
      date: `${YEAR}-12-31`,
      description: `Skattekostnad ${YEAR}`,
      postings: [
        { row: 1, account: { id: acctId(8700) }, amountGross: taxAmount, amountGrossCurrency: taxAmount, description: "Skattekostnad" },
        { row: 2, account: { id: acctId(2920) }, amountGross: -taxAmount, amountGrossCurrency: -taxAmount, description: "Betalbar skatt" },
      ],
    });
  }

  // Phase 5: Result disposition (MANDATORY)
  const postTaxResult = r2(preTaxProfit - taxAmount);
  console.log(`postTaxResult: ${postTaxResult}`);

  if (postTaxResult > 0) {
    // Profit: DR 8960, CR 2050
    await api("POST", "/ledger/voucher", {
      date: `${YEAR}-12-31`,
      description: `Disponering av årsresultat ${YEAR}`,
      postings: [
        { row: 1, account: { id: acctId(8960) }, amountGross: postTaxResult, amountGrossCurrency: postTaxResult, description: "Overføringer annen egenkapital" },
        { row: 2, account: { id: acctId(2050) }, amountGross: -postTaxResult, amountGrossCurrency: -postTaxResult, description: "Annen egenkapital" },
      ],
    });
  } else if (postTaxResult < 0) {
    // Loss: DR 2050, CR 8990
    const absResult = Math.abs(postTaxResult);
    await api("POST", "/ledger/voucher", {
      date: `${YEAR}-12-31`,
      description: `Disponering av årsresultat ${YEAR}`,
      postings: [
        { row: 1, account: { id: acctId(2050) }, amountGross: absResult, amountGrossCurrency: absResult, description: "Annen egenkapital" },
        { row: 2, account: { id: acctId(8990) }, amountGross: -absResult, amountGrossCurrency: -absResult, description: "Udekket tap" },
      ],
    });
  } else {
    console.log("Post-tax result is zero, skipping disposition voucher.");
  }

  console.log("DONE — year-end closing complete.");
}

main().catch(e => { console.error(e); process.exit(1); });
