const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "jpQlfuNp9eIujJQWjGsjT24rPLw5bcAjnddfbSBBFa4";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const headers = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  console.log(`${method} ${url}`);
  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  console.log(`Status: ${res.status}`);
  if (!res.ok) {
    console.error("ERROR:", JSON.stringify(data, null, 2));
    throw new Error(`${method} ${path} failed: ${res.status}`);
  }
  return data;
}

// ── STEP 1: Account lookup ──
// Accounts needed: 6340 (wrong), 6390 (correct), 6300 (dup), 7300 (missing VAT), 2710 (VAT), 7100 (wrong amount)
const acctRes = await api("GET", "/ledger/account?number=6340,6390,6300,7300,2710,7100&fields=id,number");
const acctMap: Record<number, number> = {};
for (const a of acctRes.values) {
  acctMap[a.number] = a.id;
  console.log(`Account ${a.number} → ID ${a.id}`);
}

// Verify all accounts found
for (const num of [6340, 6390, 6300, 7300, 2710, 7100]) {
  if (!acctMap[num]) throw new Error(`Account ${num} not found!`);
}

// ── STEP 2: Voucher discovery with nested expansion ──
const vRes = await api("GET", "/ledger/voucher?dateFrom=2026-01-01&dateTo=2026-03-01&fields=id,date,description,postings(id,account(id,number),amount,amountGross,amountGrossCurrency,vatType(id),supplier(id),description)&count=1000");
const vouchers = vRes.values;
console.log(`Found ${vouchers.length} vouchers`);

// ── Error 1: Wrong account — 6340 used instead of 6390, amount 2450 ──
let wrongAcctPosting: any = null;
let wrongAcctCounterpart: any = null;
let wrongAcctVoucherDate: string = "";
for (const v of vouchers) {
  for (const p of v.postings || []) {
    if (p.account?.number === 6340 && (Math.abs(p.amountGross) === 2450 || Math.abs(p.amount) === 2450)) {
      wrongAcctPosting = p;
      wrongAcctVoucherDate = v.date;
      // Find counterpart
      for (const cp of v.postings) {
        if (cp.id !== p.id && cp.account?.number !== 2710) {
          wrongAcctCounterpart = cp;
        }
      }
      break;
    }
  }
  if (wrongAcctPosting) break;
}
console.log("Wrong account posting:", wrongAcctPosting ? `found, gross=${wrongAcctPosting.amountGross}, vatType=${wrongAcctPosting.vatType?.id}` : "NOT FOUND");

// ── Error 2: Duplicate — account 6300, amount 2900 ──
// Priority: description keyword → signature grouping → single-entry fallback
let dupPosting: any = null;
let dupCounterpart: any = null;
let dupVoucherId: number | null = null;

// Collect all vouchers with a 6300 posting matching amount 2900
const dupCandidates: { voucher: any; posting: any; counterpart: any }[] = [];
for (const v of vouchers) {
  for (const p of v.postings || []) {
    if (p.account?.number === 6300 && (Math.abs(p.amountGross) === 2900 || Math.abs(p.amount) === 2900)) {
      const cp = (v.postings || []).find((x: any) => x.id !== p.id && x.account?.number !== 2710);
      dupCandidates.push({ voucher: v, posting: p, counterpart: cp });
    }
  }
}
console.log(`Duplicate candidates on 6300/2900: ${dupCandidates.length}`);

// PRIMARY: description keyword
for (const c of dupCandidates) {
  const desc = (c.voucher.description || "").toLowerCase();
  if (desc.includes("duplikat") || desc.includes("duplicate") || desc.includes("duplic")) {
    dupPosting = c.posting;
    dupCounterpart = c.counterpart;
    dupVoucherId = c.voucher.id;
    console.log("Duplicate found via description keyword:", desc);
    break;
  }
}

