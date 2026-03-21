const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "ykBE5lXVQgtzkLCce1KOFM_ALed0Va9edkvY3xD4oDE";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  console.log(`${method} ${url}`);
  const opts: any = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!r.ok) {
    console.error(`${r.status}`, JSON.stringify(data, null, 2));
    throw new Error(`${r.status}`);
  }
  return data;
}

async function main() {
  // Step 1: Account lookup - all error accounts + correction targets + VAT account
  const acctResp = await api("GET",
    "/ledger/account?number=7140,7100,7000,6500,2710,6590&fields=id,number,vatType(id)");
  const accts: Record<number, { id: number; vatTypeId: number }> = {};
  for (const a of acctResp.values) {
    accts[a.number] = { id: a.id, vatTypeId: a.vatType?.id ?? 0 };
  }
  console.log("Accounts:", JSON.stringify(accts));

  // Step 2: Voucher discovery Jan-Feb 2026 (dateTo exclusive → 2026-03-01)
  const vResp = await api("GET",
    "/ledger/voucher?dateFrom=2026-01-01&dateTo=2026-03-01&fields=id,date,description,postings(id,account(id,number),amount,amountGross,amountGrossCurrency,vatType(id),supplier(id),description)&count=1000");
  const vouchers = vResp.values;
  console.log(`Found ${vouchers.length} vouchers`);

  // --- Error 1: Wrong account 7140 → 7100, amount 2250 ---
  let wrongAcctVoucher: any = null;
  let wrongAcctPosting: any = null;
  let wrongAcctCounterpart: any = null;
  for (const v of vouchers) {
    for (const p of v.postings || []) {
      if (p.account?.number === 7140 && Math.abs(p.amountGross) === 2250) {
        wrongAcctVoucher = v;
        wrongAcctPosting = p;
        // Find counterpart: opposite-signed, not 7140, not 2710
        for (const cp of v.postings) {
          if (cp.account?.number !== 7140 && cp.account?.number !== 2710 &&
              Math.sign(cp.amountGross) !== Math.sign(p.amountGross)) {
            wrongAcctCounterpart = cp;
          }
        }
        break;
      }
    }
    if (wrongAcctPosting) break;
  }
  if (!wrongAcctPosting) throw new Error("Wrong-account error not found (7140/2250)");
  console.log("Wrong account posting:", wrongAcctPosting.id, "vatType:", wrongAcctPosting.vatType?.id,
    "counterpart acct:", wrongAcctCounterpart?.account?.number);

  // --- Error 2: Duplicate voucher, account 7000, amount 4400 ---
  // Detection cascade: description keyword → signature grouping → single-entry fallback
  let dupVoucher: any = null;
  let dupExpensePosting: any = null;
  let dupCounterpart: any = null;

  // PRIMARY: description keyword
  for (const v of vouchers) {
    const desc = (v.description || "").toLowerCase();
    if (desc.includes("duplikat") || desc.includes("duplicate")) {
      for (const p of v.postings || []) {
        if (p.account?.number === 7000 && Math.abs(p.amountGross) === 4400) {
          dupVoucher = v;
          dupExpensePosting = p;
          break;
        }
      }
    }
    if (dupExpensePosting) break;
  }

  // SECONDARY: signature grouping
  if (!dupExpensePosting) {
    const sigMap: Record<string, any[]> = {};
    for (const v of vouchers) {
      for (const p of v.postings || []) {
        if (p.account?.number === 7000 && Math.abs(p.amountGross) === 4400) {
          const sig = (v.postings || [])
            .map((pp: any) => `${pp.account?.number}:${pp.amountGross}`)
            .sort().join("|");
          if (!sigMap[sig]) sigMap[sig] = [];
          sigMap[sig].push({ v, p });
        }
      }
    }
    for (const [, entries] of Object.entries(sigMap)) {
      if (entries.length >= 2) {
        // Pick the last one as the duplicate
        const last = entries[entries.length - 1];
        dupVoucher = last.v;
        dupExpensePosting = last.p;
        break;
      }
    }
  }

  // TERTIARY: single-entry fallback
  if (!dupExpensePosting) {
    for (const v of vouchers) {
      for (const p of v.postings || []) {
        if (p.account?.number === 7000 && Math.abs(p.amountGross) === 4400) {
          dupVoucher = v;
          dupExpensePosting = p;
          break;
        }
      }
      if (dupExpensePosting) break;
    }
  }

  if (!dupExpensePosting) throw new Error("Duplicate error not found (7000/4400)");
  // Find counterpart for duplicate
  for (const cp of (dupVoucher.postings || [])) {
    if (cp.account?.number !== 7000 && cp.account?.number !== 2710 &&
        Math.sign(cp.amountGross) !== Math.sign(dupExpensePosting.amountGross)) {
      dupCounterpart = cp;
    }
  }
  console.log("Duplicate posting:", dupExpensePosting.id, "vatType:", dupExpensePosting.vatType?.id,
    "counterpart:", dupCounterpart?.account?.number);

  // --- Error 3: Missing VAT, account 6500, net 14100, missing 2710 ---
  let vatVoucher: any = null;
  let vatExpensePosting: any = null;
  let vatCounterpart: any = null;
  let existing2710: any = null;

  for (const v of vouchers) {
    let has6500 = false;
    let has2710posting: any = null;
    let expPost: any = null;
    for (const p of v.postings || []) {
      if (p.account?.number === 6500) {
        // The prompt says "valor sem IVA 14100 NOK" = amount without VAT is 14100
        // Check if gross matches 14100 (booked without VAT)
        if (Math.abs(p.amountGross) === 14100) {
          has6500 = true;
          expPost = p;
        }
      }
      if (p.account?.number === 2710) {
        has2710posting = p;
      }
    }
    if (has6500) {
      vatVoucher = v;
      vatExpensePosting = expPost;
      existing2710 = has2710posting;
      // Find counterpart: not 6500, not 2710, opposite sign
      for (const cp of v.postings) {
        if (cp.account?.number !== 6500 && cp.account?.number !== 2710 &&
            Math.sign(cp.amountGross) !== Math.sign(expPost.amountGross)) {
          vatCounterpart = cp;
        }
      }
      break;
    }
  }

  if (!vatExpensePosting) throw new Error("Missing VAT error not found (6500/14100)");
  console.log("Missing VAT posting:", vatExpensePosting.id, "existing 2710:", existing2710?.amountGross,
    "counterpart:", vatCounterpart?.account?.number, "supplier:", vatCounterpart?.supplier?.id);

  // --- Error 4: Incorrect amount, account 6590, 13150 recorded instead of 11650 ---
  let amtVoucher: any = null;
  let amtPosting: any = null;
  let amtCounterpart: any = null;

  for (const v of vouchers) {
    for (const p of v.postings || []) {
      if (p.account?.number === 6590 && Math.abs(p.amountGross) === 13150) {
        amtVoucher = v;
        amtPosting = p;
        for (const cp of v.postings) {
          if (cp.account?.number !== 6590 && cp.account?.number !== 2710 &&
              Math.sign(cp.amountGross) !== Math.sign(p.amountGross)) {
            amtCounterpart = cp;
          }
        }
        break;
      }
    }
    if (amtPosting) break;
  }

  if (!amtPosting) throw new Error("Incorrect amount error not found (6590/13150)");
  console.log("Incorrect amount posting:", amtPosting.id, "vatType:", amtPosting.vatType?.id,
    "counterpart:", amtCounterpart?.account?.number);

  // --- Step 3: Build combined corrective voucher ---
  const lines: any[] = [];
  let row = 1;

  // Error 1: Wrong account reclassification 7140 → 7100
  const wrongOrigVatType = wrongAcctPosting.vatType?.id ?? 0;
  const targetVatType = accts[7100].vatTypeId; // 7100 is locked to vatType 0
  const wrongGross = Math.abs(wrongAcctPosting.amountGross);
  lines.push({
    row: row++,
    account: { id: accts[7140].id },
    amountGross: -wrongGross,
    amountGrossCurrency: -wrongGross,
    vatType: { id: wrongOrigVatType },
    description: "Korreksjon: ompostering fra 7140"
  });
  lines.push({
    row: row++,
    account: { id: accts[7100].id },
    amountGross: wrongGross,
    amountGrossCurrency: wrongGross,
    vatType: { id: targetVatType },
    description: "Korreksjon: ompostering til 7100"
  });

  // Error 2: Duplicate reversal
  const dupOrigVatType = dupExpensePosting.vatType?.id ?? 0;
  const dupGross = Math.abs(dupExpensePosting.amountGross);
  const dupCounterGross = Math.abs(dupCounterpart.amountGross);
  // Reverse the expense posting
  lines.push({
    row: row++,
    account: { id: accts[7000].id },
    amountGross: dupExpensePosting.amountGross > 0 ? -dupGross : dupGross,
    amountGrossCurrency: dupExpensePosting.amountGross > 0 ? -dupGross : dupGross,
    vatType: { id: dupOrigVatType },
    description: "Korreksjon: reversering duplikat"
  });
  // Reverse the counterpart
  lines.push({
    row: row++,
    account: { id: dupCounterpart.account.id },
    amountGross: dupCounterpart.amountGross > 0 ? -dupCounterGross : dupCounterGross,
    amountGrossCurrency: dupCounterpart.amountGross > 0 ? -dupCounterGross : dupCounterGross,
    description: "Korreksjon: reversering duplikat"
  });

  // Error 3: Missing VAT
  const netAmount = 14100; // excl. VAT amount from prompt
  const correctVat = netAmount * 0.25; // 3525

  if (!existing2710) {
    // Case A: No 2710 posting at all - full VAT missing
    lines.push({
      row: row++,
      account: { id: accts[2710].id },
      amountGross: correctVat,
      amountGrossCurrency: correctVat,
      description: "Korreksjon: manglende MVA"
    });
    const counterLine: any = {
      row: row++,
      account: { id: vatCounterpart.account.id },
      amountGross: -correctVat,
      amountGrossCurrency: -correctVat,
      description: "Korreksjon: manglende MVA"
    };
    if (vatCounterpart.account.number === 2400 && vatCounterpart.supplier?.id) {
      counterLine.supplier = { id: vatCounterpart.supplier.id };
    }
    lines.push(counterLine);
  } else {
    // Case B: 2710 exists but VAT is too low
    const existing2710Amount = Math.abs(existing2710.amountGross);
    const vatShortfall = correctVat - existing2710Amount;
    const existingExpenseNet = Math.abs(vatExpensePosting.amount); // net from original
    const expenseNetShortfall = netAmount - existingExpenseNet;
    const totalShortfall = vatShortfall + expenseNetShortfall;

    console.log(`Case B: existing2710=${existing2710Amount}, correctVat=${correctVat}, vatShortfall=${vatShortfall}, expenseNetShortfall=${expenseNetShortfall}, totalShortfall=${totalShortfall}`);

    lines.push({
      row: row++,
      account: { id: accts[2710].id },
      amountGross: vatShortfall,
      amountGrossCurrency: vatShortfall,
      description: "Korreksjon: manglende MVA"
    });
    lines.push({
      row: row++,
      account: { id: accts[6500].id },
      amountGross: expenseNetShortfall,
      amountGrossCurrency: expenseNetShortfall,
      vatType: { id: 0 },
      description: "Korreksjon: manglende MVA"
    });
    const counterLine: any = {
      row: row++,
      account: { id: vatCounterpart.account.id },
      amountGross: -totalShortfall,
      amountGrossCurrency: -totalShortfall,
      description: "Korreksjon: manglende MVA"
    };
    if (vatCounterpart.account.number === 2400 && vatCounterpart.supplier?.id) {
      counterLine.supplier = { id: vatCounterpart.supplier.id };
    }
    lines.push(counterLine);
  }

  // Error 4: Incorrect amount 6590: 13150 → 11650, diff = 1500
  const amtDiff = 13150 - 11650; // 1500
  const amtOrigVatType = amtPosting.vatType?.id ?? 0;
  lines.push({
    row: row++,
    account: { id: accts[6590].id },
    amountGross: -amtDiff,
    amountGrossCurrency: -amtDiff,
    vatType: { id: amtOrigVatType },
    description: "Korreksjon: feil beløp"
  });
  lines.push({
    row: row++,
    account: { id: amtCounterpart.account.id },
    amountGross: amtDiff,
    amountGrossCurrency: amtDiff,
    description: "Korreksjon: feil beløp"
  });

  console.log("Correction lines:", JSON.stringify(lines, null, 2));

  // Step 3: POST combined corrective voucher
  const voucherBody = {
    date: "2026-02-28",
    description: "Korreksjonsbilag: feil i hovedbok jan-feb 2026",
    postings: lines
  };
  const result = await api("POST", "/ledger/voucher?sendToLedger=true", voucherBody);
  console.log("Corrective voucher created:", JSON.stringify(result, null, 2));
}

main().catch(e => { console.error(e); process.exit(1); });
