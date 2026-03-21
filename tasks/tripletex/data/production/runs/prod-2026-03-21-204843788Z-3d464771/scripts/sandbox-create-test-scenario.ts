const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  console.log(`${method} ${url}`);
  const opts: any = {
    method,
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const json = await res.json();
  if (!res.ok) {
    console.error("ERROR", res.status, JSON.stringify(json).slice(0, 500));
    return null;
  }
  return json;
}

async function main() {
  // Get account IDs
  const acctRes = await api("GET", "/ledger/account?number=4500,2710,2400&fields=id,number,vatType(id)");
  if (!acctRes) return;
  const accounts: Record<number, number> = {};
  for (const a of acctRes.values) {
    accounts[a.number] = a.id;
    console.log(`Account ${a.number}: id=${a.id}, vatType=${a.vatType?.id}`);
  }

  // Get a supplier
  const supRes = await api("GET", "/supplier?fields=id,name&count=1");
  if (!supRes) return;
  const supplierId = supRes.values[0]?.id;
  console.log(`Supplier: ${supplierId} (${supRes.values[0]?.name})`);

  // Simulate the production scenario:
  // Create 2 vouchers on 4500 with amountGross=22900:
  // 1. Correctly booked (vatType=1, which auto-generates 2710)
  // 2. Error: booked without VAT (vatType=0, no 2710)

  // Voucher 1: correctly booked
  console.log("\n--- Creating correctly-booked voucher (4500/22900, vatType=1) ---");
  const v1 = await api("POST", "/ledger/voucher?sendToLedger=true", {
    date: "2026-01-20",
    description: "Varekjøp korrekt bokført",
    postings: [
      { row: 1, account: { id: accounts[4500] }, amountGross: 22900, amountGrossCurrency: 22900, vatType: { id: 1 }, description: "Varekjøp" },
      { row: 2, account: { id: accounts[2400] }, amountGross: -22900, amountGrossCurrency: -22900, supplier: { id: supplierId }, description: "Leverandørgjeld" },
    ],
  });
  if (v1) {
    console.log(`Voucher 1 created: id=${v1.value.id}`);
    for (const p of v1.value.postings) {
      console.log(`  acct=${p.account?.id} (${p.account?.number}), gross=${p.amountGross}, net=${p.amount}, vatType=${p.vatType?.id}`);
    }
  }

  // Voucher 2: error - booked without VAT
  console.log("\n--- Creating error voucher (4500/22900, vatType=0, no 2710) ---");
  const v2 = await api("POST", "/ledger/voucher?sendToLedger=true", {
    date: "2026-02-10",
    description: "Varekjøp uten MVA",
    postings: [
      { row: 1, account: { id: accounts[4500] }, amountGross: 22900, amountGrossCurrency: 22900, vatType: { id: 0 }, description: "Varekjøp" },
      { row: 2, account: { id: accounts[2400] }, amountGross: -22900, amountGrossCurrency: -22900, supplier: { id: supplierId }, description: "Leverandørgjeld" },
    ],
  });
  if (v2) {
    console.log(`Voucher 2 created: id=${v2.value.id}`);
    for (const p of v2.value.postings) {
      console.log(`  acct=${p.account?.id} (${p.account?.number}), gross=${p.amountGross}, net=${p.amount}, vatType=${p.vatType?.id}`);
    }
  }

  // Now search for all 4500/22900 vouchers to see if both are found
  console.log("\n--- Searching for 4500/22900 vouchers ---");
  const vRes = await api("GET", "/ledger/voucher?dateFrom=2026-01-01&dateTo=2026-03-01&fields=id,date,description,postings(id,account(id,number),amount,amountGross,amountGrossCurrency,vatType(id),supplier(id),description)&count=1000");
  if (!vRes) return;

  const candidates: any[] = [];
  for (const v of vRes.values) {
    for (const p of v.postings) {
      if (p.account?.number === 4500 && Math.abs(p.amountGross) === 22900) {
        const has2710 = v.postings.some((pp: any) => pp.account?.number === 2710);
        const amt2710 = v.postings
          .filter((pp: any) => pp.account?.number === 2710)
          .reduce((s: number, pp: any) => s + pp.amountGross, 0);
        candidates.push({ voucherId: v.id, date: v.date, desc: v.description, gross: p.amountGross, net: p.amount, vatType: p.vatType?.id, has2710, amt2710 });
      }
    }
  }

  console.log(`Found ${candidates.length} candidates:`);
  for (const c of candidates) {
    console.log(`  v=${c.voucherId} | ${c.date} | "${c.desc}" | gross=${c.gross} | net=${c.net} | vatType=${c.vatType} | has2710=${c.has2710} (${c.amt2710})`);
  }

  // Test Case A correction
  console.log("\n--- Testing Case A correction ---");
  const caseACandidate = candidates.find(c => !c.has2710);
  if (caseACandidate) {
    const netAmount = 22900;
    const correctVat = netAmount * 0.25; // 5725
    console.log(`Case A found: voucher ${caseACandidate.voucherId}`);
    console.log(`Correction: 2710 +${correctVat}, counterpart -${correctVat}`);

    // Find the counterpart from the error voucher
    const errorVoucher = vRes.values.find((v: any) => v.id === caseACandidate.voucherId);
    const counterpart = errorVoucher.postings.find((p: any) =>
      p.account?.number !== 4500 && p.account?.number !== 2710 &&
      p.amountGross < 0
    );

    const correctionRes = await api("POST", "/ledger/voucher?sendToLedger=true", {
      date: "2026-02-28",
      description: "Case A correction: manglende MVA",
      postings: [
        { row: 1, account: { id: accounts[2710] }, amountGross: correctVat, amountGrossCurrency: correctVat, description: "Korreksjon: manglende MVA" },
        { row: 2, account: { id: counterpart.account.id }, amountGross: -correctVat, amountGrossCurrency: -correctVat, supplier: { id: counterpart.supplier?.id }, description: "Korreksjon: manglende MVA" },
      ],
    });
    if (correctionRes) {
      console.log(`Case A correction voucher: id=${correctionRes.value.id}`);
      for (const p of correctionRes.value.postings) {
        console.log(`  acct=${p.account?.id} (${p.account?.number}), gross=${p.amountGross}, net=${p.amount}`);
      }
    }
  } else {
    console.log("NO Case A candidate found — this would be the production bug");
  }
}

main().catch(e => console.error("FATAL:", e.message));
