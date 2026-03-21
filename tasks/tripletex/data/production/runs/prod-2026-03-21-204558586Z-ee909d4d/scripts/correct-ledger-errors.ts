const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "94Mppa0ZUN1qjO2795r9pJe7kRuFcZl1NM0GdyJuxj0";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

let callCount = 0;
async function api(method: string, path: string, body?: any) {
  callCount++;
  const url = `${BASE}${path}`;
  console.log(`[Call ${callCount}] ${method} ${url}`);
  const res = await fetch(url, {
    method,
    headers: H,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`HTTP ${res.status}: ${text}`);
    throw new Error(`HTTP ${res.status}`);
  }
  return JSON.parse(text);
}

// Task errors:
// 1. Wrong account: 7140 used instead of 7100, amount 2250
// 2. Duplicate: account 7000, amount 4400
// 3. Missing VAT: account 6500, excl VAT 14100, missing VAT on 2710
// 4. Wrong amount: account 6590, 13150 recorded instead of 11650

// Call 1: Get all account IDs + vatType
const acctNumbers = [7140, 7100, 7000, 6500, 2710, 6590];
const acctData = await api(
  "GET",
  `/ledger/account?number=${acctNumbers.join(",")}&fields=id,number,vatType(id)`
);
const acctMap: Record<number, { id: number; vatTypeId: number }> = {};
for (const a of acctData.values) {
  acctMap[a.number] = { id: a.id, vatTypeId: a.vatType?.id ?? 0 };
}
console.log("Account map:", JSON.stringify(acctMap));

// Verify all accounts found
for (const n of acctNumbers) {
  if (!acctMap[n]) throw new Error(`Account ${n} not found`);
}

// Call 2: Get all vouchers Jan-Feb 2026 with nested expansion
const voucherData = await api(
  "GET",
  `/ledger/voucher?dateFrom=2026-01-01&dateTo=2026-03-01&fields=id,date,description,postings(id,account(id,number),amount,amountGross,amountGrossCurrency,vatType(id),supplier(id),description)&count=1000`
);
const vouchers = voucherData.values;
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
      break;
    }
  }
  if (wrongAcctPosting) break;
}
if (!wrongAcctPosting) throw new Error("Wrong-account error not found (7140/2250)");

// Find counterpart (opposite-signed, not 7140, not 2710)
for (const p of wrongAcctVoucher.postings || []) {
  if (p.account?.number !== 7140 && p.account?.number !== 2710) {
    wrongAcctCounterpart = p;
  }
}
console.log(`Wrong account: voucher ${wrongAcctVoucher.id}, posting gross=${wrongAcctPosting.amountGross}, vatType=${wrongAcctPosting.vatType?.id}, counterpart acct=${wrongAcctCounterpart?.account?.number}`);

// --- Error 2: Duplicate on account 7000, amount 4400 ---
let dupPosting: any = null;
let dupVoucher: any = null;
let dupCounterpart: any = null;

// PRIMARY: description keyword "duplikat"
for (const v of vouchers) {
  const desc = (v.description || "").toLowerCase();
  if (desc.includes("duplikat") || desc.includes("duplicate")) {
    for (const p of v.postings || []) {
      if (p.account?.number === 7000 && Math.abs(p.amountGross) === 4400) {
        dupPosting = p;
        dupVoucher = v;
        break;
      }
    }
  }
  if (dupPosting) break;
}

// SECONDARY: signature grouping
if (!dupPosting) {
  const candidates: any[] = [];
  for (const v of vouchers) {
    for (const p of v.postings || []) {
      if (p.account?.number === 7000 && Math.abs(p.amountGross) === 4400) {
        candidates.push({ voucher: v, posting: p });
      }
    }
  }
  if (candidates.length >= 2) {
    // Pick the later one as duplicate
    dupPosting = candidates[candidates.length - 1].posting;
    dupVoucher = candidates[candidates.length - 1].voucher;
  }
}

// TERTIARY: single-entry fallback
if (!dupPosting) {
  for (const v of vouchers) {
    for (const p of v.postings || []) {
      if (p.account?.number === 7000 && Math.abs(p.amountGross) === 4400) {
        dupPosting = p;
        dupVoucher = v;
        break;
      }
    }
    if (dupPosting) break;
  }
}

if (!dupPosting) throw new Error("Duplicate error not found (7000/4400)");

// Find counterpart for duplicate (not 7000, not 2710)
for (const p of dupVoucher.postings || []) {
  if (p.account?.number !== 7000 && p.account?.number !== 2710) {
    dupCounterpart = p;
  }
}
console.log(`Duplicate: voucher ${dupVoucher.id}, posting gross=${dupPosting.amountGross}, vatType=${dupPosting.vatType?.id}, counterpart acct=${dupCounterpart?.account?.number}`);

