const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const AUTH = "Basic " + btoa("0:w0vLIZlh19K8fdPkiJbfboS3ZMJsOCw3LDnhPPQ4FlU");
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  console.log(`${method} ${url}`);
  const opts: any = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  if (!r.ok) {
    console.error(`HTTP ${r.status}: ${text}`);
    throw new Error(`HTTP ${r.status}`);
  }
  return JSON.parse(text);
}

// ── Call 1: Resolve all account IDs ──
// Accounts: 7140 (wrong), 7100 (correct target), 6540 (duplicate), 4500 (missing VAT), 2710 (VAT account), 6860 (incorrect amount)
const acctRes = await api("GET", "/ledger/account?number=7140,7100,6540,4500,2710,6860&fields=id,number");
const acctMap: Record<number, number> = {};
for (const a of acctRes.values) acctMap[a.number] = a.id;
console.log("Account map:", acctMap);

const needed = [7140, 7100, 6540, 4500, 2710, 6860];
for (const n of needed) {
  if (!acctMap[n]) { console.error(`Account ${n} not found!`); process.exit(1); }
}

// ── Call 2: Discover vouchers with nested expansion ──
const vRes = await api("GET",
  "/ledger/voucher?dateFrom=2026-01-01&dateTo=2026-03-01" +
  "&fields=id,date,description,postings(id,account(id,number),amount,amountGross,amountGrossCurrency,vatType(id),supplier(id),description)" +
  "&count=1000"
);
const vouchers = vRes.values;
console.log(`Found ${vouchers.length} vouchers`);

// ── Error 1: Wrong account — 7140 used instead of 7100, amount 7500 ──
let wrongAcctVoucher: any = null;
let wrongAcctPosting: any = null;
let wrongAcctCounterpart: any = null;

for (const v of vouchers) {
  for (const p of v.postings) {
    if (p.account?.number === 7140 && Math.abs(p.amountGross) === 7500) {
      wrongAcctVoucher = v;
      wrongAcctPosting = p;
      break;
    }
  }
  if (wrongAcctPosting) break;
}

if (!wrongAcctPosting) {
  // Try matching by amount on 7140
  for (const v of vouchers) {
    for (const p of v.postings) {
      if (p.account?.number === 7140 && p.amountGross === 7500) {
        wrongAcctVoucher = v;
        wrongAcctPosting = p;
        break;
      }
    }
    if (wrongAcctPosting) break;
  }
}

if (!wrongAcctPosting) { console.error("Wrong account posting not found!"); process.exit(1); }

// Find counterpart (opposite-signed, not 2710)
for (const p of wrongAcctVoucher.postings) {
  if (p.account?.number !== 7140 && p.account?.number !== 2710) {
    wrongAcctCounterpart = p;
  }
}
console.log(`Wrong account: voucher ${wrongAcctVoucher.id}, posting ${wrongAcctPosting.id}, gross=${wrongAcctPosting.amountGross}, vatType=${wrongAcctPosting.vatType?.id}, counterpart acct=${wrongAcctCounterpart?.account?.number}`);

// ── Error 2: Duplicate voucher — account 6540, amount 1000 ──
let dupVoucher: any = null;
let dupPosting: any = null;
let dupCounterpart: any = null;

// PRIMARY: description keyword "duplikat"
for (const v of vouchers) {
  const desc = (v.description || "").toLowerCase();
  if (desc.includes("duplikat") || desc.includes("duplicate")) {
    for (const p of v.postings) {
      if (p.account?.number === 6540 && Math.abs(p.amountGross) === 1000) {
        dupVoucher = v;
        dupPosting = p;
        break;
      }
    }
    if (!dupPosting) {
      // Check posting descriptions too
      for (const p of v.postings) {
        const pdesc = (p.description || "").toLowerCase();
        if (pdesc.includes("duplikat") && p.account?.number === 6540 && Math.abs(p.amountGross) === 1000) {
          dupVoucher = v;
          dupPosting = p;
          break;
        }
      }
    }
  }
  if (dupPosting) break;
}

// SECONDARY: signature grouping
if (!dupPosting) {
  const matchingVouchers: any[] = [];
  for (const v of vouchers) {
    for (const p of v.postings) {
      if (p.account?.number === 6540 && Math.abs(p.amountGross) === 1000) {
        matchingVouchers.push({ voucher: v, posting: p });
      }
    }
  }
  if (matchingVouchers.length >= 2) {
    // Pick the later one (higher voucher ID)
    matchingVouchers.sort((a: any, b: any) => b.voucher.id - a.voucher.id);
    dupVoucher = matchingVouchers[0].voucher;
    dupPosting = matchingVouchers[0].posting;
  } else if (matchingVouchers.length === 1) {
    // TERTIARY: single-entry fallback
    dupVoucher = matchingVouchers[0].voucher;
    dupPosting = matchingVouchers[0].posting;
  }
}

