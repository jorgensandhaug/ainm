/**
 * Task 30 — Quick dummy data test of the CORRECT flow.
 * Posts on 2026-12-31, reads /yearEnd, reverses everything.
 */

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);

async function api(method: string, path: string, body?: any) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  if (res.status >= 400) console.error(`  ERR ${method} ${path} → ${res.status}`, JSON.stringify(data).slice(0, 200));
  return { status: res.status, data };
}

async function main() {
  // 1. Get account IDs
  const needed = [1209,6010,1700,6300,8300,2500,8800,2050];
  const acctRes = await api("GET", `/ledger/account?number=${needed.join(",")}&fields=id,number,name`);
  const ids: Record<number, number> = {};
  for (const a of (acctRes.data.values || [])) ids[a.number] = a.id;
  for (const n of needed) if (!ids[n]) { console.error(`Missing account ${n}!`); return; }

  // Dummy data: 3 assets, prepaid
  const r2 = (v: number) => Math.round(v * 100) / 100;
  const deps = [
    { name: "Maskin A", amount: r2(300000 / 10) },   // 30000
    { name: "Maskin B", amount: r2(150000 / 5) },    // 30000
    { name: "Maskin C", amount: r2(90000 / 3) },     // 30000
  ];
  const prepaid = 50000;
  const created: number[] = [];

  // 2. Post 3 depreciation + 1 prepaid
  for (const d of deps) {
    const v = await api("POST", "/ledger/voucher", {
      date: "2026-12-31",
      description: `Avskrivning ${d.name} 2026`,
      postings: [
        { row: 1, account: { id: ids[6010] }, amountGross: d.amount, amountGrossCurrency: d.amount, description: `Avskrivning ${d.name}` },
        { row: 2, account: { id: ids[1209] }, amountGross: -d.amount, amountGrossCurrency: -d.amount, description: `Akk. avskrivning ${d.name}` },
      ],
    });
    console.log(`dep ${d.name}: ${v.status}`);
    if (v.data.value?.id) created.push(v.data.value.id);
  }

  const pv = await api("POST", "/ledger/voucher", {
    date: "2026-12-31",
    description: "Periodisering forskuddsbetalte kostnader",
    postings: [
      { row: 1, account: { id: ids[6300] }, amountGross: prepaid, amountGrossCurrency: prepaid, description: "Periodisering leiekostnad" },
      { row: 2, account: { id: ids[1700] }, amountGross: -prepaid, amountGrossCurrency: -prepaid, description: "Forskuddsbetalte kostnader" },
    ],
  });
  console.log(`prepaid: ${pv.status}`);
  if (pv.data.value?.id) created.push(pv.data.value.id);

  // 3. Balance sheet for tax
  const bs = await api("GET", "/balanceSheet?dateFrom=2026-01-01&dateTo=2027-01-01&accountNumberFrom=3000&accountNumberTo=8299&fields=*,account(number)&count=1000");
  let sum = 0;
  for (const r of (bs.data.values || [])) sum += (r.balanceOut || 0);
  const preTax = -sum;
  const tax = Math.round(Math.max(0, preTax) * 0.22);
  const postTax = preTax - tax;
  console.log(`\npreTax=${preTax.toFixed(2)} tax=${tax} postTax=${postTax}`);

  // 4. Tax voucher (8300/2500)
  if (tax > 0) {
    const tv = await api("POST", "/ledger/voucher", {
      date: "2026-12-31",
      description: "Skattekostnad 2026",
      postings: [
        { row: 1, account: { id: ids[8300] }, amountGross: tax, amountGrossCurrency: tax, description: "Skattekostnad" },
        { row: 2, account: { id: ids[2500] }, amountGross: -tax, amountGrossCurrency: -tax, description: "Betalbar skatt" },
      ],
    });
    console.log(`tax (8300/2500): ${tv.status}`);
    if (tv.data.value?.id) created.push(tv.data.value.id);
  }

  // 5. Disposition voucher (8800/2050)
  if (postTax > 0) {
    const dv = await api("POST", "/ledger/voucher", {
      date: "2026-12-31",
      description: "Disponering av årsresultat 2026",
      postings: [
        { row: 1, account: { id: ids[8800] }, amountGross: postTax, amountGrossCurrency: postTax, description: "Årsresultat" },
        { row: 2, account: { id: ids[2050] }, amountGross: -postTax, amountGrossCurrency: -postTax, description: "Annen egenkapital" },
      ],
    });
    console.log(`disposition (8800/2050): ${dv.status}`);
    if (dv.data.value?.id) created.push(dv.data.value.id);
  } else if (postTax < 0) {
    const dv = await api("POST", "/ledger/voucher", {
      date: "2026-12-31",
      description: "Disponering av årsresultat 2026",
      postings: [
        { row: 1, account: { id: ids[2050] }, amountGross: Math.abs(postTax), amountGrossCurrency: Math.abs(postTax), description: "Annen egenkapital" },
        { row: 2, account: { id: ids[8800] }, amountGross: -Math.abs(postTax), amountGrossCurrency: -Math.abs(postTax), description: "Årsresultat" },
      ],
    });
    console.log(`disposition (8800/2050, loss): ${dv.status}`);
    if (dv.data.value?.id) created.push(dv.data.value.id);
  }

  // 6. Read /yearEnd
  console.log("\n=== /yearEnd?year=2026 AFTER correct flow ===");
  const ye = await api("GET", "/yearEnd?year=2026&fields=*");
  const y = ye.data.value;
  console.log(`annualResult: ${y?.annualResult}`);
  console.log(`taxCost: ${y?.taxCost ? `POPULATED sumAmount=${y.taxCost.sumAmount}` : "NULL"}`);

  if (y?.operatingExpense) {
    console.log(`operatingExpense: ${y.operatingExpense.sumAmount}`);
    for (const p of y.operatingExpense.posts) console.log(`  ${p.groupNumber} "${p.name}": ${p.sumAmount}`);
  }
  if (y?.taxCost) {
    console.log(`taxCost detail:`);
    for (const p of y.taxCost.posts) console.log(`  ${p.groupNumber} "${p.name}" (${p.grouping}): ${p.sumAmount}`);
  }
  if (y?.currentDebt) {
    console.log(`currentDebt:`);
    for (const p of y.currentDebt.posts) console.log(`  ${p.groupNumber} "${p.name}": ${p.sumAmount}`);
  }
  if (y?.equity) {
    console.log(`equity:`);
    for (const p of y.equity.posts) console.log(`  ${p.groupNumber} "${p.name}": ${p.sumAmount}`);
  }

  // 7. Reverse everything
  console.log("\n=== Cleanup (reverse) ===");
  for (const id of created.reverse()) {
    const rv = await api("PUT", `/ledger/voucher/${id}/:reverse?date=2026-03-22`);
    console.log(`reverse ${id}: ${rv.status}`);
  }

  console.log("\nDone.");
}

main().catch(e => { console.error(e); process.exit(1); });