// --- Error 3: Missing VAT on 6500, excl VAT 14100, missing on 2710 ---
let missingVatVoucher: any = null;
let missingVatPosting: any = null;
let missingVatCounterpart: any = null;
let existing2710Amount = 0;
let hasCaseB = false;

for (const v of vouchers) {
  let has6500 = false;
  let posting6500: any = null;
  let has2710 = false;
  let amount2710 = 0;

  for (const p of v.postings || []) {
    if (p.account?.number === 6500) {
      // Check if this voucher is related to the 14100 excl VAT amount
      // The gross could be 14100 (if booked without VAT) or 17625 (if properly incl VAT)
      has6500 = true;
      posting6500 = p;
    }
    if (p.account?.number === 2710) {
      has2710 = true;
      amount2710 = p.amountGross || p.amount || 0;
    }
  }

  if (has6500 && posting6500) {
    // Check if this is the missing VAT voucher
    // Net amount should relate to 14100: if booked as gross with VAT, net=14100*0.8=11280 and gross=14100
    // Or if booked correctly gross=17625 and net=14100
    // The prompt says "valor sem IVA 14100 NOK" = amount without VAT = 14100
    // So net should be 14100. If VAT is missing, gross might equal net (14100) or gross might be 14100 with wrong VAT calc

    // Look for a 6500 posting where the amounts make sense for 14100 excl VAT
    const gross = Math.abs(posting6500.amountGross);
    const net = Math.abs(posting6500.amount);

    // If properly posted with VAT: gross=17625, net=14100
    // If posted without VAT: gross=14100, net=14100
    // If net booked as gross (Case B): gross=14100, net=11280, 2710=2820

    if (net === 14100 || gross === 14100) {
      missingVatVoucher = v;
      missingVatPosting = posting6500;
      if (has2710) {
        hasCaseB = true;
        existing2710Amount = Math.abs(amount2710);
      }
      break;
    }
  }
}

if (!missingVatPosting) throw new Error("Missing VAT error not found (6500/14100)");

// Find counterpart for missing VAT (not 6500, not 2710)
for (const p of missingVatVoucher.postings || []) {
  if (p.account?.number !== 6500 && p.account?.number !== 2710) {
    missingVatCounterpart = p;
  }
}

console.log(`Missing VAT: voucher ${missingVatVoucher.id}, 6500 gross=${missingVatPosting.amountGross}, net=${missingVatPosting.amount}, has2710=${hasCaseB}, existing2710=${existing2710Amount}, counterpart acct=${missingVatCounterpart?.account?.number}`);

// --- Error 4: Wrong amount on 6590, 13150 recorded instead of 11650 ---
let wrongAmtVoucher: any = null;
let wrongAmtPosting: any = null;
let wrongAmtCounterpart: any = null;

for (const v of vouchers) {
  for (const p of v.postings || []) {
    if (p.account?.number === 6590 && Math.abs(p.amountGross) === 13150) {
      wrongAmtVoucher = v;
      wrongAmtPosting = p;
      break;
    }
  }
  if (wrongAmtPosting) break;
}

if (!wrongAmtPosting) throw new Error("Wrong-amount error not found (6590/13150)");

// Find counterpart (not 6590, not 2710)
for (const p of wrongAmtVoucher.postings || []) {
  if (p.account?.number !== 6590 && p.account?.number !== 2710) {
    wrongAmtCounterpart = p;
  }
}
console.log(`Wrong amount: voucher ${wrongAmtVoucher.id}, posting gross=${wrongAmtPosting.amountGross}, vatType=${wrongAmtPosting.vatType?.id}, counterpart acct=${wrongAmtCounterpart?.account?.number}`);

// === Build combined corrective voucher ===
const postings: any[] = [];
let row = 1;

// --- Correction 1: Wrong account 7140→7100 (reclassification) ---
// Reversal on 7140 with original vatType, target on 7100 with 7100's vatType
const origVatType7140 = wrongAcctPosting.vatType?.id ?? 0;
const targetVatType7100 = acctMap[7100].vatTypeId;
const wrongGross = Math.abs(wrongAcctPosting.amountGross);

postings.push({
  row: row++,
  account: { id: acctMap[7140].id },
  amountGross: -wrongGross,
  amountGrossCurrency: -wrongGross,
  vatType: { id: origVatType7140 },
  description: "Korreksjon: ompostering fra 7140",
});
postings.push({
  row: row++,
  account: { id: acctMap[7100].id },
  amountGross: wrongGross,
  amountGrossCurrency: wrongGross,
  vatType: { id: targetVatType7100 },
  description: "Korreksjon: ompostering til 7100",
});

// --- Correction 2: Duplicate reversal on 7000 ---
const dupGross = Math.abs(dupPosting.amountGross);
const dupVatType = dupPosting.vatType?.id ?? 0;

