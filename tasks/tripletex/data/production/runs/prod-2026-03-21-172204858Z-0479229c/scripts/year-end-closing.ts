const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "ddbYLrjsD14Zbd8Z0EojwDPdk7p8v6hY-F_5oSH2NiA";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const r2 = (v: number) => Math.round(v * 100) / 100;

// Depreciation calculations
const dep1 = r2(222900 / 10); // Kontormaskiner = 22290.00
const dep2 = r2(254250 / 8);  // Inventar = 31781.25
const dep3 = r2(207900 / 6);  // IT-utstyr = 34650.00
const totalDep = r2(dep1 + dep2 + dep3);
const prepaidAmount = 78250;

console.log("Depreciation amounts:", dep1, dep2, dep3, "total:", totalDep);

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  console.log(`${method} ${url}`);
  const opts: any = {
    method,
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  console.log(`  → ${res.status}`, JSON.stringify(data).slice(0, 500));
  if (!res.ok) throw new Error(`${res.status}: ${JSON.stringify(data)}`);
  return data;
}

async function main() {
  // Phase 1: Two parallel GETs
  const [acctRes, bsRes] = await Promise.all([
    api("GET", "/ledger/account?number=1209,6010,1700,6300,8700,2920&fields=id,number,name&count=100"),
    api("GET", "/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=3000&accountNumberTo=8700&fields=*,account(id,number,name)&count=1000"),
  ]);

  // Build account map from existing accounts
  const acctMap: Record<number, number> = {};
  for (const a of acctRes.values || []) {
    acctMap[a.number] = a.id;
  }
  console.log("Existing accounts:", acctMap);

  // Phase 1b: Create missing accounts
  const missing: { number: number; name: string }[] = [];
  if (!acctMap[1209]) missing.push({ number: 1209, name: "Akkumulerte avskrivninger" });
  if (!acctMap[8700]) missing.push({ number: 8700, name: "Skattekostnad på ordinært resultat" });
  if (!acctMap[6010]) missing.push({ number: 6010, name: "Avskrivningskostnad" });
  if (!acctMap[6300]) missing.push({ number: 6300, name: "Leie lokale" });
  if (!acctMap[2920]) missing.push({ number: 2920, name: "Betalbar skatt" });
  if (!acctMap[1700]) missing.push({ number: 1700, name: "Forskuddsbetalt leiekostnad" });

  if (missing.length > 0) {
    console.log("Creating missing accounts:", missing.map(m => m.number));
    if (missing.length === 1) {
      const created = await api("POST", "/ledger/account", missing[0]);
      acctMap[created.value.number] = created.value.id;
    } else {
      const created = await api("POST", "/ledger/account/list", missing);
      for (const a of created.values || []) {
        acctMap[a.number] = a.id;
      }
    }
  }

  console.log("All account IDs:", acctMap);

  // Calculate tax
  let sumBalanceOut = 0;
  for (const row of bsRes.values || []) {
    sumBalanceOut += row.balanceOut || 0;
  }
  const preTaxProfit = -(sumBalanceOut);
  const adjustedProfit = preTaxProfit - totalDep - prepaidAmount;
  const taxAmount = Math.round(Math.max(0, adjustedProfit) * 0.22);
  console.log("Balance sum:", sumBalanceOut, "preTax:", preTaxProfit, "adjusted:", adjustedProfit, "tax:", taxAmount);

  // Phase 2: Post vouchers

  // Voucher 1: Depreciation Kontormaskiner
  await api("POST", "/ledger/voucher", {
    date: "2025-12-31",
    description: "Avskrivning Kontormaskiner 2025",
    postings: [
      { row: 1, account: { id: acctMap[6010] }, amountGross: dep1, amountGrossCurrency: dep1, description: "Avskrivning Kontormaskiner" },
      { row: 2, account: { id: acctMap[1209] }, amountGross: -dep1, amountGrossCurrency: -dep1, description: "Akk. avskrivning Kontormaskiner" },
    ],
  });

  // Voucher 2: Depreciation Inventar
  await api("POST", "/ledger/voucher", {
    date: "2025-12-31",
    description: "Avskrivning Inventar 2025",
    postings: [
      { row: 1, account: { id: acctMap[6010] }, amountGross: dep2, amountGrossCurrency: dep2, description: "Avskrivning Inventar" },
      { row: 2, account: { id: acctMap[1209] }, amountGross: -dep2, amountGrossCurrency: -dep2, description: "Akk. avskrivning Inventar" },
    ],
  });

  // Voucher 3: Depreciation IT-utstyr
  await api("POST", "/ledger/voucher", {
    date: "2025-12-31",
    description: "Avskrivning IT-utstyr 2025",
    postings: [
      { row: 1, account: { id: acctMap[6010] }, amountGross: dep3, amountGrossCurrency: dep3, description: "Avskrivning IT-utstyr" },
      { row: 2, account: { id: acctMap[1209] }, amountGross: -dep3, amountGrossCurrency: -dep3, description: "Akk. avskrivning IT-utstyr" },
    ],
  });

  // Voucher 4: Prepaid expense reversal
  await api("POST", "/ledger/voucher", {
    date: "2025-12-31",
    description: "Periodisering forskuddsbetalte kostnader",
    postings: [
      { row: 1, account: { id: acctMap[6300] }, amountGross: prepaidAmount, amountGrossCurrency: prepaidAmount, description: "Periodisering leiekostnad" },
      { row: 2, account: { id: acctMap[1700] }, amountGross: -prepaidAmount, amountGrossCurrency: -prepaidAmount, description: "Forskuddsbetalte kostnader" },
    ],
  });

  // Voucher 5: Tax expense (only if positive)
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

  console.log("DONE - all vouchers posted");
}

main().catch(e => { console.error(e); process.exit(1); });
