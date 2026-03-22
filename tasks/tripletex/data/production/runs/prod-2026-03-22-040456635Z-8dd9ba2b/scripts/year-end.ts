const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "pFIFeG69FoBz3M3l6vSLEJQ0JMsH1niO025SSjb8apY";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

const r2 = (v: number) => Math.round(v * 100) / 100;

// Depreciation calculations
const assets = [
  { name: "Inventar",   cost: 136150, life: 5 },
  { name: "Kjøretøy",   cost: 389450, life: 7 },
  { name: "Programvare", cost: 272250, life: 5 },
];
const deps = assets.map(a => ({ ...a, dep: r2(a.cost / a.life) }));
console.log("Depreciation amounts:", deps.map(d => `${d.name}: ${d.dep}`));

// Phase 1: GET all needed accounts
const acctNums = "1209,6010,1700,6300,7500,8300,2500,8800,2050";
const acctRes = await fetch(`${BASE}/ledger/account?number=${acctNums}&fields=id,number,name&count=100`, { headers: H });
if (!acctRes.ok) { console.error("Account GET failed:", acctRes.status, await acctRes.text()); process.exit(1); }
const acctData = await acctRes.json();
const accts: Record<number, { id: number; name: string }> = {};
for (const a of acctData.values) {
  accts[a.number] = { id: a.id, name: a.name };
}
console.log("Found accounts:", Object.keys(accts).map(Number).sort((a,b) => a-b));

// Determine prepaid contra from 1700 name
let contraNum = 6300; // default
if (accts[1700]) {
  const name1700 = accts[1700].name.toLowerCase();
  if (name1700.includes("forsikring")) contraNum = 7500;
  console.log(`Account 1700 name: "${accts[1700].name}" → contra: ${contraNum}`);
}

// Phase 1b: Create missing accounts
const needed = [1209, 6010, 1700, contraNum, 8300, 2500, 8800, 2050];
const missing = needed.filter(n => !accts[n]);
console.log("Missing accounts:", missing);

if (missing.length === 1) {
  const nameMap: Record<number, string> = { 1209: "Akkumulerte avskrivninger" };
  const body = { number: missing[0], name: nameMap[missing[0]] || `Account ${missing[0]}` };
  const r = await fetch(`${BASE}/ledger/account`, { method: "POST", headers: H, body: JSON.stringify(body) });
  if (!r.ok) { console.error("Create account failed:", r.status, await r.text()); process.exit(1); }
  const created = await r.json();
  accts[created.value.number] = { id: created.value.id, name: created.value.name };
  console.log("Created account:", created.value.number, created.value.id);
} else if (missing.length > 1) {
  const nameMap: Record<number, string> = { 1209: "Akkumulerte avskrivninger" };
  const bodies = missing.map(n => ({ number: n, name: nameMap[n] || `Account ${n}` }));
  const r = await fetch(`${BASE}/ledger/account/list`, { method: "POST", headers: H, body: JSON.stringify(bodies) });
  if (!r.ok) { console.error("Batch create accounts failed:", r.status, await r.text()); process.exit(1); }
  const created = await r.json();
  for (const a of created.values) {
    accts[a.number] = { id: a.id, name: a.name };
  }
  console.log("Created accounts:", created.values.map((a: any) => a.number));
}

// Helper to post voucher
async function postVoucher(description: string, postings: any[]) {
  const body = { date: "2025-12-31", description, postings };
  const r = await fetch(`${BASE}/ledger/voucher`, { method: "POST", headers: H, body: JSON.stringify(body) });
  const txt = await r.text();
  if (!r.ok) { console.error(`Voucher "${description}" failed:`, r.status, txt); process.exit(1); }
  const data = JSON.parse(txt);
  console.log(`Voucher "${description}" → id=${data.value.id}`);
  return data;
}

// Phase 2: Three depreciation vouchers (one per asset)
for (const d of deps) {
  await postVoucher(`Avskrivning ${d.name} 2025`, [
    { row: 1, account: { id: accts[6010].id }, amountGross: d.dep, amountGrossCurrency: d.dep, description: `Avskrivning ${d.name}` },
    { row: 2, account: { id: accts[1209].id }, amountGross: -d.dep, amountGrossCurrency: -d.dep, description: `Akk. avskrivning ${d.name}` },
  ]);
}

// Phase 2: Prepaid expense reversal
const prepaidAmt = 55250;
const contraId = accts[contraNum].id;
const prepaidId = accts[1700].id;

// Determine description based on contra
const contraDesc = contraNum === 7500 ? "Periodisering forsikringskostnad" : "Periodisering leiekostnad";
await postVoucher("Periodisering forskuddsbetalte kostnader", [
  { row: 1, account: { id: contraId }, amountGross: prepaidAmt, amountGrossCurrency: prepaidAmt, description: contraDesc },
  { row: 2, account: { id: prepaidId }, amountGross: -prepaidAmt, amountGrossCurrency: -prepaidAmt, description: "Forskuddsbetalte kostnader" },
]);

// Phase 3: Balance sheet for tax calculation (POST-THEN-READ)
const bsRes = await fetch(
  `${BASE}/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=3000&accountNumberTo=8299&fields=*,account(id,number,name)&count=1000`,
  { headers: H }
);
if (!bsRes.ok) { console.error("Balance sheet GET failed:", bsRes.status, await bsRes.text()); process.exit(1); }
const bsData = await bsRes.json();
let sumBalanceOut = 0;
for (const row of bsData.values || []) {
  sumBalanceOut += row.balanceOut || 0;
}
const preTaxProfit = -sumBalanceOut;
const taxAmount = Math.round(Math.max(0, preTaxProfit) * 0.22);
console.log(`Balance sheet sum: ${sumBalanceOut}, preTaxProfit: ${preTaxProfit}, taxAmount: ${taxAmount}`);

// Phase 4: Tax voucher (only if taxAmount > 0)
if (taxAmount > 0) {
  await postVoucher("Skattekostnad 2025", [
    { row: 1, account: { id: accts[8300].id }, amountGross: taxAmount, amountGrossCurrency: taxAmount, description: "Skattekostnad" },
    { row: 2, account: { id: accts[2500].id }, amountGross: -taxAmount, amountGrossCurrency: -taxAmount, description: "Betalbar skatt" },
  ]);
}

// Phase 5: Result disposition
const postTaxResult = r2(preTaxProfit - taxAmount);
console.log(`postTaxResult: ${postTaxResult}`);

if (postTaxResult > 0) {
  await postVoucher("Disponering av årsresultat 2025", [
    { row: 1, account: { id: accts[8800].id }, amountGross: postTaxResult, amountGrossCurrency: postTaxResult, description: "Årsresultat" },
    { row: 2, account: { id: accts[2050].id }, amountGross: -postTaxResult, amountGrossCurrency: -postTaxResult, description: "Annen egenkapital" },
  ]);
} else if (postTaxResult < 0) {
  const absVal = Math.abs(postTaxResult);
  await postVoucher("Disponering av årsresultat 2025", [
    { row: 1, account: { id: accts[2050].id }, amountGross: absVal, amountGrossCurrency: absVal, description: "Annen egenkapital" },
    { row: 2, account: { id: accts[8800].id }, amountGross: -absVal, amountGrossCurrency: -absVal, description: "Årsresultat" },
  ]);
} else {
  console.log("postTaxResult is 0 — skipping disposition voucher");
}

console.log("DONE");
