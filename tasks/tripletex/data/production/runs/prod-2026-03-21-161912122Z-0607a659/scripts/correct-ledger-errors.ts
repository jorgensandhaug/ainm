const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "P873cU8ip38aF3d5lZDIpyZPrMgZBszPlijZ2pRDMzk";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);

const headers = { Authorization: AUTH, "Content-Type": "application/json" };

async function get(path: string) {
  const url = `${BASE}${path}`;
  console.log(`GET ${url}`);
  const r = await fetch(url, { headers });
  const body = await r.json();
  if (!r.ok) { console.error("GET failed:", r.status, JSON.stringify(body)); process.exit(1); }
  return body;
}

async function post(path: string, data: any) {
  const url = `${BASE}${path}`;
  console.log(`POST ${url}`);
  const r = await fetch(url, { method: "POST", headers, body: JSON.stringify(data) });
  const body = await r.json();
  if (!r.ok) { console.error("POST failed:", r.status, JSON.stringify(body)); process.exit(1); }
  return body;
}

async function main() {
  // Step 1: Get all needed account IDs (including correction target 6860)
  const acctResp = await get("/ledger/account?number=6540,6860,7100,4500,2710&fields=id,number");
  const acctMap: Record<number, number> = {};
  for (const a of acctResp.values) {
    acctMap[a.number] = a.id;
  }
  console.log("Account map:", acctMap);

  // Step 2: Get all vouchers for Jan-Feb 2026 with nested expansion
  const vResp = await get(
    "/ledger/voucher?dateFrom=2026-01-01&dateTo=2026-03-01" +
    "&fields=id,date,description,postings(id,account(id,number),amount,amountGross,amountGrossCurrency,vatType(id),supplier(id),description)" +
    "&count=1000"
  );
  const vouchers = vResp.values;
  console.log(`Found ${vouchers.length} vouchers`);

  // --- Diagnostic: dump all 7100 postings ---
  console.log("\n--- All 7100 postings ---");
  for (const v of vouchers) {
    if (!v.postings) continue;
    for (const p of v.postings) {
      if (p.account?.number === 7100) {
        console.log(`  voucher ${v.id} date=${v.date} desc="${v.description}" posting: gross=${p.amountGross} amount=${p.amount} vatType=${p.vatType?.id}`);
      }
    }
  }
  console.log("--- End 7100 postings ---\n");

  // --- Identify the 4 errors ---

  // Error 1: Wrong account - 6540 used instead of 6860, amount 4800
  let wrongAcctVoucher: any = null;
  let wrongAcctPosting: any = null;
  let wrongAcctCounterpart: any = null;

  // Error 2: Duplicate - account 7100, amount 2000
  // Group all 7100 postings by a signature to find duplicates
  const dup7100Vouchers: any[] = [];

  // Error 3: Missing VAT - account 4500, amount HT 14500, missing VAT on 2710
  let missingVatVoucher: any = null;
  let missingVatPosting: any = null;
  let missingVatCounterpart: any = null;
  let missingVatHas2710 = false;

  // Error 4: Incorrect amount - account 7100, 21650 posted instead of 17900
  let wrongAmtVoucher: any = null;
  let wrongAmtPosting: any = null;
  let wrongAmtCounterpart: any = null;

  // Build signature map for 7100 to find duplicates
  type VoucherSig = { voucher: any; posting: any; sig: string };
  const sig7100: VoucherSig[] = [];

  for (const v of vouchers) {
    if (!v.postings) continue;
    for (const p of v.postings) {
      const acctNum = p.account?.number;
      const gross = p.amountGross;

      // Error 1: wrong account 6540, amount 4800
      if (acctNum === 6540 && Math.abs(gross) === 4800) {
        wrongAcctVoucher = v;
        wrongAcctPosting = p;
      }

      // Collect all 7100 postings
      if (acctNum === 7100) {
        // Build signature from amount + counterpart accounts
        const counterAccts = v.postings
          .filter((pp: any) => pp.account?.number !== 7100 && pp.account?.number !== 2710)
          .map((pp: any) => `${pp.account?.number}:${pp.amountGross}`)
          .sort()
          .join(",");
        const sig = `${gross}|${counterAccts}`;
        sig7100.push({ voucher: v, posting: p, sig });

        if (Math.abs(gross) === 2000) {
          dup7100Vouchers.push({ voucher: v, posting: p });
        }
        if (Math.abs(gross) === 21650) {
          wrongAmtVoucher = v;
          wrongAmtPosting = p;
        }
      }

      // Error 3: account 4500
      if (acctNum === 4500 && Math.abs(gross) === 14500) {
        missingVatVoucher = v;
        missingVatPosting = p;
      }
    }
  }

  // Find duplicate: use description keyword "duplikat" first, then signature grouping
  let dupEntry: VoucherSig | null = null;
  // Check for "duplikat" in description on 7100 postings with amount 2000
  for (const s of sig7100) {
    if (Math.abs(s.posting.amountGross) === 2000 &&
        s.voucher.description?.toLowerCase().includes("duplikat")) {
      dupEntry = s;
      break;
    }
  }
  // Fallback: signature grouping
  if (!dupEntry) {
    const sigGroups = new Map<string, VoucherSig[]>();
    for (const s of sig7100) {
      const arr = sigGroups.get(s.sig) || [];
      arr.push(s);
      sigGroups.set(s.sig, arr);
    }
    for (const [sig, entries] of sigGroups) {
      if (entries.length >= 2) {
        dupEntry = entries[entries.length - 1];
        break;
      }
    }
  }
  if (!dupEntry && dup7100Vouchers.length >= 1) {
    dupEntry = dup7100Vouchers[dup7100Vouchers.length - 1];
  }

  // Extract counterparts
  if (wrongAcctVoucher) {
    for (const p of wrongAcctVoucher.postings) {
      if (p.account?.number !== 6540 && p.account?.number !== 2710) {
        wrongAcctCounterpart = p;
        break;
      }
    }
    console.log("Error 1 (wrong account): voucher", wrongAcctVoucher.id, "posting acct", wrongAcctPosting.account.number,
      "gross", wrongAcctPosting.amountGross, "vatType", wrongAcctPosting.vatType?.id);
  }

  let dupPosting: any = null;
  let dupCounterpart: any = null;
  if (dupEntry) {
    dupPosting = dupEntry.posting;
    const dupV = dupEntry.voucher;
    for (const p of dupV.postings) {
      if (p.account?.number !== 7100 && p.account?.number !== 2710) {
        dupCounterpart = p;
        break;
      }
    }
    console.log("Error 2 (duplicate): voucher", dupV.id, "posting gross", dupPosting.amountGross,
      "vatType", dupPosting.vatType?.id, "counterpart acct", dupCounterpart?.account?.number);
  } else {
    console.error("ERROR: Could not find duplicate voucher for 7100!");
    // Dump all 7100 signatures
    for (const [sig, entries] of sigGroups) {
      console.log(`  sig="${sig}" count=${entries.length}`);
    }
  }

  // Missing VAT: check if original voucher has 2710 posting
  if (missingVatVoucher) {
    for (const p of missingVatVoucher.postings) {
      if (p.account?.number === 2710) {
        missingVatHas2710 = true;
      }
      if (p.account?.number !== 4500 && p.account?.number !== 2710) {
        missingVatCounterpart = p;
      }
    }
    console.log("Error 3 (missing VAT): voucher", missingVatVoucher.id, "posting gross", missingVatPosting.amountGross,
      "vatType", missingVatPosting.vatType?.id, "has2710", missingVatHas2710,
      "counterpart acct", missingVatCounterpart?.account?.number, "supplier", missingVatCounterpart?.supplier?.id);
  }

  if (wrongAmtVoucher) {
    for (const p of wrongAmtVoucher.postings) {
      if (p.account?.number !== 7100 && p.account?.number !== 2710) {
        wrongAmtCounterpart = p;
        break;
      }
    }
    console.log("Error 4 (wrong amount): voucher", wrongAmtVoucher.id, "posting gross", wrongAmtPosting.amountGross,
      "vatType", wrongAmtPosting.vatType?.id, "counterpart acct", wrongAmtCounterpart?.account?.number);
  }

  // Step 3: Build combined corrective voucher
  const postings: any[] = [];
  let row = 1;

  // --- Error 1: Wrong account reclassification (6540 -> 6860) ---
  const vatTypeWrongAcct = wrongAcctPosting.vatType?.id ?? 0;
  postings.push({
    row: row++,
    account: { id: acctMap[6540] },
    amountGross: -4800,
    amountGrossCurrency: -4800,
    vatType: { id: vatTypeWrongAcct },
    description: "Korreksjon: ompostering fra 6540",
  });
  postings.push({
    row: row++,
    account: { id: acctMap[6860] },
    amountGross: 4800,
    amountGrossCurrency: 4800,
    vatType: { id: vatTypeWrongAcct },
    description: "Korreksjon: ompostering til 6860",
  });

  // --- Error 2: Duplicate reversal (7100, 2000) ---
  const vatTypeDup = dupPosting.vatType?.id ?? 0;
  postings.push({
    row: row++,
    account: { id: acctMap[7100] },
    amountGross: -2000,
    amountGrossCurrency: -2000,
    vatType: { id: vatTypeDup },
    description: "Korreksjon: reversering duplikat",
  });
  const dupCounterpostLine: any = {
    row: row++,
    account: { id: dupCounterpart.account.id },
    amountGross: 2000,
    amountGrossCurrency: 2000,
    description: "Korreksjon: reversering duplikat",
  };
  if (dupCounterpart.supplier?.id) {
    dupCounterpostLine.supplier = { id: dupCounterpart.supplier.id };
  }
  postings.push(dupCounterpostLine);

  // --- Error 3: Missing VAT (4500, 14500 HT, missing 2710) ---
  const vatAmount = 14500 * 0.25; // 3625
  if (missingVatHas2710) {
    // "Other branch": VAT is present but too low because net was booked as gross
    // Correction amount = net_amount * 0.25 = 14500 * 0.25 = 3625
    postings.push({
      row: row++,
      account: { id: acctMap[4500] },
      amountGross: vatAmount,
      amountGrossCurrency: vatAmount,
      vatType: { id: 1 },
      description: "Korreksjon: manglende MVA",
    });
    const missingVatCounterLine: any = {
      row: row++,
      account: { id: missingVatCounterpart.account.id },
      amountGross: -vatAmount,
      amountGrossCurrency: -vatAmount,
      description: "Korreksjon: leverandørgjeld MVA",
    };
    if (missingVatCounterpart.supplier?.id) {
      missingVatCounterLine.supplier = { id: missingVatCounterpart.supplier.id };
    }
    postings.push(missingVatCounterLine);
  } else {
    // "Exact branch": no 2710 at all - direct VAT line add
    postings.push({
      row: row++,
      account: { id: acctMap[2710] },
      amountGross: vatAmount,
      amountGrossCurrency: vatAmount,
      description: "Korreksjon: manglende MVA",
    });
    const missingVatCounterLine: any = {
      row: row++,
      account: { id: missingVatCounterpart.account.id },
      amountGross: -vatAmount,
      amountGrossCurrency: -vatAmount,
      description: "Korreksjon: manglende MVA",
    };
    if (missingVatCounterpart.supplier?.id) {
      missingVatCounterLine.supplier = { id: missingVatCounterpart.supplier.id };
    }
    postings.push(missingVatCounterLine);
  }

  // --- Error 4: Incorrect amount (7100, 21650 posted instead of 17900) ---
  const diff = 21650 - 17900; // 3750
  const vatTypeWrongAmt = wrongAmtPosting.vatType?.id ?? 0;
  postings.push({
    row: row++,
    account: { id: acctMap[7100] },
    amountGross: -diff,
    amountGrossCurrency: -diff,
    vatType: { id: vatTypeWrongAmt },
    description: "Korreksjon: feil beløp",
  });
  const wrongAmtCounterLine: any = {
    row: row++,
    account: { id: wrongAmtCounterpart.account.id },
    amountGross: diff,
    amountGrossCurrency: diff,
    description: "Korreksjon: feil beløp",
  };
  if (wrongAmtCounterpart.supplier?.id) {
    wrongAmtCounterLine.supplier = { id: wrongAmtCounterpart.supplier.id };
  }
  postings.push(wrongAmtCounterLine);

  console.log("\nCorrection postings:", JSON.stringify(postings, null, 2));

  // POST the combined corrective voucher
  const voucherBody = {
    date: "2026-02-28",
    description: "Korreksjonsbilag: feil i januar og februar 2026",
    postings,
  };

  const result = await post("/ledger/voucher?sendToLedger=true", voucherBody);
  console.log("\nCorrective voucher created:");
  console.log("ID:", result.value?.id, "Number:", result.value?.number);
  console.log("Postings:", JSON.stringify(result.value?.postings, null, 2));
}

main().catch(e => { console.error(e); process.exit(1); });
