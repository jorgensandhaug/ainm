const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "5MUUbm3r77qpbyaOzlTDYQKzJ2eRtoj5ggKp6U70L-A";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Authorization": AUTH, "Content-Type": "application/json" };

// Task parameters
const accrualAmt = 3500;       // periodification 1700→6300
const depAmt = Math.round((232650 / 72) * 100) / 100; // 3231.25
const salaryAmt = 45000;       // default (not specified in prompt)

const NEEDED_ACCOUNTS = [1700, 6300, 6030, 1209, 5000, 2900];
const ACCOUNT_NAMES: Record<number, string> = {
  1209: "Akk. avskr. maskiner og anlegg",
  6030: "Avskr. maskiner og anlegg",
};

async function main() {
  // Step 1: GET all needed accounts
  const url = `${BASE}/ledger/account?number=${NEEDED_ACCOUNTS.join(",")}&fields=id,number,name&count=100`;
  const r1 = await fetch(url, { headers: H });
  const d1 = await r1.json();
  console.log("GET accounts:", r1.status);
  const existing = d1.values || [];
  const idMap: Record<number, number> = {};
  for (const a of existing) {
    idMap[a.number] = a.id;
    console.log(`  found: ${a.number} (${a.name}) id=${a.id}`);
  }

  // Dynamically detect missing accounts
  const missing = NEEDED_ACCOUNTS.filter(n => !(n in idMap));
  console.log("Missing accounts:", missing);

  // Step 2: Create missing accounts (batch if 2+)
  if (missing.length > 0) {
    const toCreate = missing.map(n => ({ number: n, name: ACCOUNT_NAMES[n] || `Account ${n}` }));
    let r2, d2;
    if (missing.length === 1) {
      r2 = await fetch(`${BASE}/ledger/account`, { method: "POST", headers: H, body: JSON.stringify(toCreate[0]) });
      d2 = await r2.json();
      console.log("POST create account:", r2.status);
      const val = d2.value;
      idMap[val.number] = val.id;
      console.log(`  created: ${val.number} id=${val.id}`);
    } else {
      r2 = await fetch(`${BASE}/ledger/account/list`, { method: "POST", headers: H, body: JSON.stringify(toCreate) });
      d2 = await r2.json();
      console.log("POST create accounts (batch):", r2.status);
      for (const val of (d2.values || [])) {
        idMap[val.number] = val.id;
        console.log(`  created: ${val.number} id=${val.id}`);
      }
    }
  }

  // Step 3: Combined voucher with 6 postings
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
  console.log("POST voucher:", r3.status);
  if (r3.status === 201) {
    const v = d3.value;
    console.log(`  voucher id=${v.id} number=${v.number} date=${v.date}`);
    // Verify postings from response
    if (v.postings) {
      for (const p of v.postings) {
        if (p.row === 0) continue; // skip system row
        console.log(`  row ${p.row}: account ${p.account?.number} (${p.account?.name}) amount=${p.amountGross}`);
      }
    }
  } else {
    console.log("  error:", JSON.stringify(d3));
  }
}

main();
