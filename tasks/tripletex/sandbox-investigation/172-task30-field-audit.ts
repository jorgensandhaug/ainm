/**
 * Task 30 — Field audit: run the full pipeline, then GET everything back
 * and look for fields that are missing/empty/suspicious.
 *
 * The user suspects the scorer checks fields we're NOT populating.
 */
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: { Authorization: AUTH, "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, ok: res.ok };
}

const r2 = (v: number) => Math.round(v * 100) / 100;

async function main() {
  const createdVoucherIds: number[] = [];

  // Create revenue to ensure profit
  const revAcctRes = await api("GET", "/ledger/account?number=3900,1390&fields=id,number,name");
  const revAccts: Record<number, number> = {};
  for (const a of (revAcctRes.data.values || [])) revAccts[a.number] = a.id;

  const revV = await api("POST", "/ledger/voucher", {
    date: "2025-12-31",
    description: "TEST Revenue",
    postings: [
      { row: 1, account: { id: revAccts[1390] }, amountGross: 2400000, amountGrossCurrency: 2400000, description: "Fordring" },
      { row: 2, account: { id: revAccts[3900] }, amountGross: -2400000, amountGrossCurrency: -2400000, description: "Inntekt" },
    ],
  });
  if (revV.data?.value?.id) createdVoucherIds.push(revV.data.value.id);
  console.log(`Revenue: ${revV.status}`);

  // Account lookup
  const acctRes = await api("GET", "/ledger/account?number=1209,6010,1700,6300,7500,8300,2500,8800,2050&fields=id,number,name");
  const acctMap: Record<number, { id: number; name: string }> = {};
  for (const a of (acctRes.data.values || [])) acctMap[a.number] = { id: a.id, name: a.name };

  // 3 depreciation vouchers
  const assets = [
    { name: "Inventar", cost: 136150, life: 5 },
    { name: "Kjøretøy", cost: 389450, life: 7 },
    { name: "Programvare", cost: 272250, life: 5 },
  ];
  for (const a of assets) {
    const dep = r2(a.cost / a.life);
    const v = await api("POST", "/ledger/voucher", {
      date: "2025-12-31",
      description: `Avskrivning ${a.name} 2025`,
      postings: [
        { row: 1, account: { id: acctMap[6010].id }, amountGross: dep, amountGrossCurrency: dep, description: `Avskrivning ${a.name}` },
        { row: 2, account: { id: acctMap[1209].id }, amountGross: -dep, amountGrossCurrency: -dep, description: `Akk. avskrivning ${a.name}` },
      ],
    });
    if (v.data?.value?.id) createdVoucherIds.push(v.data.value.id);
  }
  console.log(`Depreciation: 3 vouchers created`);

  // Prepaid reversal
  const prepV = await api("POST", "/ledger/voucher", {
    date: "2025-12-31",
    description: "Periodisering forskuddsbetalte kostnader",
    postings: [
      { row: 1, account: { id: acctMap[6300].id }, amountGross: 55250, amountGrossCurrency: 55250, description: "Periodisering leiekostnad" },
      { row: 2, account: { id: acctMap[1700].id }, amountGross: -55250, amountGrossCurrency: -55250, description: "Forskuddsbetalte kostnader" },
    ],
  });
  if (prepV.data?.value?.id) createdVoucherIds.push(prepV.data.value.id);

  // Balance sheet for tax
  const bs = await api("GET", "/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=3000&accountNumberTo=8299&fields=*,account(id,number,name)&count=1000");
  let sumBal = 0;
  for (const row of (bs.data.values || [])) {
    if (Math.abs(row.balanceOut) > 0.01) sumBal += row.balanceOut;
  }
  const preTaxProfit = -sumBal;
  const taxAmount = Math.round(Math.max(0, preTaxProfit) * 0.22);
  console.log(`preTaxProfit=${r2(preTaxProfit)}, taxAmount=${taxAmount}`);

  // Tax voucher
  if (taxAmount > 0) {
    const taxV = await api("POST", "/ledger/voucher", {
      date: "2025-12-31",
      description: "Skattekostnad 2025",
      postings: [
        { row: 1, account: { id: acctMap[8300].id }, amountGross: taxAmount, amountGrossCurrency: taxAmount, description: "Skattekostnad" },
        { row: 2, account: { id: acctMap[2500].id }, amountGross: -taxAmount, amountGrossCurrency: -taxAmount, description: "Betalbar skatt" },
      ],
    });
    if (taxV.data?.value?.id) createdVoucherIds.push(taxV.data.value.id);
    console.log(`Tax voucher: ${taxV.status}`);
  }

  // Disposition
  const postTaxResult = r2(preTaxProfit - taxAmount);
  if (postTaxResult > 0) {
    const dispV = await api("POST", "/ledger/voucher", {
      date: "2025-12-31",
      description: "Disponering av årsresultat 2025",
      postings: [
        { row: 1, account: { id: acctMap[8800].id }, amountGross: postTaxResult, amountGrossCurrency: postTaxResult, description: "Årsresultat" },
        { row: 2, account: { id: acctMap[2050].id }, amountGross: -postTaxResult, amountGrossCurrency: -postTaxResult, description: "Annen egenkapital" },
      ],
    });
    if (dispV.data?.value?.id) createdVoucherIds.push(dispV.data.value.id);
  } else if (postTaxResult < 0) {
    const absVal = Math.abs(postTaxResult);
    const dispV = await api("POST", "/ledger/voucher", {
      date: "2025-12-31",
      description: "Disponering av årsresultat 2025",
      postings: [
        { row: 1, account: { id: acctMap[2050].id }, amountGross: absVal, amountGrossCurrency: absVal, description: "Annen egenkapital" },
        { row: 2, account: { id: acctMap[8800].id }, amountGross: -absVal, amountGrossCurrency: -absVal, description: "Årsresultat" },
      ],
    });
    if (dispV.data?.value?.id) createdVoucherIds.push(dispV.data.value.id);
  }
  console.log(`Created ${createdVoucherIds.length} vouchers: ${createdVoucherIds.join(", ")}`);

  // ============ NOW: EXHAUSTIVE FIELD AUDIT ============

  // 1. GET each voucher with ALL fields
  console.log("\n\n========== VOUCHER FIELD AUDIT ==========");
  for (const id of createdVoucherIds.slice(1)) { // skip revenue voucher
    const v = await api("GET", `/ledger/voucher/${id}?fields=*,postings(*)`);
    if (v.ok) {
      const d = v.data.value;
      console.log(`\n--- Voucher id=${d.id} "${d.description}" ---`);
      // Print ALL top-level fields
      for (const [k, val] of Object.entries(d)) {
        if (k === "postings") continue;
        console.log(`  ${k}: ${JSON.stringify(val)}`);
      }
      // Print ALL posting fields
      for (const p of (d.postings || [])) {
        console.log(`  POSTING row=${p.row}:`);
        for (const [k, val] of Object.entries(p as Record<string, any>)) {
          console.log(`    ${k}: ${JSON.stringify(val)}`);
        }
      }
    }
  }

  // 2. GET yearEnd with ALL fields
  console.log("\n\n========== YEAREND FIELD AUDIT ==========");
  const ye = await api("GET", "/yearEnd?fields=*");
  if (ye.ok) {
    const d = ye.data.value;
    for (const [k, val] of Object.entries(d)) {
      if (typeof val === "object" && val !== null) {
        console.log(`\n${k}:`);
        console.log(JSON.stringify(val, null, 2).slice(0, 2000));
      } else {
        console.log(`${k}: ${JSON.stringify(val)}`);
      }
    }
  }

  // 3. Check yearEnd with specific field expansions
  console.log("\n\n========== YEAREND SPECIFIC FIELDS ==========");
  const yeFields = await api("GET", "/yearEnd?fields=id,version,status,sentDate,annualResult,year,yearEndReportPosting(*)");
  if (yeFields.ok) {
    console.log(JSON.stringify(yeFields.data.value, null, 2));
  }

  // 4. Check resultSheet (result / income statement)
  console.log("\n\n========== RESULT SHEET ==========");
  const rs = await api("GET", "/resultSheet?dateFrom=2025-01-01&dateTo=2026-01-01&fields=*,account(number,name)&count=1000");
  console.log(`resultSheet: ${rs.status}`);
  if (rs.ok) {
    for (const row of (rs.data.values || [])) {
      if (Math.abs(row.balanceOut || 0) > 0.01) {
        console.log(`  ${row.account?.number} "${row.account?.name}": balOut=${row.balanceOut}`);
      }
    }
  } else {
    console.log(`  ${JSON.stringify(rs.data).slice(0, 300)}`);
  }

  // 5. Check balance sheet for ALL accounts
  console.log("\n\n========== BALANCE SHEET (ALL) ==========");
  const bsAll = await api("GET", "/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=1000&accountNumberTo=9999&fields=*,account(number,name)&count=2000");
  if (bsAll.ok) {
    for (const row of (bsAll.data.values || [])) {
      if (Math.abs(row.balanceOut) > 0.01) {
        console.log(`  ${row.account?.number} "${row.account?.name}": balOut=${row.balanceOut}`);
      }
    }
  }

  // 6. Check if there are any voucher-level fields we're missing
  console.log("\n\n========== VOUCHER SCHEMA DISCOVERY ==========");
  // Try posting with extra fields to see what's accepted
  const schemaTest = await api("POST", "/ledger/voucher", {
    date: "2025-12-31",
    description: "Schema test",
    voucherType: null,
    postings: [
      { row: 1, account: { id: acctMap[8300].id }, amountGross: 1, amountGrossCurrency: 1, description: "test" },
      { row: 2, account: { id: acctMap[2500].id }, amountGross: -1, amountGrossCurrency: -1, description: "test" },
    ],
  });
  console.log(`Schema test voucher: ${schemaTest.status}`);
  if (schemaTest.ok) {
    const st = schemaTest.data.value;
    console.log("ALL fields on created voucher:");
    for (const [k, val] of Object.entries(st)) {
      if (k !== "postings") console.log(`  ${k}: ${JSON.stringify(val)}`);
    }
    createdVoucherIds.push(st.id);
  }

  // 7. Check what posting fields exist that we're NOT setting
  console.log("\n\n========== POSTING FIELD COMPARISON ==========");
  // GET a voucher posting with maximum field expansion
  const firstVoucherId = createdVoucherIds[1]; // first dep voucher
  const vFull = await api("GET", `/ledger/voucher/${firstVoucherId}?fields=*,postings(*,account(*),vatType(*))`);
  if (vFull.ok) {
    const p = vFull.data.value.postings?.[0];
    if (p) {
      console.log("ALL posting fields (first dep voucher, first posting):");
      for (const [k, val] of Object.entries(p as Record<string, any>)) {
        console.log(`  ${k}: ${JSON.stringify(val)}`);
      }
    }
  }

  // ============ CLEANUP ============
  console.log("\n\n========== CLEANUP ==========");
  for (const id of createdVoucherIds.reverse()) {
    const del = await api("DELETE", `/ledger/voucher/${id}`);
    console.log(`Delete ${id}: ${del.status}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
