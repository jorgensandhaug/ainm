const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "K7DLZHVIDnKRYYo84GepS-LioF4yebfkAETI6Q2onT4";
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
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) {
    console.error(`${res.status} ${res.statusText}`, JSON.stringify(data, null, 2));
    throw new Error(`API ${res.status}`);
  }
  return data;
}

// Step 1: Get account IDs for all needed accounts
const acctRes = await api("GET", "/ledger/account?number=6500,6540,7100,6300,2710&fields=id,number");
const acctMap: Record<number, number> = {};
for (const a of acctRes.values) {
  acctMap[a.number] = a.id;
}
console.log("Account map:", acctMap);

// Verify all accounts found
for (const num of [6500, 6540, 7100, 6300, 2710]) {
  if (!acctMap[num]) throw new Error(`Account ${num} not found`);
}

// Step 2: Get all vouchers for Jan-Feb 2026 with nested expansion
const voucherRes = await api("GET",
  "/ledger/voucher?dateFrom=2026-01-01&dateTo=2026-03-01&fields=id,date,description,postings(id,account(id,number),amount,amountGross,amountGrossCurrency,vatType(id),supplier(id),description)&count=1000"
);
const vouchers = voucherRes.values;
console.log(`Found ${vouchers.length} vouchers`);

// ---- Error 1: Wrong account (6500 used instead of 6540, amount 7350) ----
let wrongAcctPosting: any = null;
let wrongAcctVoucher: any = null;
let wrongAcctCounterpart: any = null;

for (const v of vouchers) {
  for (const p of v.postings || []) {
    if (p.account?.number === 6500 && (Math.abs(p.amountGross) === 7350 || Math.abs(p.amount) === 7350)) {
      wrongAcctPosting = p;
      wrongAcctVoucher = v;
      // Find counterpart (opposite sign, not 6500, not 2710)
      for (const cp of v.postings || []) {
        if (cp.account?.number !== 6500 && cp.account?.number !== 2710) {
          wrongAcctCounterpart = cp;
        }
      }
      break;
    }
  }
  if (wrongAcctPosting) break;
}
console.log("Wrong account posting:", wrongAcctPosting?.amountGross, "vatType:", wrongAcctPosting?.vatType?.id);

// ---- Error 2: Duplicate voucher (7100, amount 3200) ----
let dupPosting: any = null;
let dupVoucher: any = null;
let dupCounterpart: any = null;

// PRIMARY: description keyword
for (const v of vouchers) {
  const desc = (v.description || "").toLowerCase();
  if (desc.includes("duplikat") || desc.includes("duplicate")) {
    for (const p of v.postings || []) {
      if (p.account?.number === 7100 && (Math.abs(p.amountGross) === 3200 || Math.abs(p.amount) === 3200)) {
        dupPosting = p;
        dupVoucher = v;
        for (const cp of v.postings || []) {
          if (cp.account?.number !== 7100 && cp.account?.number !== 2710) {
            dupCounterpart = cp;
          }
        }
        break;
      }
    }
  }
  if (dupPosting) break;
}

// SECONDARY: signature grouping
if (!dupPosting) {
  const sigGroups: Record<string, any[]> = {};
  for (const v of vouchers) {
    for (const p of v.postings || []) {
      if (p.account?.number === 7100 && (Math.abs(p.amountGross) === 3200 || Math.abs(p.amount) === 3200)) {
        const sig = (v.postings || []).map((pp: any) => `${pp.account?.number}:${pp.amountGross}`).sort().join("|");
        if (!sigGroups[sig]) sigGroups[sig] = [];
        sigGroups[sig].push({ voucher: v, posting: p });
      }
    }
  }
  for (const [sig, entries] of Object.entries(sigGroups)) {
    if (entries.length >= 2) {
      // Pick the later one as the duplicate
      const dup = entries[entries.length - 1];
      dupPosting = dup.posting;
      dupVoucher = dup.voucher;
      for (const cp of dupVoucher.postings || []) {
        if (cp.account?.number !== 7100 && cp.account?.number !== 2710) {
          dupCounterpart = cp;
        }
      }
      break;
    }
  }
}

