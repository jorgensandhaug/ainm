const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "HIsrHBuH0J2SExiuVphsDc17KD5mRkdFDJlhMx5CBD4";
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
    console.error("ERROR", res.status, JSON.stringify(json));
    throw new Error(`${res.status} ${JSON.stringify(json)}`);
  }
  return json;
}

// Task errors (from German prompt):
// 1. Wrong account: 6340 instead of 6390, amount 3050 NOK
// 2. Duplicate: account 6860, amount 1650 NOK
// 3. Missing VAT: account 4500, excl-VAT 22900 NOK, missing VAT on 2710
// 4. Wrong amount: account 6860, 24450 booked instead of 10850

async function main() {
  // Call 1: Get all needed account IDs
  const acctRes = await api("GET", "/ledger/account?number=6340,6390,6860,4500,2710&fields=id,number,vatType(id)");
  const accounts: Record<number, { id: number; vatTypeId: number }> = {};
  for (const a of acctRes.values) {
    accounts[a.number] = { id: a.id, vatTypeId: a.vatType?.id ?? 0 };
  }
  console.log("Accounts:", JSON.stringify(accounts));

  // Verify all accounts found
  for (const num of [6340, 6390, 6860, 4500, 2710]) {
    if (!accounts[num]) throw new Error(`Account ${num} not found`);
  }

  // Call 2: Discover vouchers with nested expansion
  const vRes = await api("GET", "/ledger/voucher?dateFrom=2026-01-01&dateTo=2026-03-01&fields=id,date,description,postings(id,account(id,number),amount,amountGross,amountGrossCurrency,vatType(id),supplier(id),description)&count=1000");
  const vouchers = vRes.values;
  console.log(`Found ${vouchers.length} vouchers`);

  // --- Error 1: Wrong account 6340 instead of 6390, amount 3050 ---
  let wrongAcctVoucher: any = null;
  let wrongAcctPosting: any = null;
  let wrongAcctCounterpart: any = null;
  for (const v of vouchers) {
    for (const p of v.postings) {
      if (p.account?.number === 6340 && Math.abs(p.amountGross) === 3050) {
        wrongAcctVoucher = v;
        wrongAcctPosting = p;
        // Find counterpart (opposite sign, not 6340, not 2710)
        for (const cp of v.postings) {
          if (cp.account?.number !== 6340 && cp.account?.number !== 2710 &&
              Math.sign(cp.amountGross) !== Math.sign(p.amountGross)) {
            wrongAcctCounterpart = cp;
          }
        }
        break;
      }
    }
    if (wrongAcctPosting) break;
  }
  if (!wrongAcctPosting) throw new Error("Wrong-account error not found (6340/3050)");
  console.log(`Wrong account: voucher ${wrongAcctVoucher.id}, posting gross=${wrongAcctPosting.amountGross}, vatType=${wrongAcctPosting.vatType?.id}`);

  // --- Error 2: Duplicate on 6860, amount 1650 ---
  // Priority: description keyword → signature grouping → single-entry fallback
  let dupVoucher: any = null;
  let dupPosting: any = null;
  let dupCounterpart: any = null;

  // Collect all vouchers with 6860/1650
  const dupCandidates: { v: any; p: any }[] = [];
  for (const v of vouchers) {
    for (const p of v.postings) {
      if (p.account?.number === 6860 && Math.abs(p.amountGross) === 1650) {
        dupCandidates.push({ v, p });
      }
    }
  }
  console.log(`Duplicate candidates (6860/1650): ${dupCandidates.length}`);

  // PRIMARY: description keyword
  for (const c of dupCandidates) {
    const desc = (c.v.description || "").toLowerCase();
    if (desc.includes("duplikat") || desc.includes("duplicate") || desc.includes("kopi")) {
      dupVoucher = c.v;
      dupPosting = c.p;
      break;
    }
  }

  // SECONDARY: signature grouping
  if (!dupPosting && dupCandidates.length >= 2) {
    // Group by posting signature
    const sigGroups: Record<string, { v: any; p: any }[]> = {};
    for (const c of dupCandidates) {
      const sig = c.v.postings
        .map((pp: any) => `${pp.account?.number}:${pp.amountGross}`)
        .sort()
        .join("|");
      if (!sigGroups[sig]) sigGroups[sig] = [];
      sigGroups[sig].push(c);
    }
    for (const [sig, group] of Object.entries(sigGroups)) {
      if (group.length >= 2) {
        // Pick the later voucher
        group.sort((a, b) => b.v.id - a.v.id);
        dupVoucher = group[0].v;
        dupPosting = group[0].p;
        break;
      }
    }
  }

  // TERTIARY: single-entry fallback
  if (!dupPosting && dupCandidates.length >= 1) {
    dupVoucher = dupCandidates[0].v;
    dupPosting = dupCandidates[0].p;
  }

  if (!dupPosting) throw new Error("Duplicate error not found (6860/1650)");

  // Find counterpart for duplicate
  for (const cp of dupVoucher.postings) {
    if (cp.account?.number !== 6860 && cp.account?.number !== 2710 &&
        Math.sign(cp.amountGross) !== Math.sign(dupPosting.amountGross)) {
      dupCounterpart = cp;
    }
  }
  if (!dupCounterpart) throw new Error("Duplicate counterpart not found");
  console.log(`Duplicate: voucher ${dupVoucher.id}, posting gross=${dupPosting.amountGross}, vatType=${dupPosting.vatType?.id}, counterpart acct=${dupCounterpart.account?.number}`);

  // --- Error 3: Missing VAT on 4500, excl-VAT 22900, missing 2710 ---
  // PRIORITY: First find voucher WITHOUT 2710 (Case A), then with 2710 (Case B)
  let missingVatVoucher: any = null;
  let missingVatPosting: any = null;
  let missingVatCounterpart: any = null;
  let existing2710Amount = 0;
  let isCase_A = false;

  // Collect all vouchers with 4500/22900
  const vatCandidates: { v: any; p: any; has2710: boolean; amt2710: number }[] = [];
  for (const v of vouchers) {
    for (const p of v.postings) {
      if (p.account?.number === 4500 && Math.abs(p.amountGross) === 22900) {
        const has2710 = v.postings.some((pp: any) => pp.account?.number === 2710);
        const amt2710 = v.postings
          .filter((pp: any) => pp.account?.number === 2710)
          .reduce((s: number, pp: any) => s + pp.amountGross, 0);
        vatCandidates.push({ v, p, has2710, amt2710 });
      }
    }
  }
  console.log(`Missing VAT candidates (4500/22900): ${vatCandidates.length}, has2710: ${vatCandidates.map(c => c.has2710)}`);

  // FIRST: Case A — no 2710
  for (const c of vatCandidates) {
    if (!c.has2710) {
      missingVatVoucher = c.v;
      missingVatPosting = c.p;
      isCase_A = true;
      break;
    }
  }

  // SECOND: Case B — has 2710 but too low
  if (!missingVatPosting) {
    for (const c of vatCandidates) {
      if (c.has2710) {
        missingVatVoucher = c.v;
        missingVatPosting = c.p;
        existing2710Amount = c.amt2710;
        isCase_A = false;
        break;
      }
    }
  }

  if (!missingVatPosting) throw new Error("Missing VAT error not found (4500/22900)");

  // Find counterpart for missing VAT
  for (const cp of missingVatVoucher.postings) {
    if (cp.account?.number !== 4500 && cp.account?.number !== 2710 &&
        Math.sign(cp.amountGross) !== Math.sign(missingVatPosting.amountGross)) {
      missingVatCounterpart = cp;
    }
  }
  if (!missingVatCounterpart) throw new Error("Missing VAT counterpart not found");
  console.log(`Missing VAT: voucher ${missingVatVoucher.id}, Case ${isCase_A ? "A" : "B"}, existing2710=${existing2710Amount}, counterpart acct=${missingVatCounterpart.account?.number}, supplier=${missingVatCounterpart.supplier?.id}`);

  // --- Error 4: Wrong amount on 6860, 24450 booked instead of 10850 ---
  let wrongAmtVoucher: any = null;
  let wrongAmtPosting: any = null;
  let wrongAmtCounterpart: any = null;
  for (const v of vouchers) {
    // Skip the duplicate voucher
    if (dupVoucher && v.id === dupVoucher.id) continue;
    for (const p of v.postings) {
      if (p.account?.number === 6860 && Math.abs(p.amountGross) === 24450) {
        wrongAmtVoucher = v;
        wrongAmtPosting = p;
        for (const cp of v.postings) {
          if (cp.account?.number !== 6860 && cp.account?.number !== 2710 &&
              Math.sign(cp.amountGross) !== Math.sign(p.amountGross)) {
            wrongAmtCounterpart = cp;
          }
        }
        break;
      }
    }
    if (wrongAmtPosting) break;
  }
  if (!wrongAmtPosting) throw new Error("Wrong-amount error not found (6860/24450)");
  console.log(`Wrong amount: voucher ${wrongAmtVoucher.id}, posting gross=${wrongAmtPosting.amountGross}, vatType=${wrongAmtPosting.vatType?.id}, counterpart acct=${wrongAmtCounterpart.account?.number}`);

  // --- Build correction postings ---
  const postings: any[] = [];
  let row = 1;

  // 1. Wrong account reclassification: reverse 6340, post to 6390
  const wrongAcctVatType = wrongAcctPosting.vatType?.id ?? 0;
  const targetAcctVatType = accounts[6390].vatTypeId;
  const wrongGross = Math.abs(wrongAcctPosting.amountGross);
  // Reversal on wrong account
  postings.push({
    row: row++,
    account: { id: accounts[6340].id },
    amountGross: -wrongGross,
    amountGrossCurrency: -wrongGross,
    vatType: { id: wrongAcctVatType },
    description: "Korreksjon: ompostering fra 6340",
  });
  // Post to correct account
  postings.push({
    row: row++,
    account: { id: accounts[6390].id },
    amountGross: wrongGross,
    amountGrossCurrency: wrongGross,
    vatType: { id: targetAcctVatType },
    description: "Korreksjon: ompostering til 6390",
  });

  // 2. Duplicate reversal: reverse 6860/1650
  const dupVatType = dupPosting.vatType?.id ?? 0;
  const dupGross = Math.abs(dupPosting.amountGross);
  postings.push({
    row: row++,
    account: { id: accounts[6860].id },
    amountGross: -dupGross,
    amountGrossCurrency: -dupGross,
    vatType: { id: dupVatType },
    description: "Korreksjon: reversering duplikat",
  });
  // Counterpart
  const dupCounterpartLine: any = {
    row: row++,
    account: { id: dupCounterpart.account.id },
    amountGross: dupGross,
    amountGrossCurrency: dupGross,
    description: "Korreksjon: reversering duplikat",
  };
  if (dupCounterpart.account.number === 2400 && dupCounterpart.supplier?.id) {
    dupCounterpartLine.supplier = { id: dupCounterpart.supplier.id };
  }
  postings.push(dupCounterpartLine);

  // 3. Missing VAT correction
  const netAmount = 22900; // excl VAT
  const correctVat = netAmount * 0.25; // 5725

  if (isCase_A) {
    // Case A: No 2710 exists — post full VAT directly
    console.log(`Case A: posting 2710 +${correctVat}`);
    postings.push({
      row: row++,
      account: { id: accounts[2710].id },
      amountGross: correctVat,
      amountGrossCurrency: correctVat,
      description: "Korreksjon: manglende MVA",
    });
    const vatCounterpartLine: any = {
      row: row++,
      account: { id: missingVatCounterpart.account.id },
      amountGross: -correctVat,
      amountGrossCurrency: -correctVat,
      description: "Korreksjon: manglende MVA",
    };
    if (missingVatCounterpart.account.number === 2400 && missingVatCounterpart.supplier?.id) {
      vatCounterpartLine.supplier = { id: missingVatCounterpart.supplier.id };
    }
    postings.push(vatCounterpartLine);
  } else {
    // Case B: 2710 exists but too low
    const vatShortfall = correctVat - existing2710Amount;
    const existingExpenseNet = missingVatPosting.amount; // net amount on the expense account
    const expenseNetShortfall = netAmount - Math.abs(existingExpenseNet);
    const totalShortfall = vatShortfall + expenseNetShortfall;
    console.log(`Case B: vatShortfall=${vatShortfall}, expenseNetShortfall=${expenseNetShortfall}, totalShortfall=${totalShortfall}`);

    postings.push({
      row: row++,
      account: { id: accounts[2710].id },
      amountGross: vatShortfall,
      amountGrossCurrency: vatShortfall,
      description: "Korreksjon: manglende MVA",
    });
    postings.push({
      row: row++,
      account: { id: accounts[4500].id },
      amountGross: expenseNetShortfall,
      amountGrossCurrency: expenseNetShortfall,
      vatType: { id: 0 },
      description: "Korreksjon: manglende MVA",
    });
    const vatCounterpartLine: any = {
      row: row++,
      account: { id: missingVatCounterpart.account.id },
      amountGross: -totalShortfall,
      amountGrossCurrency: -totalShortfall,
      description: "Korreksjon: manglende MVA",
    };
    if (missingVatCounterpart.account.number === 2400 && missingVatCounterpart.supplier?.id) {
      vatCounterpartLine.supplier = { id: missingVatCounterpart.supplier.id };
    }
    postings.push(vatCounterpartLine);
  }

  // 4. Incorrect amount: 6860 24450 booked instead of 10850 → difference = 24450-10850 = 13600
  const wrongAmtVatType = wrongAmtPosting.vatType?.id ?? 0;
  const difference = 24450 - 10850; // 13600
  postings.push({
    row: row++,
    account: { id: accounts[6860].id },
    amountGross: -difference,
    amountGrossCurrency: -difference,
    vatType: { id: wrongAmtVatType },
    description: "Korreksjon: feil beløp",
  });
  const wrongAmtCounterpartLine: any = {
    row: row++,
    account: { id: wrongAmtCounterpart.account.id },
    amountGross: difference,
    amountGrossCurrency: difference,
    description: "Korreksjon: feil beløp",
  };
  if (wrongAmtCounterpart.account.number === 2400 && wrongAmtCounterpart.supplier?.id) {
    wrongAmtCounterpartLine.supplier = { id: wrongAmtCounterpart.supplier.id };
  }
  postings.push(wrongAmtCounterpartLine);

  console.log(`\nPosting ${postings.length} correction lines:`);
  for (const p of postings) {
    console.log(`  row ${p.row}: acct ${p.account.id}, gross=${p.amountGross}, vatType=${p.vatType?.id ?? "none"}, desc="${p.description}"${p.supplier ? `, supplier=${p.supplier.id}` : ""}`);
  }

  // Call 3: Post combined corrective voucher
  const correctionBody = {
    date: "2026-02-28",
    description: "Korreksjonsbilag januar-februar 2026",
    postings,
  };

  const postRes = await api("POST", "/ledger/voucher?sendToLedger=true", correctionBody);
  console.log("\nCorrection voucher created:");
  console.log(`  ID: ${postRes.value.id}, Number: ${postRes.value.number}`);
  console.log(`  Postings: ${postRes.value.postings?.length}`);
  if (postRes.value.postings) {
    for (const p of postRes.value.postings) {
      console.log(`    row ${p.row}: acct ${p.account?.id} (${p.account?.number}), amount=${p.amount}, gross=${p.amountGross}`);
    }
  }
  console.log("\nDone. 3 API calls total.");
}

main().catch((e) => {
  console.error("FATAL:", e.message);
  process.exit(1);
});