if (!dupPosting) { console.error("Duplicate posting not found!"); process.exit(1); }

// Find counterpart for duplicate
for (const p of dupVoucher.postings) {
  if (p.account?.number !== 6540 && p.account?.number !== 2710) {
    dupCounterpart = p;
  }
}
console.log(`Duplicate: voucher ${dupVoucher.id}, posting ${dupPosting.id}, gross=${dupPosting.amountGross}, vatType=${dupPosting.vatType?.id}, counterpart acct=${dupCounterpart?.account?.number}`);

// ── Error 3: Missing VAT — account 4500, 21500 NOK excl. VAT, missing VAT on 2710 ──
let vatVoucher: any = null;
let vatPosting: any = null;
let vatCounterpart: any = null;
let existing2710: any = null;

for (const v of vouchers) {
  let has4500 = false;
  let posting4500: any = null;
  let has2710 = false;
  let posting2710: any = null;

  for (const p of v.postings) {
    if (p.account?.number === 4500) {
      // Check if the amount relates to 21500
      has4500 = true;
      posting4500 = p;
    }
    if (p.account?.number === 2710) {
      has2710 = true;
      posting2710 = p;
    }
  }

  if (has4500 && posting4500) {
    // The net amount should be 21500 or close to it
    // If booked without VAT, amountGross would be 21500
    // If booked with VAT (as gross), amountGross would be 21500 and there'd be a 2710
    const gross = posting4500.amountGross;
    // Check if this voucher relates to the 21500 amount
    if (gross === 21500 || posting4500.amount === 21500 || Math.abs(gross) === 21500) {
      vatVoucher = v;
      vatPosting = posting4500;
      existing2710 = posting2710;
      break;
    }
  }
}

if (!vatPosting) { console.error("Missing VAT posting not found!"); process.exit(1); }

// Find counterpart for missing VAT (not 4500, not 2710)
for (const p of vatVoucher.postings) {
  if (p.account?.number !== 4500 && p.account?.number !== 2710) {
    vatCounterpart = p;
  }
}

console.log(`Missing VAT: voucher ${vatVoucher.id}, posting 4500 gross=${vatPosting.amountGross} net=${vatPosting.amount}, 2710 exists=${!!existing2710} (amount=${existing2710?.amountGross}), counterpart acct=${vatCounterpart?.account?.number} supplier=${vatCounterpart?.supplier?.id}`);

// ── Error 4: Incorrect amount — account 6860, 17250 recorded instead of 6000 ──
let wrongAmtVoucher: any = null;
let wrongAmtPosting: any = null;
let wrongAmtCounterpart: any = null;

for (const v of vouchers) {
  for (const p of v.postings) {
    if (p.account?.number === 6860 && Math.abs(p.amountGross) === 17250) {
      wrongAmtVoucher = v;
      wrongAmtPosting = p;
      break;
    }
  }
  if (wrongAmtPosting) break;
}

if (!wrongAmtPosting) { console.error("Incorrect amount posting not found!"); process.exit(1); }

for (const p of wrongAmtVoucher.postings) {
  if (p.account?.number !== 6860 && p.account?.number !== 2710) {
    wrongAmtCounterpart = p;
  }
}
console.log(`Wrong amount: voucher ${wrongAmtVoucher.id}, posting ${wrongAmtPosting.id}, gross=${wrongAmtPosting.amountGross}, vatType=${wrongAmtPosting.vatType?.id}, counterpart acct=${wrongAmtCounterpart?.account?.number}`);

// ── Call 3: Build and post combined corrective voucher ──
const postings: any[] = [];
let row = 1;

// --- Error 1: Wrong account reclassification (7140 → 7100) ---
const wrongVatType = wrongAcctPosting.vatType?.id ?? 0;
postings.push({
  row: row++,
  account: { id: acctMap[7140] },
  amountGross: -Math.abs(wrongAcctPosting.amountGross),
  amountGrossCurrency: -Math.abs(wrongAcctPosting.amountGross),
  vatType: { id: wrongVatType },
  description: "Korreksjon: ompostering fra 7140"
});
postings.push({
  row: row++,
  account: { id: acctMap[7100] },
  amountGross: Math.abs(wrongAcctPosting.amountGross),
  amountGrossCurrency: Math.abs(wrongAcctPosting.amountGross),
  vatType: { id: wrongVatType },
  description: "Korreksjon: ompostering til 7100"
});

