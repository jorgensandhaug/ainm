const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "19bcehqmJOH38LHTBGb1H477PYMwgQbWQOQilFEhgDc";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };

const r2 = (v: number) => Math.round(v * 100) / 100;

// Depreciation calculations
const dep1 = r2(189700 / 8);  // Kontormaskiner = 23712.50
const dep2 = r2(428000 / 8);  // Kjøretøy = 53500.00
const dep3 = r2(440750 / 9);  // IT-utstyr = 48972.22

console.log("Depreciation:", dep1, dep2, dep3);

// Phase 1: Account lookup
const acctRes = await fetch(
  `${BASE}/ledger/account?number=1209,6010,1700,6300,8700,2920,8800,2050&fields=id,number,name`,
  { headers: H }
);
const acctData = await acctRes.json();
console.log("Accounts:", acctRes.status, JSON.stringify(acctData));

const acctMap = new Map<number, number>();
const needed = [1209, 6010, 1700, 6300, 8700, 2920, 8800, 2050];
for (const a of (acctData.values || [])) {
  acctMap.set(a.number, a.id);
}

// Determine prepaid contra from 1700 name
const acct1700 = (acctData.values || []).find((a: any) => a.number === 1700);
let prepaidContra = 6300; // default
if (acct1700?.name?.toLowerCase().includes("forsikring")) {
  prepaidContra = 7500;
}
console.log("Account 1700 name:", acct1700?.name, "→ contra:", prepaidContra);

// Check which accounts are missing
const missing: { number: number; name: string }[] = [];
const missingNames: Record<number, string> = {
  1209: "Akkumulerte avskrivninger",
  8700: "Skattekostnad på ordinært resultat",
};
for (const n of needed) {
  if (!acctMap.has(n)) {
    if (missingNames[n]) {
      missing.push({ number: n, name: missingNames[n] });
    } else {
      console.error(`Account ${n} missing and no default name!`);
      process.exit(1);
    }
  }
}

// Phase 1b: Create missing accounts
if (missing.length > 0) {
  console.log("Creating missing accounts:", missing);
  const createUrl = missing.length === 1
    ? `${BASE}/ledger/account`
    : `${BASE}/ledger/account/list`;
  const createBody = missing.length === 1 ? missing[0] : missing;
  const createRes = await fetch(createUrl, {
    method: "POST",
    headers: H,
    body: JSON.stringify(createBody),
  });
  const createData = await createRes.json();
  console.log("Create accounts:", createRes.status, JSON.stringify(createData));
  if (!createRes.ok) { console.error("Failed to create accounts"); process.exit(1); }

  if (missing.length === 1) {
    acctMap.set(createData.value.number, createData.value.id);
  } else {
    for (const a of createData.values) {
      acctMap.set(a.number, a.id);
    }
  }
}

const id = (n: number) => acctMap.get(n)!;

// Phase 2: Depreciation vouchers (3 separate)
const depEntries = [
  { name: "Kontormaskiner", amount: dep1 },
  { name: "Kjøretøy", amount: dep2 },
  { name: "IT-utstyr", amount: dep3 },
];

for (const e of depEntries) {
  const res = await fetch(`${BASE}/ledger/voucher`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({
      date: "2025-12-31",
      description: `Avskrivning ${e.name} 2025`,
      postings: [
        { row: 1, account: { id: id(6010) }, amountGross: e.amount, amountGrossCurrency: e.amount, description: `Avskrivning ${e.name}` },
        { row: 2, account: { id: id(1209) }, amountGross: -e.amount, amountGrossCurrency: -e.amount, description: `Akk. avskrivning ${e.name}` },
      ],
    }),
  });
  console.log(`Dep ${e.name}:`, res.status);
  if (!res.ok) { const t = await res.text(); console.error(t); process.exit(1); }
}

// Prepaid expense reversal
const prepaidAmount = 21300;
const prepaidRes = await fetch(`${BASE}/ledger/voucher`, {
  method: "POST",
  headers: H,
  body: JSON.stringify({
    date: "2025-12-31",
    description: "Periodisering forskuddsbetalte kostnader",
    postings: [
      { row: 1, account: { id: id(prepaidContra) }, amountGross: prepaidAmount, amountGrossCurrency: prepaidAmount, description: "Periodisering leiekostnad" },
      { row: 2, account: { id: id(1700) }, amountGross: -prepaidAmount, amountGrossCurrency: -prepaidAmount, description: "Forskuddsbetalte kostnader" },
    ],
  }),
});
console.log("Prepaid:", prepaidRes.status);
if (!prepaidRes.ok) { const t = await prepaidRes.text(); console.error(t); process.exit(1); }

// Phase 3: Balance sheet (post-then-read)
const bsRes = await fetch(
  `${BASE}/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=3000&accountNumberTo=8700&fields=*,account(id,number,name)&count=1000`,
  { headers: H }
);
const bsData = await bsRes.json();
console.log("Balance sheet:", bsRes.status, "rows:", bsData.values?.length);

let sumBalanceOut = 0;
for (const row of (bsData.values || [])) {
  sumBalanceOut += row.balanceOut || 0;
}
const preTaxProfit = r2(-sumBalanceOut);
const taxAmount = Math.round(Math.max(0, preTaxProfit) * 0.22);
console.log("sumBalanceOut:", sumBalanceOut, "preTaxProfit:", preTaxProfit, "taxAmount:", taxAmount);

// Phase 4: Tax voucher (if taxAmount > 0)
if (taxAmount > 0) {
  const taxRes = await fetch(`${BASE}/ledger/voucher`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({
      date: "2025-12-31",
      description: "Skattekostnad 2025",
      postings: [
        { row: 1, account: { id: id(8700) }, amountGross: taxAmount, amountGrossCurrency: taxAmount, description: "Skattekostnad" },
        { row: 2, account: { id: id(2920) }, amountGross: -taxAmount, amountGrossCurrency: -taxAmount, description: "Betalbar skatt" },
      ],
    }),
  });
  console.log("Tax:", taxRes.status);
  if (!taxRes.ok) { const t = await taxRes.text(); console.error(t); process.exit(1); }
}

// Phase 5: Result disposition (8800/2050) — MANDATORY
const postTaxResult = r2(preTaxProfit - taxAmount);
console.log("postTaxResult:", postTaxResult);

if (postTaxResult !== 0) {
  const absResult = Math.abs(postTaxResult);
  const isProfit = postTaxResult > 0;
  const dispRes = await fetch(`${BASE}/ledger/voucher`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({
      date: "2025-12-31",
      description: "Disponering av årsresultat 2025",
      postings: [
        {
          row: 1,
          account: { id: isProfit ? id(8800) : id(2050) },
          amountGross: absResult,
          amountGrossCurrency: absResult,
          description: isProfit ? "Årsresultat" : "Annen egenkapital",
        },
        {
          row: 2,
          account: { id: isProfit ? id(2050) : id(8800) },
          amountGross: -absResult,
          amountGrossCurrency: -absResult,
          description: isProfit ? "Annen egenkapital" : "Årsresultat",
        },
      ],
    }),
  });
  console.log("Disposition:", dispRes.status);
  if (!dispRes.ok) { const t = await dispRes.text(); console.error(t); process.exit(1); }
}

console.log("DONE");
