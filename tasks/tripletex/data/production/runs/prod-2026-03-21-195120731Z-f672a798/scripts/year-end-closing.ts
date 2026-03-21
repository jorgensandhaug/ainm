const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "4IdbOJIT3p1xujAndYnQZG-V_qtqWNtOZdogzOBz-y0";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

const r2 = (v: number) => Math.round(v * 100) / 100;

// Depreciation calculations
const assets = [
  { name: "Kjøretøy", cost: 194750, life: 9, assetAcct: 1230 },
  { name: "IT-utstyr", cost: 64350, life: 9, assetAcct: 1210 },
  { name: "Inventar", cost: 446400, life: 5, assetAcct: 1240 },
];
const deps = assets.map(a => ({ ...a, amount: r2(a.cost / a.life) }));
console.log("Depreciation amounts:", deps.map(d => `${d.name}: ${d.amount}`).join(", "));

const prepaidAmount = 65700;
const YEAR = "2025";
const DATE = `${YEAR}-12-31`;

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  console.log(`${method} ${url}`);
  const res = await fetch(url, {
    method,
    headers: H,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  console.log(`  → ${res.status}`);
  if (!res.ok) {
    console.error(`  ERROR: ${JSON.stringify(data)}`);
    throw new Error(`${method} ${path} failed: ${res.status}`);
  }
  return data;
}

async function main() {
  // Phase 1: Account lookup
  const acctRes = await api("GET", "/ledger/account?number=1209,6010,1700,6300,8700,2920&fields=id,number,name");
  const accounts: Record<number, { id: number; name: string }> = {};
  for (const a of acctRes.values) {
    accounts[a.number] = { id: a.id, name: a.name };
  }
  console.log("Found accounts:", Object.keys(accounts).join(", "));

  // Determine prepaid contra from 1700 name
  const acct1700Name = accounts[1700]?.name || "";
  console.log("Account 1700 name:", acct1700Name);
  // Default to 6300 per trusted standard
  const prepaidContra = 6300;

  // Phase 1b: Create missing accounts
  const needed = [1209, 6010, 1700, 6300, 8700, 2920];
  const missing = needed.filter(n => !accounts[n]);
  console.log("Missing accounts:", missing.join(", ") || "none");

  if (missing.length > 0) {
    const nameMap: Record<number, string> = {
      1209: "Akkumulerte avskrivninger",
      8700: "Skattekostnad på ordinært resultat",
      6010: "Avskrivning",
      1700: "Forskuddsbetalt leiekostnad",
      6300: "Leie lokale",
      2920: "Betalbar skatt",
    };
    const toCreate = missing.map(n => ({ number: n, name: nameMap[n] || `Account ${n}` }));

    if (missing.length === 1) {
      const created = await api("POST", "/ledger/account", toCreate[0]);
      accounts[created.value.number] = { id: created.value.id, name: created.value.name };
    } else {
      const created = await api("POST", "/ledger/account/list", toCreate);
      for (const a of created.values) {
        accounts[a.number] = { id: a.id, name: a.name };
      }
    }
  }

  // Phase 2: Post depreciation vouchers (3 separate)
  for (const d of deps) {
    await api("POST", "/ledger/voucher", {
      date: DATE,
      description: `Avskrivning ${d.name} ${YEAR}`,
      postings: [
        {
          row: 1,
          account: { id: accounts[6010].id },
          amountGross: d.amount,
          amountGrossCurrency: d.amount,
          description: `Avskrivning ${d.name}`,
        },
        {
          row: 2,
          account: { id: accounts[1209].id },
          amountGross: -d.amount,
          amountGrossCurrency: -d.amount,
          description: `Akk. avskrivning ${d.name}`,
        },
      ],
    });
  }

  // Post prepaid expense reversal
  await api("POST", "/ledger/voucher", {
    date: DATE,
    description: "Periodisering forskuddsbetalte kostnader",
    postings: [
      {
        row: 1,
        account: { id: accounts[prepaidContra].id },
        amountGross: prepaidAmount,
        amountGrossCurrency: prepaidAmount,
        description: "Periodisering leiekostnad",
      },
      {
        row: 2,
        account: { id: accounts[1700].id },
        amountGross: -prepaidAmount,
        amountGrossCurrency: -prepaidAmount,
        description: "Forskuddsbetalte kostnader",
      },
    ],
  });

  // Phase 3: Balance sheet for tax calculation (post-then-read)
  const bsRes = await api("GET", "/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=3000&accountNumberTo=8700&fields=*,account(id,number,name)&count=1000");

  let sumBalanceOut = 0;
  for (const row of bsRes.values) {
    sumBalanceOut += row.balanceOut || 0;
  }
  const preTaxProfit = -sumBalanceOut;
  const taxAmount = Math.round(Math.max(0, preTaxProfit) * 0.22);
  console.log(`Balance sheet sum: ${sumBalanceOut}, preTaxProfit: ${preTaxProfit}, taxAmount: ${taxAmount}`);

  // Phase 4: Tax voucher (only if positive)
  if (taxAmount > 0) {
    await api("POST", "/ledger/voucher", {
      date: DATE,
      description: `Skattekostnad ${YEAR}`,
      postings: [
        {
          row: 1,
          account: { id: accounts[8700].id },
          amountGross: taxAmount,
          amountGrossCurrency: taxAmount,
          description: "Skattekostnad",
        },
        {
          row: 2,
          account: { id: accounts[2920].id },
          amountGross: -taxAmount,
          amountGrossCurrency: -taxAmount,
          description: "Betalbar skatt",
        },
      ],
    });
  } else {
    console.log("Tax amount is 0 or negative, skipping tax voucher");
  }

  console.log("\n=== DONE ===");
  console.log(`Total depreciation: ${deps.reduce((s, d) => s + d.amount, 0)}`);
  console.log(`Prepaid reversal: ${prepaidAmount}`);
  console.log(`Tax: ${taxAmount}`);
}

main().catch(e => { console.error(e); process.exit(1); });