// SECONDARY: signature grouping
if (!dupPosting && dupCandidates.length >= 2) {
  // Group by posting signature
  const sigs = dupCandidates.map(c => {
    const sorted = (c.voucher.postings || []).map((p: any) => `${p.account?.number}:${p.amountGross}`).sort().join("|");
    return { ...c, sig: sorted };
  });
  const sigCounts: Record<string, typeof sigs> = {};
  for (const s of sigs) {
    (sigCounts[s.sig] ||= []).push(s);
  }
  for (const [sig, entries] of Object.entries(sigCounts)) {
    if (entries.length >= 2) {
      // Take the last one as the duplicate
      const dup = entries[entries.length - 1];
      dupPosting = dup.posting;
      dupCounterpart = dup.counterpart;
      dupVoucherId = dup.voucher.id;
      console.log("Duplicate found via signature grouping");
      break;
    }
  }
}

// TERTIARY: single-entry fallback
if (!dupPosting && dupCandidates.length >= 1) {
  const c = dupCandidates[dupCandidates.length - 1];
  dupPosting = c.posting;
  dupCounterpart = c.counterpart;
  dupVoucherId = c.voucher.id;
  console.log("Duplicate found via single-entry fallback");
}

if (!dupPosting) throw new Error("Duplicate voucher not found!");
console.log(`Duplicate posting: gross=${dupPosting.amountGross}, vatType=${dupPosting.vatType?.id}, counterpart acct=${dupCounterpart?.account?.number}`);

// ── Error 3: Missing VAT — account 7300, amount excl. VAT 5350, missing VAT on 2710 ──
let missingVatPosting: any = null;
let missingVatCounterpart: any = null;
let missingVat2710: any = null;
let missingVatSupplierId: number | null = null;

for (const v of vouchers) {
  for (const p of v.postings || []) {
    if (p.account?.number === 7300 && (Math.abs(p.amountGross) === 5350 || Math.abs(p.amount) === 5350 || Math.abs(p.amountGross) === 6687.5)) {
      missingVatPosting = p;
      // Check for existing 2710 posting
      for (const cp of v.postings) {
        if (cp.account?.number === 2710) {
          missingVat2710 = cp;
        } else if (cp.id !== p.id && cp.account?.number !== 2710) {
          missingVatCounterpart = cp;
          if (cp.supplier?.id) missingVatSupplierId = cp.supplier.id;
        }
      }
      break;
    }
  }
  if (missingVatPosting) break;
}

console.log("Missing VAT posting:", missingVatPosting ? `found, gross=${missingVatPosting.amountGross}, amount=${missingVatPosting.amount}, vatType=${missingVatPosting.vatType?.id}` : "NOT FOUND");
console.log("Existing 2710 posting:", missingVat2710 ? `found, amount=${missingVat2710.amountGross}` : "none (Case A)");
console.log("Counterpart:", missingVatCounterpart ? `acct=${missingVatCounterpart.account?.number}, id=${missingVatCounterpart.account?.id}` : "NOT FOUND");
console.log("Supplier ID:", missingVatSupplierId);

if (!missingVatPosting) throw new Error("Missing VAT voucher not found!");

// ── Error 4: Incorrect amount — account 7100, 8550 recorded instead of 6750 ──
let wrongAmtPosting: any = null;
let wrongAmtCounterpart: any = null;

for (const v of vouchers) {
  for (const p of v.postings || []) {
    if (p.account?.number === 7100 && (Math.abs(p.amountGross) === 8550 || Math.abs(p.amount) === 8550)) {
      wrongAmtPosting = p;
      for (const cp of v.postings) {
        if (cp.id !== p.id && cp.account?.number !== 2710) {
          wrongAmtCounterpart = cp;
        }
      }
      break;
    }
  }
  if (wrongAmtPosting) break;
}

console.log("Wrong amount posting:", wrongAmtPosting ? `found, gross=${wrongAmtPosting.amountGross}, vatType=${wrongAmtPosting.vatType?.id}` : "NOT FOUND");
if (!wrongAmtPosting) throw new Error("Wrong amount voucher not found!");

// ── STEP 3: Build combined corrective voucher ──
const postings: any[] = [];
let row = 1;

// === Correction 1: Wrong account 6340 → 6390 ===
const wrongAcctVatType = wrongAcctPosting.vatType?.id ?? 0;
const wrongAcctGross = Math.abs(wrongAcctPosting.amountGross);
postings.push({
  row: row++,
  account: { id: acctMap[6340] },
  amountGross: -wrongAcctGross,
  amountGrossCurrency: -wrongAcctGross,
  vatType: { id: wrongAcctVatType },
  description: "Korreksjon: ompostering fra 6340",
});
postings.push({
  row: row++,
  account: { id: acctMap[6390] },
  amountGross: wrongAcctGross,
  amountGrossCurrency: wrongAcctGross,
  vatType: { id: wrongAcctVatType },
  description: "Korreksjon: ompostering til 6390",
});

