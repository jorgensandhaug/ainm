const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "qbTrVWnrANSaoUtmJ3IBmxY9oqh1U5k5oyKiSQJBfL8";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const r2 = (v: number) => Math.round(v * 100) / 100;

// Depreciation calculations
const dep1 = r2(249600 / 10);  // Kjøretøy = 24960.00
const dep2 = r2(292050 / 9);   // IT-utstyr = 32450.00
const dep3 = r2(354500 / 7);   // Kontormaskiner = 50642.86
const totalDep = r2(dep1 + dep2 + dep3);
const prepaid = 45950;

console.log("Depreciation:", dep1, dep2, dep3, "total:", totalDep);

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = {
    method,
    headers: { "Authorization": AUTH, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  console.log(`${method} ${path} → ${r.status}`);
  if (!r.ok) {
    console.error("ERROR:", JSON.stringify(data).slice(0, 500));
    throw new Error(`${r.status} on ${method} ${path}`);
  }
  return data;
}

// Phase 1: Two parallel GETs
const [acctRes, bsRes] = await Promise.all([
  api("GET", "/ledger/account?number=6010,1209,1700,6300,8700,2920&fields=id,number,name&count=100"),
  api("GET", "/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=3000&accountNumberTo=8700&fields=*,account(id,number,name)&count=1000"),
]);

// Build account map from GET
const acctMap: Record<number, number> = {};
for (const a of acctRes.values) {
  acctMap[a.number] = a.id;
}
console.log("Found accounts:", Object.keys(acctMap).map(Number));

// Phase 1b: Create missing accounts
const missing: { number: number; name: string }[] = [];
if (!acctMap[1209]) missing.push({ number: 1209, name: "Akkumulerte avskrivninger" });
if (!acctMap[8700]) missing.push({ number: 8700, name: "Skattekostnad på ordinært resultat" });
if (!acctMap[6010]) missing.push({ number: 6010, name: "Avskrivning på transportmidler" });
if (!acctMap[6300]) missing.push({ number: 6300, name: "Leie lokale" });
if (!acctMap[2920]) missing.push({ number: 2920, name: "Skyldig skatt" });
if (!acctMap[1700]) missing.push({ number: 1700, name: "Forskuddsbetalt leiekostnad" });

if (missing.length > 0) {
  console.log("Creating missing accounts:", missing.map(m => m.number));
  if (missing.length === 1) {
    const created = await api("POST", "/ledger/account", missing[0]);
    acctMap[created.value.number] = created.value.id;
  } else {
    const created = await api("POST", "/ledger/account/list", missing);
    for (const a of created.values) {
      acctMap[a.number] = a.id;
    }
  }
}

// Compute tax
let sumBalanceOut = 0;
for (const row of bsRes.values) {
  sumBalanceOut += row.balanceOut ?? 0;
}
const preTaxProfit = -(sumBalanceOut);
const adjustedProfit = preTaxProfit - totalDep - prepaid;
const taxAmount = Math.round(Math.max(0, adjustedProfit) * 0.22);
console.log("preTaxProfit:", preTaxProfit, "adjustedProfit:", adjustedProfit, "taxAmount:", taxAmount);

const id = (n: number) => ({ id: acctMap[n] });

// Phase 2: Post vouchers
// Voucher 1: Kjøretøy depreciation
await api("POST", "/ledger/voucher", {
  date: "2025-12-31",
  description: "Avskrivning Kjøretøy 2025",
  postings: [
    { row: 1, account: id(6010), amountGross: dep1, amountGrossCurrency: dep1, description: "Avskrivning Kjøretøy" },
    { row: 2, account: id(1209), amountGross: -dep1, amountGrossCurrency: -dep1, description: "Akk. avskrivning Kjøretøy" },
  ],
});

// Voucher 2: IT-utstyr depreciation
await api("POST", "/ledger/voucher", {
  date: "2025-12-31",
  description: "Avskrivning IT-utstyr 2025",
  postings: [
    { row: 1, account: id(6010), amountGross: dep2, amountGrossCurrency: dep2, description: "Avskrivning IT-utstyr" },
    { row: 2, account: id(1209), amountGross: -dep2, amountGrossCurrency: -dep2, description: "Akk. avskrivning IT-utstyr" },
  ],
});

// Voucher 3: Kontormaskiner depreciation
await api("POST", "/ledger/voucher", {
  date: "2025-12-31",
  description: "Avskrivning Kontormaskiner 2025",
  postings: [
    { row: 1, account: id(6010), amountGross: dep3, amountGrossCurrency: dep3, description: "Avskrivning Kontormaskiner" },
    { row: 2, account: id(1209), amountGross: -dep3, amountGrossCurrency: -dep3, description: "Akk. avskrivning Kontormaskiner" },
  ],
});

// Voucher 4: Prepaid expense reversal
await api("POST", "/ledger/voucher", {
  date: "2025-12-31",
  description: "Periodisering forskuddsbetalte kostnader",
  postings: [
    { row: 1, account: id(6300), amountGross: prepaid, amountGrossCurrency: prepaid, description: "Periodisering leiekostnad" },
    { row: 2, account: id(1700), amountGross: -prepaid, amountGrossCurrency: -prepaid, description: "Forskuddsbetalte kostnader" },
  ],
});

// Voucher 5: Tax expense (only if positive)
if (taxAmount > 0) {
  await api("POST", "/ledger/voucher", {
    date: "2025-12-31",
    description: "Skattekostnad 2025",
    postings: [
      { row: 1, account: id(8700), amountGross: taxAmount, amountGrossCurrency: taxAmount, description: "Skattekostnad" },
      { row: 2, account: id(2920), amountGross: -taxAmount, amountGrossCurrency: -taxAmount, description: "Betalbar skatt" },
    ],
  });
} else {
  console.log("Tax amount <= 0, skipping tax voucher");
}

console.log("Done. Total depreciation:", totalDep, "Prepaid:", prepaid, "Tax:", taxAmount);
