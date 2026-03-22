// Task 24 (correct-ledger-errors) Check 3 investigation
// Check 3 = missing VAT correction — fails 7/7 scored runs
// Root cause: agent picks the voucher WITH 2710 instead of the error voucher WITHOUT 2710
//
// Goal: understand the actual data shape of the two vouchers and verify
// the disambiguation cascade finds the right one.

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  console.log(`${method} ${url.substring(BASE.length)}`);
  const res = await fetch(url, {
    method,
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`HTTP ${res.status}: ${text.substring(0, 500)}`);
    throw new Error(`HTTP ${res.status}`);
  }
  return JSON.parse(text);
}

async function main() {
  console.log("=== PHASE 1: Account setup ===");

  // Get accounts needed: 4500 (expense), 2710 (VAT), 2400 (supplier/contra)
  const acctRes = await api("GET", "/ledger/account?number=4500,6500,2710,2400,1920&fields=id,number,vatType(id)");
  const acctMap: Record<number, { id: number; vatTypeId: number }> = {};
  for (const a of acctRes.values) {
    acctMap[a.number] = { id: a.id, vatTypeId: a.vatType?.id ?? 0 };
    console.log(`  Account ${a.number}: id=${a.id}, vatType=${a.vatType?.id ?? "null"}`);
  }
  const acctIdToNumber: Record<number, number> = {};
  for (const a of acctRes.values) {
    acctIdToNumber[a.id] = a.number;
  }

  // Get a supplier for 2400 postings
  const supRes = await api("GET", "/supplier?count=1&fields=id,name");
  const supplierId = supRes.values[0]?.id;
  console.log(`  Supplier: id=${supplierId}, name=${supRes.values[0]?.name}`);

  console.log("\n=== PHASE 2: Create test vouchers ===");

  // Scenario: Account 4500, excl-VAT = 22900
  // Voucher A: correctly booked WITH VAT (vatType=1 → auto-generates 2710)
  //   - 4500 gross=22900, vatType=1 → Tripletex creates net=18320, 2710=4580
  //   - 2400 gross=-22900 (contra with supplier)
  // Voucher B: ERROR — booked WITHOUT VAT (vatType=0 → no 2710 created)
  //   - 4500 gross=22900, vatType=0 → net=22900, no 2710
  //   - 2400 gross=-22900 (contra with supplier)

  console.log("\n--- Creating Voucher A (correctly booked, WITH vatType=1 → will have 2710) ---");
  const voucherA = await api("POST", "/ledger/voucher?sendToLedger=true", {
    date: "2026-02-15",
    description: "Innkjøp test - korrekt med MVA",
    postings: [
      { row: 1, account: { id: acctMap[4500].id }, amountGross: 22900, amountGrossCurrency: 22900, vatType: { id: 1 }, description: "Korrekt innkjøp" },
      { row: 2, account: { id: acctMap[2400].id }, amountGross: -22900, amountGrossCurrency: -22900, supplier: { id: supplierId }, description: "Leverandør" },
    ],
  });
  console.log(`  Voucher A created: id=${voucherA.value.id}`);
  console.log(`  Postings:`);
  for (const p of voucherA.value.postings || []) {
    console.log(`    acct=${p.account?.number} (id=${p.account?.id}), gross=${p.amountGross}, net=${p.amount}, vatType=${p.vatType?.id}`);
  }

  console.log("\n--- Creating Voucher B (ERROR — booked WITHOUT VAT, vatType=0 → no 2710) ---");
  const voucherB = await api("POST", "/ledger/voucher?sendToLedger=true", {
    date: "2026-02-20",
    description: "Innkjøp test - uten MVA (feil)",
    postings: [
      { row: 1, account: { id: acctMap[4500].id }, amountGross: 22900, amountGrossCurrency: 22900, vatType: { id: 0 }, description: "Innkjøp uten MVA" },
      { row: 2, account: { id: acctMap[2400].id }, amountGross: -22900, amountGrossCurrency: -22900, supplier: { id: supplierId }, description: "Leverandør" },
    ],
  });
  console.log(`  Voucher B created: id=${voucherB.value.id}`);
  console.log(`  Postings:`);
  for (const p of voucherB.value.postings || []) {
    console.log(`    acct=${p.account?.number} (id=${p.account?.id}), gross=${p.amountGross}, net=${p.amount}, vatType=${p.vatType?.id}`);
  }

  console.log("\n=== PHASE 3: Fetch and analyze ALL vouchers (simulating agent's Call 2) ===");

  const voucherRes = await api("GET", "/ledger/voucher?dateFrom=2026-02-01&dateTo=2026-03-01&fields=id,date,description,postings(id,account(id,number),amount,amountGross,amountGrossCurrency,vatType(id),supplier(id),description)&count=1000");
  const vouchers = voucherRes.values;
  console.log(`\nTotal vouchers in Feb 2026: ${vouchers.length}`);

  // Helper: match account by number or id fallback
  const getAcctNumber = (p: any) => p.account?.number ?? acctIdToNumber[p.account?.id];

  // Show ALL vouchers that have a posting on 4500
  console.log("\n--- ALL vouchers with a posting on account 4500 ---");
  const on4500 = vouchers.filter((v: any) => v.postings.some((p: any) => getAcctNumber(p) === 4500));
  for (const v of on4500) {
    const has2710 = v.postings.some((p: any) => getAcctNumber(p) === 2710);
    console.log(`\n  Voucher ${v.id} (date=${v.date}, desc="${v.description}", has2710=${has2710}):`);
    for (const p of v.postings) {
      console.log(`    acct=${getAcctNumber(p)} (id=${p.account?.id}, .number=${p.account?.number}), gross=${p.amountGross}, net=${p.amount}, vatType=${p.vatType?.id}, supplier=${p.supplier?.id ?? "none"}`);
    }
  }

  console.log("\n\n=== PHASE 4: Run disambiguation cascade ===");

  const mvPromptAcct = 4500;
  const mvPromptExclVat = 22900;
  const has2710 = (v: any) => v.postings.some((p: any) => getAcctNumber(p) === 2710);
  const onPromptAcct = (v: any) => v.postings.some((p: any) => getAcctNumber(p) === mvPromptAcct);

  // Collect ALL vouchers on the prompt account
  const allMvCandidates = vouchers.filter((v: any) => onPromptAcct(v));
  console.log(`All candidates on account ${mvPromptAcct}: ${allMvCandidates.length}`);
  for (const v of allMvCandidates) {
    console.log(`  id=${v.id}, has2710=${has2710(v)}, desc="${v.description}"`);
  }

  // Partition: Case A = no 2710, Case B = has 2710
  const caseA = allMvCandidates.filter((v: any) => !has2710(v));
  const caseB = allMvCandidates.filter((v: any) => has2710(v));
  console.log(`\nCase A (no 2710): ${caseA.length}`);
  for (const v of caseA) {
    const p4500 = v.postings.find((p: any) => getAcctNumber(p) === mvPromptAcct);
    console.log(`  id=${v.id}, gross=${p4500?.amountGross}, net=${p4500?.amount}, vatType=${p4500?.vatType?.id}`);
  }
  console.log(`Case B (has 2710): ${caseB.length}`);
  for (const v of caseB) {
    const p4500 = v.postings.find((p: any) => getAcctNumber(p) === mvPromptAcct);
    const p2710 = v.postings.find((p: any) => getAcctNumber(p) === 2710);
    console.log(`  id=${v.id}, gross=${p4500?.amountGross}, net=${p4500?.amount}, vatType=${p4500?.vatType?.id}, 2710.gross=${p2710?.amountGross}`);
  }

  // TIER 1: amountGross match + no 2710
  let missingVatVoucher: any = null;
  let missingVatIsA = false;

  if (caseA.length > 0) {
    missingVatVoucher = caseA.find((v: any) =>
      v.postings.some((p: any) => getAcctNumber(p) === mvPromptAcct && Math.abs(p.amountGross) === mvPromptExclVat)
    ) ?? caseA[0]; // if no exact amountGross match, still prefer ANY Case A
    missingVatIsA = true;
    console.log(`\nTIER 1 MATCH: selected voucher ${missingVatVoucher.id} (Case A)`);
  }

  // TIER 4 (last resort): Case B
  if (!missingVatVoucher && caseB.length > 0) {
    console.error("WARNING: Only Case B candidates found — Check 3 will likely fail");
    missingVatVoucher = caseB.find((v: any) =>
      v.postings.some((p: any) => getAcctNumber(p) === mvPromptAcct && Math.abs(p.amountGross) === mvPromptExclVat)
    ) ?? caseB[0];
    missingVatIsA = false;
    console.log(`\nTIER 4 MATCH: selected voucher ${missingVatVoucher.id} (Case B — WILL LIKELY FAIL)`);
  }

  if (missingVatVoucher) {
    console.log(`\n=== RESULT: Selected voucher ${missingVatVoucher.id}, isCase_A=${missingVatIsA} ===`);
    console.log(`Expected: Voucher B (id=${voucherB.value.id}) should be selected (the error voucher without 2710)`);
    console.log(`Match: ${missingVatVoucher.id === voucherB.value.id ? "CORRECT" : "WRONG — selected the wrong voucher!"}`);
  } else {
    console.log("\nERROR: No missing-VAT voucher found at all!");
  }

  console.log("\n=== PHASE 5: Test key observation — what does the agent ACTUALLY see? ===");
  console.log("\nWhen the agent matches by `p.account?.number === 4500 && Math.abs(p.amountGross) === 22900`:");

  // Simulate naive matching (like production runs did)
  const naiveMatches: any[] = [];
  for (const v of vouchers) {
    for (const p of v.postings) {
      if (p.account?.number === 4500 && Math.abs(p.amountGross) === 22900) {
        naiveMatches.push({ v, p, has2710: v.postings.some((pp: any) => pp.account?.number === 2710) });
      }
    }
  }
  console.log(`  Naive matches (account.number === 4500 && |amountGross| === 22900): ${naiveMatches.length}`);
  for (const m of naiveMatches) {
    console.log(`    voucher ${m.v.id}, has2710=${m.has2710}, date=${m.v.date}, desc="${m.v.description}"`);
  }

  // Now test with getAcctNumber (account.id fallback)
  const robustMatches: any[] = [];
  for (const v of vouchers) {
    for (const p of v.postings) {
      if (getAcctNumber(p) === 4500 && Math.abs(p.amountGross) === 22900) {
        robustMatches.push({ v, p, has2710: v.postings.some((pp: any) => getAcctNumber(pp) === 2710) });
      }
    }
  }
  console.log(`\n  Robust matches (getAcctNumber === 4500 && |amountGross| === 22900): ${robustMatches.length}`);
  for (const m of robustMatches) {
    console.log(`    voucher ${m.v.id}, has2710=${m.has2710}, date=${m.v.date}, desc="${m.v.description}"`);
  }

  console.log("\n=== PHASE 6: Key insight — what if the correctly-booked voucher has DIFFERENT gross? ===");
  console.log("When booked with vatType=1, Tripletex may store the posting differently.");
  console.log("Let's check Voucher A's actual 4500 posting gross vs Voucher B's:");

  const vAFull = vouchers.find((v: any) => v.id === voucherA.value.id);
  const vBFull = vouchers.find((v: any) => v.id === voucherB.value.id);

  if (vAFull) {
    const p4500A = vAFull.postings.find((p: any) => getAcctNumber(p) === 4500);
    const p2710A = vAFull.postings.find((p: any) => getAcctNumber(p) === 2710);
    console.log(`\n  Voucher A (correctly booked, WITH 2710):`);
    console.log(`    4500: gross=${p4500A?.amountGross}, net=${p4500A?.amount}, vatType=${p4500A?.vatType?.id}`);
    console.log(`    2710: gross=${p2710A?.amountGross}, net=${p2710A?.amount}`);
    console.log(`    4500.gross === 22900? ${p4500A?.amountGross === 22900}`);
    console.log(`    |4500.gross| === 22900? ${Math.abs(p4500A?.amountGross) === 22900}`);
  }

  if (vBFull) {
    const p4500B = vBFull.postings.find((p: any) => getAcctNumber(p) === 4500);
    console.log(`\n  Voucher B (error, WITHOUT 2710):`);
    console.log(`    4500: gross=${p4500B?.amountGross}, net=${p4500B?.amount}, vatType=${p4500B?.vatType?.id}`);
    console.log(`    4500.gross === 22900? ${p4500B?.amountGross === 22900}`);
    console.log(`    |4500.gross| === 22900? ${Math.abs(p4500B?.amountGross) === 22900}`);
  }

  console.log("\n=== PHASE 7: Critical test — what does the PROMPT actually say? ===");
  console.log("The prompt says 'excl-VAT 22900'. So the prompts tested in production use:");
  console.log("  Account: 4500 (or 6500 etc.)");
  console.log("  Amount excl VAT: 22900");
  console.log("");
  console.log("The CORRECT voucher (with VAT) would have been booked as:");
  console.log("  gross=22900, vatType=1 → net=18320, auto 2710=4580");
  console.log("The ERROR voucher (without VAT) would have been booked as:");
  console.log("  gross=22900, vatType=0 → net=22900, no 2710");
  console.log("");
  console.log("BOTH vouchers have amountGross=22900 on the expense account.");
  console.log("The ONLY reliable discriminator is the 2710 posting presence.");

  console.log("\n=== PHASE 8: Now simulate what happens when agent does NOT use getAcctNumber ===");

  // Check if any postings have account.number missing but account.id present
  let missingNumberCount = 0;
  let totalPostings = 0;
  for (const v of vouchers) {
    for (const p of v.postings) {
      totalPostings++;
      if (p.account?.id && !p.account?.number && p.account.number !== 0) {
        missingNumberCount++;
        console.log(`  FOUND posting with id=${p.account.id} but NO .number in voucher ${v.id}`);
      }
    }
  }
  console.log(`\n  Checked ${totalPostings} postings across ${vouchers.length} vouchers`);
  console.log(`  Postings with account.id but NO account.number: ${missingNumberCount}`);
  if (missingNumberCount === 0) {
    console.log("  -> In this sandbox, all postings have account.number when using nested expansion");
    console.log("  -> The getAcctNumber fallback is defensive, not the root cause");
  }

  console.log("\n=== CONCLUSION ===");
  console.log("The disambiguation cascade works correctly when BOTH vouchers have amountGross=22900.");
  console.log("The critical question is: does the production task environment create both vouchers");
  console.log("with the SAME amountGross? Or does the correctly-booked one have a different gross?");
  console.log("");
  console.log("From production run logs, the agent found 1 candidate WITH 2710 but 0 WITHOUT.");
  console.log("This means either:");
  console.log("  1. The error voucher has a DIFFERENT amountGross (not 22900)");
  console.log("  2. The error voucher has account.number missing in the API response");
  console.log("  3. The error voucher was not in the date range");
  console.log("");
  console.log("The current cascade handles #1 via 'caseA[0]' fallback (any Case A regardless of amount).");
  console.log("The getAcctNumber helper handles #2.");
  console.log("The dateTo=first-of-next-month handles #3.");
  console.log("");
  console.log("But the REAL issue may be that production scripts DON'T use getAcctNumber or the");
  console.log("broad caseA[0] fallback — they match ONLY by account.number === X && |amountGross| === Y,");
  console.log("and if the error voucher's amountGross differs, it's invisible to them.");
}

main().catch(e => {
  console.error("FATAL:", e.message);
  process.exit(1);
});