// === Correction 2: Duplicate reversal on 6300 ===
const dupVatType = dupPosting.vatType?.id ?? 0;
const dupGross = Math.abs(dupPosting.amountGross);
const dupCounterpartAcctId = dupCounterpart.account.id;
postings.push({
  row: row++,
  account: { id: acctMap[6300] },
  amountGross: -dupGross,
  amountGrossCurrency: -dupGross,
  vatType: { id: dupVatType },
  description: "Korreksjon: reversering duplikat",
});
// Counterpart reversal — positive to balance
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
postings.push(dupCounterpartLine);

// === Correction 3: Missing VAT on 7300, net 5350, VAT on 2710 ===
const netAmount = 5350; // excl. VAT amount stated in prompt
const correctVat = netAmount * 0.25; // 1337.5

if (!missingVat2710) {
  // Case A: no 2710 posting at all — full VAT missing
  console.log(`Missing VAT Case A: adding full VAT ${correctVat} to 2710`);
  postings.push({
    row: row++,
    account: { id: acctMap[2710] },
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
  if (missingVatSupplierId) vatCounterpartLine.supplier = { id: missingVatSupplierId };
  postings.push(vatCounterpartLine);
} else {
  // Case B: 2710 posting exists but VAT is too low
  const existing2710 = Math.abs(missingVat2710.amountGross);
  const vatShortfall = correctVat - existing2710;
  const existingExpenseNet = Math.abs(missingVatPosting.amount);
  const expenseNetShortfall = netAmount - existingExpenseNet;
  const totalShortfall = vatShortfall + expenseNetShortfall;
  console.log(`Missing VAT Case B: existing 2710=${existing2710}, vatShortfall=${vatShortfall}, expenseNetShortfall=${expenseNetShortfall}, totalShortfall=${totalShortfall}`);

  postings.push({
    row: row++,
    account: { id: acctMap[2710] },
    amountGross: vatShortfall,
    amountGrossCurrency: vatShortfall,
    description: "Korreksjon: manglende MVA",
  });
  postings.push({
    row: row++,
    account: { id: acctMap[7300] },
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
  if (missingVatSupplierId) vatCounterpartLine.supplier = { id: missingVatSupplierId };
  postings.push(vatCounterpartLine);
}

// === Correction 4: Incorrect amount — 7100, 8550 → 6750, difference = 8550 - 6750 = 1800 ===
const wrongAmtVatType = wrongAmtPosting.vatType?.id ?? 0;
const postedGross = 8550;
const correctGross = 6750;
const difference = postedGross - correctGross; // 1800
const counterpartAcctId = wrongAmtCounterpart.account.id;

postings.push({
  row: row++,
  account: { id: acctMap[7100] },
  amountGross: -difference,
  amountGrossCurrency: -difference,
  vatType: { id: wrongAmtVatType },
  description: "Korreksjon: feil beløp",
});
const amtCounterpartLine: any = {
  row: row++,
  account: { id: counterpartAcctId },
  amountGross: difference,
  amountGrossCurrency: difference,
  description: "Korreksjon: feil beløp",
};
if (wrongAmtCounterpart.supplier?.id) {
  amtCounterpartLine.supplier = { id: wrongAmtCounterpart.supplier.id };
}
postings.push(amtCounterpartLine);

// POST the combined corrective voucher
const voucherBody = {
  date: "2026-02-28",
  description: "Korreksjonsbilag – retting av feil i hovedbok jan/feb 2026",
  postings,
};

console.log("\n=== Posting corrective voucher ===");
console.log(JSON.stringify(voucherBody, null, 2));

const result = await api("POST", "/ledger/voucher?sendToLedger=true", voucherBody);
console.log("\n=== Result ===");
console.log(JSON.stringify(result, null, 2));
console.log("\nDone. Voucher ID:", result.value?.id, "Number:", result.value?.number);
