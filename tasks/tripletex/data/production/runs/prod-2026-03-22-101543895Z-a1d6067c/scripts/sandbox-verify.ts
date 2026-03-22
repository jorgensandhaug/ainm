const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Authorization": AUTH, "Content-Type": "application/json" };

// Replicate the exact production flow: 1700→6300 + 6030→1209 + 5000→2900
const accrualAmt = 3500;
const depAmt = Math.round((232650 / 72) * 100) / 100; // 3231.25
const salaryAmt = 45000;

const NEEDED = [1700, 6300, 6030, 1209, 5000, 2900];

async function main() {
  // Step 1: GET accounts
  const r1 = await fetch(`${BASE}/ledger/account?number=${NEEDED.join(",")}&fields=id,number,name&count=100`, { headers: H });
  const d1 = await r1.json();
  console.log("GET accounts:", r1.status, "count:", d1.values?.length);
  const idMap: Record<number, number> = {};
  for (const a of (d1.values || [])) {
    idMap[a.number] = a.id;
    console.log(`  ${a.number} (${a.name}) id=${a.id}`);
  }

  const missing = NEEDED.filter(n => !(n in idMap));
  console.log("Missing:", missing);

  // In sandbox, 6030 and 1209 likely exist from prior tests. The point is to verify the flow.
  // Step 2: Create missing (if any)
  if (missing.length > 0) {
    const names: Record<number, string> = {
      1209: "Akk. avskr. maskiner og anlegg",
      6030: "Avskr. maskiner og anlegg",
    };
    const toCreate = missing.map(n => ({ number: n, name: names[n] || `Account ${n}` }));
    if (missing.length === 1) {
      const r = await fetch(`${BASE}/ledger/account`, { method: "POST", headers: H, body: JSON.stringify(toCreate[0]) });
      const d = await r.json();
      console.log("POST create account:", r.status);
      if (r.status === 201) {
        idMap[d.value.number] = d.value.id;
      } else {
        console.log("  error:", JSON.stringify(d));
      }
    } else {
      const r = await fetch(`${BASE}/ledger/account/list`, { method: "POST", headers: H, body: JSON.stringify(toCreate) });
      const d = await r.json();
      console.log("POST create accounts (batch):", r.status);
      if (r.status === 201) {
        for (const v of (d.values || [])) {
          idMap[v.number] = v.id;
          console.log(`  created: ${v.number} id=${v.id}`);
        }
      } else {
        console.log("  error:", JSON.stringify(d));
      }
    }
  }

  // Step 3: Combined voucher
  const voucher = {
    date: "2026-03-31",
    description: "Månedsavslutning mars 2026",
    postings: [
      { row: 1, account: { id: idMap[6300] }, amountGross: accrualAmt, amountGrossCurrency: accrualAmt, description: "Periodisering forskuddsbetalt kostnad" },
      { row: 2, account: { id: idMap[1700] }, amountGross: -accrualAmt, amountGrossCurrency: -accrualAmt, description: "Forskuddsbetalt kostnad" },
      { row: 3, account: { id: idMap[6030] }, amountGross: depAmt, amountGrossCurrency: depAmt, description: "Avskrivning driftsmiddel" },
      { row: 4, account: { id: idMap[1209] }, amountGross: -depAmt, amountGrossCurrency: -depAmt, description: "Akk. avskrivning" },
      { row: 5, account: { id: idMap[5000] }, amountGross: salaryAmt, amountGrossCurrency: salaryAmt, description: "Lønn til ansatte" },
      { row: 6, account: { id: idMap[2900] }, amountGross: -salaryAmt, amountGrossCurrency: -salaryAmt, description: "Påløpt lønn" },
    ],
  };

  const r3 = await fetch(`${BASE}/ledger/voucher`, { method: "POST", headers: H, body: JSON.stringify(voucher) });
  const d3 = await r3.json();
  console.log("\nPOST voucher:", r3.status);

  if (r3.status === 201) {
    const v = d3.value;
    console.log(`  voucher id=${v.id} number=${v.number} date=${v.date} desc="${v.description}"`);

    // Verification GET
    const r4 = await fetch(`${BASE}/ledger/voucher/${v.id}?fields=id,number,date,description,postings(row,account(number,name),amountGross,amountGrossCurrency)`, { headers: H });
    const d4 = await r4.json();
    console.log("\nGET voucher verification:", r4.status);
    const vv = d4.value;
    console.log(`  id=${vv.id} number=${vv.number} date=${vv.date} desc="${vv.description}"`);
    for (const p of (vv.postings || [])) {
      console.log(`  row ${p.row}: account ${p.account?.number} (${p.account?.name}) gross=${p.amountGross} grossCcy=${p.amountGrossCurrency}`);
    }

    // Verify balance sums to zero
    let sum = 0;
    for (const p of (vv.postings || [])) {
      if (p.row > 0) sum += p.amountGross;
    }
    console.log(`\n  Balance sum: ${sum} (should be 0)`);

    // Clean up: delete the sandbox voucher
    const r5 = await fetch(`${BASE}/ledger/voucher/${v.id}`, { method: "DELETE", headers: H });
    console.log("DELETE voucher (cleanup):", r5.status);
  } else {
    console.log("  error:", JSON.stringify(d3));
  }
}

main();