postings.push({
  row: row++,
  account: { id: acctMap[7000].id },
  amountGross: -dupGross,
  amountGrossCurrency: -dupGross,
  vatType: { id: dupVatType },
  description: "Korreksjon: reversering duplikat",
});
postings.push({
  row: row++,
  account: { id: dupCounterpart.account.id },
  amountGross: dupGross,
  amountGrossCurrency: dupGross,
  description: "Korreksjon: reversering duplikat",
});

// --- Correction 3: Missing VAT on 6500 (14100 excl VAT) ---
// From the 7th production run (db732541) with same params: Case B with existing 2710=2820
// correct_vat = 14100 * 0.25 = 3525
// vat_shortfall = 3525 - existing2710
// expense_net_shortfall = 14100 - existing_net_on_6500
// total_shortfall = vat_shortfall + expense_net_shortfall

const correctVat = 14100 * 0.25; // 3525
const existingNet = Math.abs(missingVatPosting.amount);
const existingGross6500 = Math.abs(missingVatPosting.amountGross);

if (hasCaseB) {
  // Case B: 2710 exists but too low
  const vatShortfall = correctVat - existing2710Amount;
  const expenseNetShortfall = 14100 - existingNet;
  const totalShortfall = vatShortfall + expenseNetShortfall;

  console.log(`Case B: correctVat=${correctVat}, existing2710=${existing2710Amount}, vatShortfall=${vatShortfall}, existingNet=${existingNet}, expenseNetShortfall=${expenseNetShortfall}, totalShortfall=${totalShortfall}`);

  postings.push({
    row: row++,
    account: { id: acctMap[2710].id },
    amountGross: vatShortfall,
    amountGrossCurrency: vatShortfall,
    description: "Korreksjon: manglende MVA",
  });
  postings.push({
    row: row++,
    account: { id: acctMap[6500].id },
    amountGross: expenseNetShortfall,
    amountGrossCurrency: expenseNetShortfall,
    vatType: { id: 0 },
    description: "Korreksjon: manglende MVA",
  });

  // Counterpart (likely 2400 with supplier)
  const counterpartAcctId = missingVatCounterpart.account.id;
  const supplierId = missingVatCounterpart.supplier?.id;
  const counterpartLine: any = {
    row: row++,
    account: { id: counterpartAcctId },
    amountGross: -totalShortfall,
    amountGrossCurrency: -totalShortfall,
    description: "Korreksjon: manglende MVA",
  };
  if (supplierId) counterpartLine.supplier = { id: supplierId };
  postings.push(counterpartLine);
} else {
  // Case A: No 2710 at all — post full VAT directly
  const vatAmount = correctVat; // 3525
  postings.push({
    row: row++,
    account: { id: acctMap[2710].id },
    amountGross: vatAmount,
    amountGrossCurrency: vatAmount,
    description: "Korreksjon: manglende MVA",
  });

  const counterpartAcctId = missingVatCounterpart.account.id;
  const supplierId = missingVatCounterpart.supplier?.id;
  const counterpartLine: any = {
    row: row++,
    account: { id: counterpartAcctId },
    amountGross: -vatAmount,
    amountGrossCurrency: -vatAmount,
    description: "Korreksjon: manglende MVA",
  };
  if (supplierId) counterpartLine.supplier = { id: supplierId };
  postings.push(counterpartLine);
}

// --- Correction 4: Wrong amount on 6590 (13150→11650) ---
const amtDiff = 13150 - 11650; // 1500
const wrongAmtVatType = wrongAmtPosting.vatType?.id ?? 0;

postings.push({
  row: row++,
  account: { id: acctMap[6590].id },
  amountGross: -amtDiff,
  amountGrossCurrency: -amtDiff,
  vatType: { id: wrongAmtVatType },
  description: "Korreksjon: feil beløp",
});
postings.push({
  row: row++,
  account: { id: wrongAmtCounterpart.account.id },
  amountGross: amtDiff,
  amountGrossCurrency: amtDiff,
  description: "Korreksjon: feil beløp",
});

console.log(`\nPosting ${postings.length} correction lines:`);
for (const p of postings) {
  console.log(`  row ${p.row}: acct ${p.account.id}, gross=${p.amountGross}, vatType=${p.vatType?.id ?? "none"}, supplier=${p.supplier?.id ?? "none"}, desc="${p.description}"`);
}

// Call 3: Post combined corrective voucher
const voucherBody = {
  date: "2026-02-28",
  description: "Korreksjonsbilag januar-februar 2026",
  postings,
};

const result = await api("POST", "/ledger/voucher?sendToLedger=true", voucherBody);
console.log(`\nCorrective voucher created: id=${result.value.id}, number=${result.value.number}`);
console.log(`Total API calls: ${callCount}`);

// Log returned postings for verification
for (const p of result.value.postings || []) {
  console.log(`  Posted: acct=${p.account?.id} (${p.account?.number}), gross=${p.amountGross}, net=${p.amount}, vatType=${p.vatType?.id}`);
}
