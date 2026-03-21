// Task 30: Test pre-adjustment vs post-then-read tax computation
// Simulate a year-end closing with known amounts

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
    console.log(`${method} ${path} → ${r.status}: ${text.slice(0, 400)}`);
    return { ok: false, status: r.status, error: text };
  }
  return { ok: true, status: r.status, data: JSON.parse(text) };
}

const r2 = (v: number) => Math.round(v * 100) / 100;

async function main() {
  // Use example amounts from a production prompt
  const assets = [
    { name: "Kontormaskiner", cost: 222900, life: 10 },
    { name: "Inventar", cost: 254250, life: 8 },
    { name: "IT-utstyr", cost: 207900, life: 6 },
  ];
  const prepaid = 78250;
  const deps = assets.map(a => r2(a.cost / a.life));
  const totalDep = r2(deps.reduce((s, d) => s + d, 0));
  console.log("Depreciation amounts:", deps, "total:", totalDep);
  console.log("Prepaid reversal:", prepaid);

  // Resolve accounts
  const acctR = await api("GET", "/ledger/account?number=1209,6010,1700,6300,8700,2920&fields=id,number,name");
  const acctMap: Record<number, number> = {};
  for (const a of acctR.data?.values || []) {
    acctMap[a.number] = a.id;
    console.log(`Account ${a.number} (${a.name}): id=${a.id}`);
  }

  // Create missing accounts
  const missing: { number: number; name: string }[] = [];
  if (!acctMap[1209]) missing.push({ number: 1209, name: "Akkumulerte avskrivninger" });
  if (!acctMap[8700]) missing.push({ number: 8700, name: "Skattekostnad på ordinært resultat" });
  if (missing.length > 0) {
    const cr = await api("POST", "/ledger/account/list", missing);
    if (cr.ok) {
      for (const a of cr.data?.values || []) {
        acctMap[a.number] = a.id;
        console.log(`Created account ${a.number}: id=${a.id}`);
      }
    }
  }

  // ===== METHOD A: Pre-adjustment (current approach) =====
  console.log("\n\n========== METHOD A: Pre-adjustment tax calc ==========\n");

  // Read balance sheet BEFORE posting vouchers
  const bsBefore = await api("GET", "/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=3000&accountNumberTo=8700&fields=*,account(id,number,name)&count=1000");
  let sumBefore = 0;
  for (const row of bsBefore.data?.values || []) {
    sumBefore += row.balanceOut;
  }
  const preTaxProfitA = -(sumBefore);
  const adjustedProfitA = preTaxProfitA - totalDep - prepaid;
  const taxA = Math.round(Math.max(0, adjustedProfitA) * 0.22);
  console.log(`Balance sheet sum (before): ${sumBefore}`);
  console.log(`Pre-tax profit: ${preTaxProfitA}`);
  console.log(`Adjusted profit (after dep + prepaid): ${adjustedProfitA}`);
  console.log(`Tax (method A): ${taxA}`);

  // ===== Post depreciation + prepaid vouchers =====
  console.log("\n\n========== Posting depreciation + prepaid ==========\n");

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
      { row: 1, account: { id: acctMap[6300] }, amountGross: prepaid, amountGrossCurrency: prepaid, description: "Periodisering leiekostnad" },
      { row: 2, account: { id: acctMap[1700] }, amountGross: -prepaid, amountGrossCurrency: -prepaid, description: "Forskuddsbetalte kostnader" },
    ],
  });
  console.log(`Prepaid reversal: ${prepaidV.ok ? 'OK' : 'FAILED'} (${prepaid})`);

  // ===== METHOD B: Post-then-read (alternative approach) =====
  console.log("\n\n========== METHOD B: Post-then-read tax calc ==========\n");

  // Read balance sheet AFTER posting depreciation + prepaid vouchers
  const bsAfter = await api("GET", "/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=3000&accountNumberTo=8700&fields=*,account(id,number,name)&count=1000");
  let sumAfter = 0;
  for (const row of bsAfter.data?.values || []) {
    sumAfter += row.balanceOut;
    if (row.balanceOut !== 0) {
      console.log(`  ${row.account?.number} (${row.account?.name}): ${row.balanceOut}`);
    }
  }
  const preTaxProfitB = -(sumAfter);
  const taxB = Math.round(Math.max(0, preTaxProfitB) * 0.22);
  console.log(`\nBalance sheet sum (after): ${sumAfter}`);
  console.log(`Pre-tax profit (direct from BS): ${preTaxProfitB}`);
  console.log(`Tax (method B): ${taxB}`);

  // Compare
  console.log("\n\n========== COMPARISON ==========\n");
  console.log(`Method A (pre-adjustment): tax = ${taxA}`);
  console.log(`Method B (post-then-read): tax = ${taxB}`);
  console.log(`Difference: ${taxA - taxB}`);
  console.log(`Methods agree: ${taxA === taxB ? 'YES' : 'NO ← potential scoring issue!'}`);

  // Also test: what if we DON'T subtract prepaid from taxable income?
  const adjustedNoPrepaid = preTaxProfitA - totalDep;
  const taxNoPrepaid = Math.round(Math.max(0, adjustedNoPrepaid) * 0.22);
  console.log(`\nAlternative: tax without prepaid subtraction = ${taxNoPrepaid}`);

  // Test Math.floor vs Math.round
  const taxFloor = Math.floor(Math.max(0, adjustedProfitA) * 0.22);
  console.log(`Math.floor variant: ${taxFloor} (vs Math.round: ${taxA})`);
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