// TERTIARY: single-entry fallback
if (!dupPosting) {
  for (const v of vouchers) {
    for (const p of v.postings || []) {
      if (p.account?.number === 7100 && (Math.abs(p.amountGross) === 3200 || Math.abs(p.amount) === 3200)) {
        dupPosting = p;
        dupVoucher = v;
        for (const cp of v.postings || []) {
          if (cp.account?.number !== 7100 && cp.account?.number !== 2710) {
            dupCounterpart = cp;
          }
        }
        break;
      }
    }
    if (dupPosting) break;
  }
}

if (!dupPosting) throw new Error("Duplicate voucher not found");
console.log("Duplicate posting:", dupPosting?.amountGross, "vatType:", dupPosting?.vatType?.id, "counterpart:", dupCounterpart?.account?.number);

// ---- Error 3: Missing VAT (6540, 11450 excl. VAT, missing 2710) ----
let missingVatPosting: any = null;
let missingVatVoucher: any = null;
let missingVatCounterpart: any = null;
let existing2710Amount = 0;
let hasExisting2710 = false;

for (const v of vouchers) {
  for (const p of v.postings || []) {
    if (p.account?.number === 6540) {
      // Check if this voucher is related to the 11450 amount
      // 11450 is excl. VAT. If booked without VAT, amountGross could be 11450.
      // If booked with partial VAT, different amounts possible.
      // The net amount should be 11450 or gross could be 11450 (if no VAT was applied)
      const gross = Math.abs(p.amountGross);
      const net = Math.abs(p.amount);

      // Check: amountGross could be 11450 (booked as gross without VAT) or 14312.50 (with VAT)
      if (gross === 11450 || net === 11450 || gross === 14312.5 || net === 14312.5) {
        missingVatPosting = p;
        missingVatVoucher = v;
        // Check for existing 2710 posting
        for (const cp of v.postings || []) {
          if (cp.account?.number === 2710) {
            hasExisting2710 = true;
            existing2710Amount = cp.amountGross;
          } else if (cp.account?.number !== 6540) {
            missingVatCounterpart = cp;
          }
        }
        break;
      }
    }
  }
  if (missingVatPosting) break;
}

// If not found with exact match, try description keywords
if (!missingVatPosting) {
  for (const v of vouchers) {
    const desc = (v.description || "").toLowerCase();
    if (desc.includes("uten mva") || desc.includes("without vat") || desc.includes("mangler mva")) {
      for (const p of v.postings || []) {
        if (p.account?.number === 6540) {
          missingVatPosting = p;
          missingVatVoucher = v;
          for (const cp of v.postings || []) {
            if (cp.account?.number === 2710) {
              hasExisting2710 = true;
              existing2710Amount = cp.amountGross;
            } else if (cp.account?.number !== 6540) {
              missingVatCounterpart = cp;
            }
          }
          break;
        }
      }
    }
    if (missingVatPosting) break;
  }
}

// Broader search: any 6540 posting where the voucher has no 2710 line
if (!missingVatPosting) {
  for (const v of vouchers) {
    const has6540 = (v.postings || []).some((p: any) => p.account?.number === 6540);
    const has2710 = (v.postings || []).some((p: any) => p.account?.number === 2710);
    if (has6540 && !has2710) {
      for (const p of v.postings || []) {
        if (p.account?.number === 6540) {
          missingVatPosting = p;
          missingVatVoucher = v;
          hasExisting2710 = false;
          for (const cp of v.postings || []) {
            if (cp.account?.number !== 6540) {
              missingVatCounterpart = cp;
            }
          }
          break;
        }
      }
    }
    if (missingVatPosting) break;
  }
}

if (!missingVatPosting) throw new Error("Missing VAT voucher not found");
console.log("Missing VAT posting:", missingVatPosting?.amountGross, "net:", missingVatPosting?.amount, "has2710:", hasExisting2710, "existing2710:", existing2710Amount);
console.log("Missing VAT counterpart:", missingVatCounterpart?.account?.number, missingVatCounterpart?.account?.id, "supplier:", missingVatCounterpart?.supplier?.id);

// ---- Error 4: Incorrect amount (6300, 8200 posted instead of 5800) ----
let wrongAmtPosting: any = null;
let wrongAmtVoucher: any = null;
let wrongAmtCounterpart: any = null;

