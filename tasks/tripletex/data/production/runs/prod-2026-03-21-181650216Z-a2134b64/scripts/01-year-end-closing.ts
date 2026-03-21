const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "vZ3OZiCKVbfZ13WLyYeav6zAGuGBkA3s5JXiO7Ag4No";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const HEADERS = { Authorization: AUTH, "Content-Type": "application/json" };

const r2 = (v: number) => Math.round(v * 100) / 100;

// Depreciation calculations
const dep1 = r2(470650 / 10); // IT-utstyr, account 1210
const dep2 = r2(146700 / 3);  // Kjøretøy, account 1230
const dep3 = r2(313500 / 4);  // Inventar, account 1240
const totalDep = r2(dep1 + dep2 + dep3);
const prepaid = 63300;

console.log(`Depreciation: ${dep1} + ${dep2} + ${dep3} = ${totalDep}`);

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: HEADERS };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  console.log(`${method} ${path} → ${res.status}`);
  if (!res.ok) { console.error(JSON.stringify(data, null, 2)); throw new Error(`${res.status}`); }
  return data;
}

// Phase 1: Two parallel GETs
const [acctRes, bsRes] = await Promise.all([
  api("GET", "/ledger/account?number=1209,6010,1700,6300,8700,2920&fields=id,number,name"),
  api("GET", "/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=3000&accountNumberTo=8700&fields=*,account(id,number,name)&count=1000"),
]);

// Build account map from existing accounts
const acctMap: Record<number, number> = {};
for (const a of acctRes.values) {
  acctMap[a.number] = a.id;
}
console.log("Existing accounts:", Object.keys(acctMap).join(", "));

// Phase 1b: Create missing accounts
const missing: { number: number; name: string }[] = [];
if (!acctMap[1209]) missing.push({ number: 1209, name: "Akkumulerte avskrivninger" });
if (!acctMap[8700]) missing.push({ number: 8700, name: "Skattekostnad på ordinært resultat" });
// Check others too
if (!acctMap[6010]) missing.push({ number: 6010, name: "Avskrivninger" });
if (!acctMap[1700]) missing.push({ number: 1700, name: "Forskuddsbetalt leiekostnad" });
if (!acctMap[6300]) missing.push({ number: 6300, name: "Leie lokale" });
if (!acctMap[2920]) missing.push({ number: 2920, name: "Betalbar skatt" });

if (missing.length > 0) {
  console.log("Creating missing accounts:", missing.map(m => m.number).join(", "));
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

// Calculate tax
const sumBalanceOut = bsRes.values.reduce((s: number, r: any) => s + (r.balanceOut || 0), 0);
const preTaxProfit = -(sumBalanceOut);
const adjustedProfit = preTaxProfit - totalDep - prepaid;
const taxAmount = Math.round(Math.max(0, adjustedProfit) * 0.22);

console.log(`Balance sheet sum: ${sumBalanceOut}, preTaxProfit: ${preTaxProfit}`);
console.log(`Adjusted profit: ${adjustedProfit}, tax: ${taxAmount}`);

// Phase 2: Post vouchers
const depCostId = acctMap[6010];
const accumDepId = acctMap[1209];

// Depreciation 1: IT-utstyr
await api("POST", "/ledger/voucher", {
  date: "2025-12-31",
  description: "Avskrivning IT-utstyr 2025",
  postings: [
    { row: 1, account: { id: depCostId }, amountGross: dep1, amountGrossCurrency: dep1, description: "Avskrivning IT-utstyr" },
    { row: 2, account: { id: accumDepId }, amountGross: -dep1, amountGrossCurrency: -dep1, description: "Akk. avskrivning IT-utstyr" },
  ],
});

// Depreciation 2: Kjøretøy
await api("POST", "/ledger/voucher", {
  date: "2025-12-31",
  description: "Avskrivning Kjøretøy 2025",
  postings: [
    { row: 1, account: { id: depCostId }, amountGross: dep2, amountGrossCurrency: dep2, description: "Avskrivning Kjøretøy" },
    { row: 2, account: { id: accumDepId }, amountGross: -dep2, amountGrossCurrency: -dep2, description: "Akk. avskrivning Kjøretøy" },
  ],
});

// Depreciation 3: Inventar
await api("POST", "/ledger/voucher", {
  date: "2025-12-31",
  description: "Avskrivning Inventar 2025",
  postings: [
    { row: 1, account: { id: depCostId }, amountGross: dep3, amountGrossCurrency: dep3, description: "Avskrivning Inventar" },
    { row: 2, account: { id: accumDepId }, amountGross: -dep3, amountGrossCurrency: -dep3, description: "Akk. avskrivning Inventar" },
  ],
});

// Prepaid expense reversal
await api("POST", "/ledger/voucher", {
  date: "2025-12-31",
  description: "Periodisering forskuddsbetalte kostnader",
  postings: [
    { row: 1, account: { id: acctMap[6300] }, amountGross: prepaid, amountGrossCurrency: prepaid, description: "Periodisering leiekostnad" },
    { row: 2, account: { id: acctMap[1700] }, amountGross: -prepaid, amountGrossCurrency: -prepaid, description: "Forskuddsbetalte kostnader" },
  ],
});

// Tax voucher (only if taxAmount > 0)
if (taxAmount > 0) {
  await api("POST", "/ledger/voucher", {
    date: "2025-12-31",
    description: "Skattekostnad 2025",
    postings: [
      { row: 1, account: { id: acctMap[8700] }, amountGross: taxAmount, amountGrossCurrency: taxAmount, description: "Skattekostnad" },
      { row: 2, account: { id: acctMap[2920] }, amountGross: -taxAmount, amountGrossCurrency: -taxAmount, description: "Betalbar skatt" },
    ],
  });
} else {
  console.log("Tax amount is 0 or negative, skipping tax voucher");
}

console.log("Done. Year-end closing complete.");
