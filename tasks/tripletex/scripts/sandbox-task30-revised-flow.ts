// Task 30: Test the REVISED year-end closing flow
// Key changes:
// 1. POST vouchers first, THEN read balance sheet for tax (post-then-read)
// 2. Discover prepaid contra account from existing postings on 1700

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: RequestInit = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  if (!r.ok) {
    console.log(`${method} ${path} → ${r.status}: ${text.slice(0, 300)}`);
    return { ok: false, status: r.status, error: text };
  }
  return { ok: true, status: r.status, data: JSON.parse(text) };
}

const r2 = (v: number) => Math.round(v * 100) / 100;

async function main() {
  // Simulate task 30 with known values from the production prompt
  const assets = [
    { name: "Kjøretøy", cost: 249600, life: 10, acct: 1230 },
    { name: "IT-utstyr", cost: 292050, life: 9, acct: 1210 },
    { name: "Kontormaskiner", cost: 354500, life: 7, acct: 1200 },
  ];
  const prepaid = 45950;
  const deps = assets.map(a => r2(a.cost / a.life));
  const totalDep = r2(deps.reduce((s, d) => s + d, 0));
  console.log("Depreciation amounts:", deps, "total:", totalDep);
  console.log("Prepaid reversal:", prepaid);

  // ===== PHASE 1: Two parallel GETs =====
  console.log("\n\n===== PHASE 1: Account lookup + Posting discovery =====\n");

  // 1a. Account lookup
  const acctR = await api("GET", "/ledger/account?number=6010,1209,1700,6300,8700,2920&fields=id,number,name");
  const acctMap: Record<number, number> = {};
  for (const a of acctR.data?.values || []) {
    acctMap[a.number] = a.id;
    console.log(`Account ${a.number} (${a.name}): id=${a.id}`);
  }

  // 1b. Discover contra for prepaid 1700 via postings
  console.log("\n--- Posting discovery on account 1700 ---");
  const postings1700 = await api("GET", "/ledger/posting?accountNumberFrom=1700&accountNumberTo=1700&dateFrom=2024-01-01&dateTo=2026-12-31&fields=id,date,amount,description,voucher(id)&count=50");

  let contraAccount = 6300; // default fallback
  if (postings1700.ok && postings1700.data?.values?.length > 0) {
    console.log(`Found ${postings1700.data.values.length} postings on 1700`);

    // Get unique voucher IDs
    const voucherIds = [...new Set(postings1700.data.values.map((p: any) => p.voucher?.id).filter(Boolean))];
    console.log(`Unique voucher IDs: ${voucherIds}`);

    // For each voucher, find the contra account (non-1700 account)
    const contraAccounts: Record<number, number> = {}; // accountNumber → count
    for (const vid of voucherIds.slice(0, 3)) { // limit to first 3 vouchers
      const vr = await api("GET", `/ledger/voucher/${vid}?fields=id,postings(account(id,number),amount)`);
      if (vr.ok) {
        for (const p of vr.data?.value?.postings || []) {
          if (p.account?.number !== 1700 && p.account?.number >= 3000) { // expense/revenue accounts only
            contraAccounts[p.account.number] = (contraAccounts[p.account.number] || 0) + 1;
            console.log(`  Voucher ${vid}: contra ${p.account.number} (amount=${p.amount})`);
          }
        }
      }
    }

    // Use the most frequent contra account
    if (Object.keys(contraAccounts).length > 0) {
      const sorted = Object.entries(contraAccounts).sort((a, b) => b[1] - a[1]);
      contraAccount = parseInt(sorted[0][0]);
      console.log(`Discovered contra account: ${contraAccount} (frequency: ${sorted[0][1]})`);
    }
  } else {
    console.log("No postings found on 1700 — using default contra 6300");
  }

  // Make sure we have the contra account ID
  if (!acctMap[contraAccount]) {
    console.log(`Need to look up contra account ${contraAccount}`);
    const caR = await api("GET", `/ledger/account?number=${contraAccount}&fields=id,number,name`);
    if (caR.ok && caR.data?.values?.length > 0) {
      acctMap[contraAccount] = caR.data.values[0].id;
      console.log(`Contra account ${contraAccount} (${caR.data.values[0].name}): id=${caR.data.values[0].id}`);
    }
  }

  // ===== PHASE 1b: Create missing accounts =====
  console.log("\n\n===== PHASE 1b: Create missing accounts =====\n");
  const missing: { number: number; name: string }[] = [];
  if (!acctMap[1209]) missing.push({ number: 1209, name: "Akkumulerte avskrivninger" });
  if (!acctMap[8700]) missing.push({ number: 8700, name: "Skattekostnad på ordinært resultat" });
  if (missing.length > 0) {
    const createPath = missing.length === 1 ? "/ledger/account" : "/ledger/account/list";
    const createBody = missing.length === 1 ? missing[0] : missing;
    const cr = await api("POST", createPath, createBody);
    if (cr.ok) {
      const vals = missing.length === 1 ? [cr.data.value] : (cr.data?.values || []);
      for (const a of vals) {
        acctMap[a.number] = a.id;
        console.log(`Created account ${a.number}: id=${a.id}`);
      }
    }
  } else {
    console.log("All accounts exist");
  }

  // ===== PHASE 2: POST depreciation + prepaid vouchers =====
  console.log("\n\n===== PHASE 2: POST depreciation + prepaid vouchers =====\n");

  for (let i = 0; i < assets.length; i++) {
    const v = await api("POST", "/ledger/voucher", {
      date: "2025-12-31",
      description: `Avskrivning ${assets[i].name} 2025`,
      postings: [
        { row: 1, account: { id: acctMap[6010] }, amountGross: deps[i], amountGrossCurrency: deps[i], description: `Avskrivning ${assets[i].name}` },
        { row: 2, account: { id: acctMap[1209] }, amountGross: -deps[i], amountGrossCurrency: -deps[i], description: `Akk. avskrivning ${assets[i].name}` },
      ],
    });
    console.log(`Depreciation ${assets[i].name}: ${v.ok ? 'OK' : 'FAILED'} (${deps[i]})`);
  }

  const prepaidV = await api("POST", "/ledger/voucher", {
    date: "2025-12-31",
    description: "Periodisering forskuddsbetalte kostnader",
    postings: [
      { row: 1, account: { id: acctMap[contraAccount] }, amountGross: prepaid, amountGrossCurrency: prepaid, description: `Periodisering ${contraAccount === 6300 ? 'leiekostnad' : 'forskuddsbetalt kostnad'}` },
      { row: 2, account: { id: acctMap[1700] }, amountGross: -prepaid, amountGrossCurrency: -prepaid, description: "Forskuddsbetalte kostnader" },
    ],
  });
  console.log(`Prepaid reversal (contra ${contraAccount}): ${prepaidV.ok ? 'OK' : 'FAILED'} (${prepaid})`);

  // ===== PHASE 3: Balance sheet for tax (POST-THEN-READ) =====
  console.log("\n\n===== PHASE 3: Balance sheet for tax (POST-THEN-READ) =====\n");

  const bs = await api("GET", "/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=3000&accountNumberTo=8700&fields=*,account(id,number,name)&count=1000");
  let sumBalanceOut = 0;
  if (bs.ok) {
    for (const row of bs.data?.values || []) {
      if (row.balanceOut !== 0) {
        console.log(`  ${row.account?.number} (${row.account?.name}): ${row.balanceOut}`);
      }
      sumBalanceOut += row.balanceOut;
    }
    console.log(`\n  Sum: ${sumBalanceOut}`);
    console.log(`  Pre-tax profit (direct from BS, after vouchers): ${-sumBalanceOut}`);
  }

  const preTaxProfit = -sumBalanceOut;
  const taxAmount = Math.round(Math.max(0, preTaxProfit) * 0.22);
  console.log(`  Tax amount: ${taxAmount}`);

  // ===== Compare with OLD approach (pre-adjustment) =====
  console.log("\n\n===== COMPARISON: Pre-adjustment vs Post-then-read =====\n");

  // For old approach, we need the balance sheet WITHOUT our vouchers
  // We can approximate by subtracting back our posted amounts
  const oldPreTaxProfit = preTaxProfit + totalDep + prepaid; // reverse our additions
  const oldAdjustedProfit = oldPreTaxProfit - totalDep - prepaid;
  const oldTaxAmount = Math.round(Math.max(0, oldAdjustedProfit) * 0.22);

  console.log(`OLD (pre-adjustment): preTaxProfit=${oldPreTaxProfit}, adjusted=${oldAdjustedProfit}, tax=${oldTaxAmount}`);
  console.log(`NEW (post-then-read): preTaxProfit=${preTaxProfit}, tax=${taxAmount}`);
  console.log(`Methods agree: ${taxAmount === oldTaxAmount ? 'YES' : 'NO'}`);
  console.log(`Difference: ${taxAmount - oldTaxAmount}`);

  // ===== PHASE 4: Tax voucher =====
  if (taxAmount > 0) {
    console.log("\n\n===== PHASE 4: POST tax voucher =====\n");
    const taxV = await api("POST", "/ledger/voucher", {
      date: "2025-12-31",
      description: "Skattekostnad 2025",
      postings: [
        { row: 1, account: { id: acctMap[8700] }, amountGross: taxAmount, amountGrossCurrency: taxAmount, description: "Skattekostnad" },
        { row: 2, account: { id: acctMap[2920] }, amountGross: -taxAmount, amountGrossCurrency: -taxAmount, description: "Betalbar skatt" },
      ],
    });
    console.log(`Tax voucher: ${taxV.ok ? 'OK' : 'FAILED'} (${taxAmount})`);
  } else {
    console.log("\n\n===== PHASE 4: No tax voucher needed (profit ≤ 0) =====\n");
  }

  // ===== Summary =====
  console.log("\n\n===== SUMMARY =====\n");
  console.log(`Contra account used: ${contraAccount}`);
  console.log(`Pre-tax profit (post-then-read): ${preTaxProfit}`);
  console.log(`Tax amount: ${taxAmount}`);
  console.log(`Total API calls: account lookup + posting discovery + create accounts + 4 vouchers + balance sheet + tax voucher`);
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