for (const v of vouchers) {
  for (const p of v.postings || []) {
    if (p.account?.number === 6300 && (Math.abs(p.amountGross) === 8200 || Math.abs(p.amount) === 8200)) {
      wrongAmtPosting = p;
      wrongAmtVoucher = v;
      for (const cp of v.postings || []) {
        if (cp.account?.number !== 6300 && cp.account?.number !== 2710) {
          wrongAmtCounterpart = cp;
        }
      }
      break;
    }
  }
  if (wrongAmtPosting) break;
}

// Try matching on amount field too
if (!wrongAmtPosting) {
  for (const v of vouchers) {
    for (const p of v.postings || []) {
      if (p.account?.number === 6300) {
        const gross = Math.abs(p.amountGross);
        // If vatType=1, gross=8200 means net=6560. Or if vatType=0, gross=net=8200
        // Also check if gross is 10250 (8200*1.25)
        if (gross === 8200 || gross === 10250) {
          wrongAmtPosting = p;
          wrongAmtVoucher = v;
          for (const cp of v.postings || []) {
            if (cp.account?.number !== 6300 && cp.account?.number !== 2710) {
              wrongAmtCounterpart = cp;
            }
          }
          break;
        }
      }
    }
    if (wrongAmtPosting) break;
  }
}

if (!wrongAmtPosting) throw new Error("Incorrect amount voucher not found");
console.log("Wrong amount posting:", wrongAmtPosting?.amountGross, "vatType:", wrongAmtPosting?.vatType?.id);

// ---- Build correction voucher ----
const postings: any[] = [];
let row = 1;

// --- Correction 1: Wrong account 6500→6540 ---
const wrongAcctVatType = wrongAcctPosting.vatType?.id ?? 0;
const wrongAcctGross = Math.abs(wrongAcctPosting.amountGross);
postings.push({
  row: row++,
  account: { id: acctMap[6500] },
  amountGross: -wrongAcctGross,
  amountGrossCurrency: -wrongAcctGross,
  vatType: { id: wrongAcctVatType },
  description: "Korreksjon: ompostering fra 6500",
});
postings.push({
  row: row++,
  account: { id: acctMap[6540] },
  amountGross: wrongAcctGross,
  amountGrossCurrency: wrongAcctGross,
  vatType: { id: wrongAcctVatType },
  description: "Korreksjon: ompostering til 6540",
});

// --- Correction 2: Duplicate reversal (7100, 3200) ---
const dupVatType = dupPosting.vatType?.id ?? 0;
const dupGross = Math.abs(dupPosting.amountGross);
const dupCounterpartAcctId = dupCounterpart.account.id;
const dupCounterpartAcctNum = dupCounterpart.account.number;
// Expense side: reverse
postings.push({
  row: row++,
  account: { id: acctMap[7100] },
  amountGross: -dupGross,
  amountGrossCurrency: -dupGross,
  vatType: { id: dupVatType },
  description: "Korreksjon: reversering duplikat",
});
// Counterpart side: reverse (opposite sign of original counterpart, which was negative)
const dupCounterpartLine: any = {
  row: row++,
  account: { id: dupCounterpartAcctId },
  amountGross: dupGross,
  amountGrossCurrency: dupGross,
  description: "Korreksjon: reversering duplikat",
};
if (dupCounterpart.supplier?.id) {
  dupCounterpartLine.supplier = { id: dupCounterpart.supplier.id };
}
if (dupCounterpartAcctNum === 2400) {
  // Need supplier
  if (dupCounterpart.supplier?.id) {
    dupCounterpartLine.supplier = { id: dupCounterpart.supplier.id };
  }
}
postings.push(dupCounterpartLine);

// --- Correction 3: Missing VAT (6540, 11450 excl, missing 2710) ---
const netAmount = 11450;
const correctVat = netAmount * 0.25; // 2862.50
const supplierId = missingVatCounterpart?.supplier?.id;
const counterpartAcctId3 = missingVatCounterpart?.account?.id;
const counterpartAcctNum3 = missingVatCounterpart?.account?.number;

