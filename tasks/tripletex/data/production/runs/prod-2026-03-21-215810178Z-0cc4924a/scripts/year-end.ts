const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "z-Jcuu3O2MxhjtQAXD8qH3LMecQebEqkG1bku4GwgbI";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);

const r2 = (v: number) => Math.round(v * 100) / 100;

// Depreciation calculations (2-decimal rounding)
const dep1 = r2(156100 / 6);   // Programvare
const dep2 = r2(168250 / 10);  // IT-utstyr
const dep3 = r2(321800 / 6);   // Kontormaskiner

console.log("Depreciation amounts:", dep1, dep2, dep3);

const PREPAID = 69150;

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: RequestInit = {
    method,
    headers: { "Authorization": AUTH, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  console.log(`${method} ${path} → ${res.status}`);
  if (!res.ok) {
    console.log("ERROR:", JSON.stringify(data).slice(0, 500));
    throw new Error(`${res.status} ${method} ${path}`);
  }
  return data;
}

async function main() {
  // Phase 1: Account lookup
  const acctRes = await api("GET", "/ledger/account?number=1209,6010,1700,6300,8700,2920,8800,2050&fields=id,number,name&count=100");
  const accts = acctRes.values as { id: number; number: number; name: string }[];
  const acctMap = new Map<number, number>();
  for (const a of accts) {
    acctMap.set(a.number, a.id);
    if (a.number === 1700) console.log("Account 1700 name:", a.name);
  }
  console.log("Found accounts:", [...acctMap.keys()].sort().join(", "));

  // Phase 1b: Create missing accounts
  const missing: { number: number; name: string }[] = [];
  if (!acctMap.has(1209)) missing.push({ number: 1209, name: "Akkumulerte avskrivninger" });
  if (!acctMap.has(8700)) missing.push({ number: 8700, name: "Skattekostnad på ordinært resultat" });
  // Also check 8800 and 2050 just in case
  if (!acctMap.has(8800)) missing.push({ number: 8800, name: "Årsresultat" });
  if (!acctMap.has(2050)) missing.push({ number: 2050, name: "Annen egenkapital" });

  if (missing.length > 0) {
    console.log("Creating missing accounts:", missing.map(m => m.number).join(", "));
    if (missing.length === 1) {
      const created = await api("POST", "/ledger/account", missing[0]);
      acctMap.set(created.value.number, created.value.id);
    } else {
      const created = await api("POST", "/ledger/account/list", missing);
      for (const a of created.values) {
        acctMap.set(a.number, a.id);
      }
    }
  }

  // Resolve all account IDs
  const id = (n: number) => {
    const i = acctMap.get(n);
    if (!i) throw new Error(`Account ${n} not found`);
    return i;
  };

  // Determine prepaid contra account (default 6300)
  const contraId = id(6300);

  // Phase 2: Depreciation vouchers (3 separate)
  const assets = [
    { name: "Programvare", amount: dep1 },
    { name: "IT-utstyr", amount: dep2 },
    { name: "Kontormaskiner", amount: dep3 },
  ];

  for (const asset of assets) {
    await api("POST", "/ledger/voucher", {
      date: "2025-12-31",
      description: `Avskrivning ${asset.name} 2025`,
      postings: [
        { row: 1, account: { id: id(6010) }, amountGross: asset.amount, amountGrossCurrency: asset.amount, description: `Avskrivning ${asset.name}` },
        { row: 2, account: { id: id(1209) }, amountGross: -asset.amount, amountGrossCurrency: -asset.amount, description: `Akk. avskrivning ${asset.name}` },
      ],
    });
  }

  // Phase 2b: Prepaid expense reversal
  await api("POST", "/ledger/voucher", {
    date: "2025-12-31",
    description: "Periodisering forskuddsbetalte kostnader",
    postings: [
      { row: 1, account: { id: contraId }, amountGross: PREPAID, amountGrossCurrency: PREPAID, description: "Periodisering leiekostnad" },
      { row: 2, account: { id: id(1700) }, amountGross: -PREPAID, amountGrossCurrency: -PREPAID, description: "Forskuddsbetalte kostnader" },
    ],
  });

  // Phase 3: Balance sheet for tax calculation (post-then-read)
  const bsRes = await api("GET", "/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=3000&accountNumberTo=8700&fields=*,account(id,number,name)&count=1000");
  const bsRows = bsRes.values as { balanceOut: number; account: { number: number } }[];
  let sumBalanceOut = 0;
  for (const row of bsRows) {
    sumBalanceOut += row.balanceOut;
  }
  const preTaxProfit = -(sumBalanceOut);
  const taxAmount = Math.round(Math.max(0, preTaxProfit) * 0.22);
  console.log("Balance sheet sum:", sumBalanceOut, "preTaxProfit:", preTaxProfit, "taxAmount:", taxAmount);

  // Phase 4: Tax voucher (only if taxAmount > 0)
  if (taxAmount > 0) {
    await api("POST", "/ledger/voucher", {
      date: "2025-12-31",
      description: "Skattekostnad 2025",
      postings: [
        { row: 1, account: { id: id(8700) }, amountGross: taxAmount, amountGrossCurrency: taxAmount, description: "Skattekostnad" },
        { row: 2, account: { id: id(2920) }, amountGross: -taxAmount, amountGrossCurrency: -taxAmount, description: "Betalbar skatt" },
      ],
    });
  }

  // Phase 5: Result disposition (MANDATORY)
  const postTaxResult = r2(preTaxProfit - taxAmount);
  console.log("postTaxResult:", postTaxResult);

  if (postTaxResult > 0) {
    // Profit: DR 8800 / CR 2050
    await api("POST", "/ledger/voucher", {
      date: "2025-12-31",
      description: "Disponering av årsresultat 2025",
      postings: [
        { row: 1, account: { id: id(8800) }, amountGross: postTaxResult, amountGrossCurrency: postTaxResult, description: "Årsresultat" },
        { row: 2, account: { id: id(2050) }, amountGross: -postTaxResult, amountGrossCurrency: -postTaxResult, description: "Annen egenkapital" },
      ],
    });
  } else if (postTaxResult < 0) {
    // Loss: DR 2050 / CR 8800
    const absResult = Math.abs(postTaxResult);
    await api("POST", "/ledger/voucher", {
      date: "2025-12-31",
      description: "Disponering av årsresultat 2025",
      postings: [
        { row: 1, account: { id: id(2050) }, amountGross: absResult, amountGrossCurrency: absResult, description: "Annen egenkapital" },
        { row: 2, account: { id: id(8800) }, amountGross: -absResult, amountGrossCurrency: -absResult, description: "Årsresultat" },
      ],
    });
  }

  console.log("Done.");
}

main().catch(e => { console.error(e); process.exit(1); });