// --- Error 2: Duplicate reversal (6540) ---
const dupVatType = dupPosting.vatType?.id ?? 0;
const dupGross = dupPosting.amountGross;
postings.push({
  row: row++,
  account: { id: acctMap[6540] },
  amountGross: -dupGross,
  amountGrossCurrency: -dupGross,
  vatType: { id: dupVatType },
  description: "Korreksjon: reversering duplikat"
});
const dupCounterLine: any = {
  row: row++,
  account: { id: dupCounterpart.account.id },
  amountGross: dupGross,
  amountGrossCurrency: dupGross,
  description: "Korreksjon: reversering duplikat"
};
if (dupCounterpart.supplier?.id) {
  dupCounterLine.supplier = { id: dupCounterpart.supplier.id };
}
postings.push(dupCounterLine);

// --- Error 3: Missing VAT (4500, 21500 excl. VAT) ---
const netAmount = 21500;
const correctVat = netAmount * 0.25; // 5375

if (!existing2710) {
  // Case A: No 2710 exists — full VAT missing
  console.log(`Missing VAT Case A: no 2710 exists. Adding 2710 +${correctVat}`);
  postings.push({
    row: row++,
    account: { id: acctMap[2710] },
    amountGross: correctVat,
    amountGrossCurrency: correctVat,
    description: "Korreksjon: manglende MVA"
  });
  const vatCounterLine: any = {
    row: row++,
    account: { id: vatCounterpart.account.id },
    amountGross: -correctVat,
    amountGrossCurrency: -correctVat,
    description: "Korreksjon: manglende MVA"
  };
  if (vatCounterpart.supplier?.id) {
    vatCounterLine.supplier = { id: vatCounterpart.supplier.id };
  }
  postings.push(vatCounterLine);
} else {
  // Case B: 2710 exists but VAT too low
  const existingVat = existing2710.amountGross;
  const existingExpenseNet = vatPosting.amount;
  const vatShortfall = correctVat - existingVat;
  const expenseNetShortfall = netAmount - existingExpenseNet;
  const totalShortfall = vatShortfall + expenseNetShortfall;

  console.log(`Missing VAT Case B: existing 2710=${existingVat}, correctVat=${correctVat}, vatShortfall=${vatShortfall}, expenseNetShortfall=${expenseNetShortfall}, totalShortfall=${totalShortfall}`);

  postings.push({
    row: row++,
    account: { id: acctMap[2710] },
    amountGross: vatShortfall,
    amountGrossCurrency: vatShortfall,
    description: "Korreksjon: manglende MVA"
  });
  postings.push({
    row: row++,
    account: { id: acctMap[4500] },
    amountGross: expenseNetShortfall,
    amountGrossCurrency: expenseNetShortfall,
    vatType: { id: 0 },
    description: "Korreksjon: manglende MVA"
  });
  const vatCounterLine: any = {
    row: row++,
    account: { id: vatCounterpart.account.id },
    amountGross: -totalShortfall,
    amountGrossCurrency: -totalShortfall,
    description: "Korreksjon: manglende MVA"
  };
  if (vatCounterpart.supplier?.id) {
    vatCounterLine.supplier = { id: vatCounterpart.supplier.id };
  }
  postings.push(vatCounterLine);
}

// --- Error 4: Incorrect amount (6860, 17250 → 6000) ---
const wrongAmtVatType = wrongAmtPosting.vatType?.id ?? 0;
const difference = wrongAmtPosting.amountGross - 6000; // 17250 - 6000 = 11250
console.log(`Wrong amount: difference=${difference}, vatType=${wrongAmtVatType}`);

postings.push({
  row: row++,
  account: { id: acctMap[6860] },
  amountGross: -difference,
  amountGrossCurrency: -difference,
  vatType: { id: wrongAmtVatType },
  description: "Korreksjon: feil beløp"
});
const wrongAmtCounterLine: any = {
  row: row++,
  account: { id: wrongAmtCounterpart.account.id },
  amountGross: difference,
  amountGrossCurrency: difference,
  description: "Korreksjon: feil beløp"
};
if (wrongAmtCounterpart.supplier?.id) {
  wrongAmtCounterLine.supplier = { id: wrongAmtCounterpart.supplier.id };
}
postings.push(wrongAmtCounterLine);

// POST combined corrective voucher
const correctionBody = {
  date: "2026-02-28",
  description: "Korreksjonsbilag januar-februar 2026",
  postings
};

console.log("Posting corrective voucher with", postings.length, "lines...");
console.log(JSON.stringify(correctionBody, null, 2));

const result = await api("POST", "/ledger/voucher?sendToLedger=true", correctionBody);
console.log("SUCCESS! Voucher created:");
console.log(JSON.stringify(result, null, 2));