if (!hasExisting2710) {
  // Case A: No 2710 posting exists — full VAT is missing
  postings.push({
    row: row++,
    account: { id: acctMap[2710] },
    amountGross: correctVat,
    amountGrossCurrency: correctVat,
    description: "Korreksjon: manglende MVA",
  });
  const counterLine3: any = {
    row: row++,
    account: { id: counterpartAcctId3 },
    amountGross: -correctVat,
    amountGrossCurrency: -correctVat,
    description: "Korreksjon: manglende MVA",
  };
  if (supplierId) counterLine3.supplier = { id: supplierId };
  postings.push(counterLine3);
} else {
  // Case B: 2710 exists but VAT is too low
  const existingExpenseNet = Math.abs(missingVatPosting.amount);
  const vatShortfall = correctVat - Math.abs(existing2710Amount);
  const expenseNetShortfall = netAmount - existingExpenseNet;
  const totalShortfall = vatShortfall + expenseNetShortfall;

  console.log("Case B: vatShortfall:", vatShortfall, "expenseNetShortfall:", expenseNetShortfall, "totalShortfall:", totalShortfall);

  postings.push({
    row: row++,
    account: { id: acctMap[2710] },
    amountGross: vatShortfall,
    amountGrossCurrency: vatShortfall,
    description: "Korreksjon: manglende MVA",
  });
  if (expenseNetShortfall !== 0) {
    postings.push({
      row: row++,
      account: { id: acctMap[6540] },
      amountGross: expenseNetShortfall,
      amountGrossCurrency: expenseNetShortfall,
      vatType: { id: 0 },
      description: "Korreksjon: manglende MVA",
    });
  }
  const counterLine3b: any = {
    row: row++,
    account: { id: counterpartAcctId3 },
    amountGross: -totalShortfall,
    amountGrossCurrency: -totalShortfall,
    description: "Korreksjon: manglende MVA",
  };
  if (supplierId) counterLine3b.supplier = { id: supplierId };
  postings.push(counterLine3b);
}

// --- Correction 4: Incorrect amount (6300, 8200→5800, diff=2400) ---
const wrongAmtVatType = wrongAmtPosting.vatType?.id ?? 0;
const postedGross = Math.abs(wrongAmtPosting.amountGross);
// The prompt says 8200 posted instead of 5800. Need to figure out if these are gross or net.
// If vatType=0: gross=net, so difference = 8200-5800 = 2400
// If vatType=1: the stated amounts are the amounts on the posting. The prompt amount matches the gross.
// The difference in gross terms:
// We need to reduce by the difference. Posted gross = 8200 (or 10250 if VAT-inclusive gross)
// Actually, let's use the actual gross from the posting for calculation
// The prompt says "8200 NOK posted instead of 5800 NOK" - these match the amountGross values
let diffGross: number;
if (wrongAmtVatType === 0) {
  diffGross = 8200 - 5800; // 2400
} else {
  // vatType=1: the prompt amounts are the net amounts, gross = net * 1.25
  // Actually the prompt says "8200 NOK posted" which should match what we found
  // If the posting's amountGross is 8200, then difference gross = 8200 - 5800 = 2400 (if these are gross)
  // If the posting's amountGross is 10250 (=8200*1.25), then prompt amounts are net
  if (postedGross === 8200) {
    diffGross = 8200 - 5800; // 2400, these are gross amounts
  } else {
    // Prompt amounts are net, need gross difference
    diffGross = postedGross - (5800 * 1.25);
  }
}

const wrongAmtCounterpartAcctId = wrongAmtCounterpart.account.id;
postings.push({
  row: row++,
  account: { id: acctMap[6300] },
  amountGross: -diffGross,
  amountGrossCurrency: -diffGross,
  vatType: { id: wrongAmtVatType },
  description: "Korreksjon: feil beløp",
});
const counterLine4: any = {
  row: row++,
  account: { id: wrongAmtCounterpartAcctId },
  amountGross: diffGross,
  amountGrossCurrency: diffGross,
  description: "Korreksjon: feil beløp",
};
if (wrongAmtCounterpart.supplier?.id) {
  counterLine4.supplier = { id: wrongAmtCounterpart.supplier.id };
}
postings.push(counterLine4);

// Step 3: Post combined corrective voucher
console.log("\n=== Posting corrective voucher ===");
console.log("Postings:", JSON.stringify(postings, null, 2));

const correctionVoucher = await api("POST", "/ledger/voucher?sendToLedger=true", {
  date: "2026-02-28",
  description: "Samlet korreksjonsbilag – jan/feb 2026",
  postings,
});

console.log("\n=== Correction voucher created ===");
console.log("Voucher ID:", correctionVoucher.value?.id);
console.log("Voucher number:", correctionVoucher.value?.number);
console.log("Postings:", JSON.stringify(correctionVoucher.value?.postings, null, 2));
