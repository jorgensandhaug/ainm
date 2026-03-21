const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "X1Q-bQzAd0oooO_wSUENd6NQLA_o4zHD_IC6pACyCqg";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H = { "Content-Type": "application/json", Authorization: AUTH };

const r2 = (v: number) => Math.round(v * 100) / 100;

// Depreciation calculations
const assets = [
  { name: "Kjøretøy", cost: 249600, life: 10 },
  { name: "IT-utstyr", cost: 292050, life: 9 },
  { name: "Kontormaskiner", cost: 354500, life: 7 },
];
const deps = assets.map(a => ({ ...a, amount: r2(a.cost / a.life) }));
console.log("Depreciation amounts:", deps.map(d => `${d.name}: ${d.amount}`));

// Phase 1: Account lookup
const NEEDED = [1209, 6010, 1700, 6300, 8700, 2920, 8800, 2050];
const acctRes = await fetch(
  `${BASE}/ledger/account?number=${NEEDED.join(",")}&fields=id,number,name&count=100`,
  { headers: H }
);
if (!acctRes.ok) {
  console.error("Account GET failed:", acctRes.status, await acctRes.text());
  process.exit(1);
}
const acctData = await acctRes.json();
const acctList: { id: number; number: number; name: string }[] = acctData.values;
console.log("Found accounts:", acctList.map(a => `${a.number} (${a.name})`));

const acctMap = new Map(acctList.map(a => [a.number, a]));

// Read account 1700 name for prepaid contra mapping
const acct1700 = acctMap.get(1700);
let prepaidContra = 6300; // default
if (acct1700) {
  const name = acct1700.name.toLowerCase();
  if (name.includes("forsikring")) prepaidContra = 7500;
  console.log(`Account 1700 name: "${acct1700.name}" → contra: ${prepaidContra}`);
}

// Phase 1b: Create missing accounts
const missing = NEEDED.filter(n => !acctMap.has(n));
console.log("Missing accounts:", missing);

const NAMES: Record<number, string> = {
  1209: "Akkumulerte avskrivninger",
  8700: "Skattekostnad på ordinært resultat",
};

if (missing.length > 0) {
  const toCreate = missing.map(n => ({ number: n, name: NAMES[n] || `Account ${n}` }));
  if (missing.length === 1) {
    const cr = await fetch(`${BASE}/ledger/account`, {
      method: "POST", headers: H, body: JSON.stringify(toCreate[0]),
    });
    if (!cr.ok) { console.error("Create account failed:", cr.status, await cr.text()); process.exit(1); }
    const created = (await cr.json()).value;
    acctMap.set(created.number, created);
    console.log("Created account:", created.number, created.id);
  } else {
    const cr = await fetch(`${BASE}/ledger/account/list`, {
      method: "POST", headers: H, body: JSON.stringify(toCreate),
    });
    if (!cr.ok) { console.error("Batch create failed:", cr.status, await cr.text()); process.exit(1); }
    const created = (await cr.json()).values;
    for (const a of created) { acctMap.set(a.number, a); }
    console.log("Created accounts:", created.map((a: any) => `${a.number}=${a.id}`));
  }
}

// Helper
const id = (n: number) => acctMap.get(n)!.id;

async function postVoucher(desc: string, postings: any[]) {
  const body = { date: "2025-12-31", description: desc, postings };
  const r = await fetch(`${BASE}/ledger/voucher`, {
    method: "POST", headers: H, body: JSON.stringify(body),
  });
  const txt = await r.text();
  if (!r.ok) { console.error(`Voucher FAILED (${desc}):`, r.status, txt); process.exit(1); }
  console.log(`Voucher OK: ${desc}`);
  return JSON.parse(txt);
}

// Phase 2: Depreciation vouchers (3 separate)
for (const d of deps) {
  await postVoucher(`Avskrivning ${d.name} 2025`, [
    { row: 1, account: { id: id(6010) }, amountGross: d.amount, amountGrossCurrency: d.amount, description: `Avskrivning ${d.name}` },
    { row: 2, account: { id: id(1209) }, amountGross: -d.amount, amountGrossCurrency: -d.amount, description: `Akk. avskrivning ${d.name}` },
  ]);
}

// Phase 2: Prepaid expense reversal
const prepaidAmount = 45950;
await postVoucher("Periodisering forskuddsbetalte kostnader", [
  { row: 1, account: { id: id(prepaidContra) }, amountGross: prepaidAmount, amountGrossCurrency: prepaidAmount, description: "Periodisering leiekostnad" },
  { row: 2, account: { id: id(1700) }, amountGross: -prepaidAmount, amountGrossCurrency: -prepaidAmount, description: "Forskuddsbetalte kostnader" },
]);

// Phase 3: Balance sheet for tax calculation (post-then-read)
const bsRes = await fetch(
  `${BASE}/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=3000&accountNumberTo=8700&fields=*,account(id,number,name)&count=1000`,
  { headers: H }
);
if (!bsRes.ok) { console.error("BS GET failed:", bsRes.status, await bsRes.text()); process.exit(1); }
const bsData = await bsRes.json();
const bsRows: { balanceOut: number; account: { number: number } }[] = bsData.values || [];
const sumBalanceOut = r2(bsRows.reduce((s, r) => s + (r.balanceOut || 0), 0));
const preTaxProfit = r2(-sumBalanceOut);
console.log(`Balance sheet sum: ${sumBalanceOut}, preTaxProfit: ${preTaxProfit}`);

const taxAmount = Math.round(Math.max(0, preTaxProfit) * 0.22);
console.log(`Tax amount: ${taxAmount}`);

// Phase 4: Tax voucher
if (taxAmount > 0) {
  await postVoucher("Skattekostnad 2025", [
    { row: 1, account: { id: id(8700) }, amountGross: taxAmount, amountGrossCurrency: taxAmount, description: "Skattekostnad" },
    { row: 2, account: { id: id(2920) }, amountGross: -taxAmount, amountGrossCurrency: -taxAmount, description: "Betalbar skatt" },
  ]);
}

// Phase 5: Result disposition (8800/2050)
const postTaxResult = r2(preTaxProfit - taxAmount);
console.log(`Post-tax result: ${postTaxResult}`);

if (postTaxResult > 0) {
  await postVoucher("Disponering av årsresultat 2025", [
    { row: 1, account: { id: id(8800) }, amountGross: postTaxResult, amountGrossCurrency: postTaxResult, description: "Årsresultat" },
    { row: 2, account: { id: id(2050) }, amountGross: -postTaxResult, amountGrossCurrency: -postTaxResult, description: "Annen egenkapital" },
  ]);
} else if (postTaxResult < 0) {
  const absVal = Math.abs(postTaxResult);
  await postVoucher("Disponering av årsresultat 2025", [
    { row: 1, account: { id: id(2050) }, amountGross: absVal, amountGrossCurrency: absVal, description: "Annen egenkapital" },
    { row: 2, account: { id: id(8800) }, amountGross: -absVal, amountGrossCurrency: -absVal, description: "Årsresultat" },
  ]);
} else {
  console.log("Post-tax result is zero, skipping disposition voucher.");
}

console.log("DONE — year-end closing complete.");
