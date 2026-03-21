const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "bInSbC11J-BcK8DCNmvoVsHVvnquHYytBcic-uvR-bM";
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
  console.log(`  Status: ${res.status}`);
  if (!res.ok) {
    console.log(`  Error: ${text}`);
    throw new Error(`${res.status}: ${text}`);
  }
  if (!text) return null;
  const json = JSON.parse(text);
  if (json.values !== undefined) return json.values;
  if (json.value !== undefined) return json.value;
  return json;
}

// Step 1: Get account IDs for all relevant accounts
const acctNumbers = [6340, 6390, 6860, 4300, 2710, 6300];
const accounts = await api("GET", `/ledger/account?number=${acctNumbers.join(",")}&fields=id,number`) as any[];
const acctMap: Record<number, number> = {};
for (const a of accounts) acctMap[a.number] = a.id;
console.log("Account map:", acctMap);

// Verify all accounts exist
for (const n of acctNumbers) {
  if (!acctMap[n]) throw new Error(`Account ${n} not found`);
}

// Step 2: Get all vouchers for Jan-Feb 2026 with nested expansion
const vouchers = await api("GET",
  `/ledger/voucher?dateFrom=2026-01-01&dateTo=2026-02-28&fields=id,date,description,postings(id,account(id,number),amount,amountGross,amountGrossCurrency,vatType(id),supplier(id),description)&count=1000`
) as any[];

console.log(`Found ${vouchers.length} vouchers`);

// Find wrong account: 6340 with amountGross 2300
let wrongAcctVoucher: any = null;
let wrongAcctPosting: any = null;
let wrongAcctCounterpart: any = null;

// Find duplicate: 6860 with amountGross 3150
let dupVouchers: any[] = [];

// Find missing VAT: 4300 with amount excl 16550
let missingVatVoucher: any = null;
let missingVatPosting: any = null;
let missingVatCounterpart: any = null;
let missingVatHas2710 = false;

// Find wrong amount: 6300 with amountGross 17800
let wrongAmtVoucher: any = null;
let wrongAmtPosting: any = null;
let wrongAmtCounterpart: any = null;

for (const v of vouchers) {
  if (!v.postings) continue;
  for (const p of v.postings) {
    const acctNum = p.account?.number;
    const gross = p.amountGross;

    // Wrong account: 6340, 2300
    if (acctNum === 6340 && Math.abs(gross) === 2300) {
      wrongAcctVoucher = v;
      wrongAcctPosting = p;
    }

    // Duplicate: 6860, 3150
    if (acctNum === 6860 && Math.abs(gross) === 3150) {
      dupVouchers.push({ voucher: v, posting: p });
    }

    // Missing VAT: 4300, check for 16550
    if (acctNum === 4300) {
      // The prompt says "beløp ekskl. 16550" - amount excluding VAT is 16550
      // Check if amountGross matches 16550 (booked without VAT) or amount (net) matches
      if (Math.abs(gross) === 16550 || Math.abs(p.amount) === 16550) {
        missingVatVoucher = v;
        missingVatPosting = p;
      }
    }

    // Wrong amount: 6300, 17800
    if (acctNum === 6300 && Math.abs(gross) === 17800) {
      wrongAmtVoucher = v;
      wrongAmtPosting = p;
    }
  }
}

// Extract counterparts
function findCounterpart(voucher: any, excludeAcctNums: number[]): any {
  for (const p of voucher.postings) {
    if (!excludeAcctNums.includes(p.account?.number)) {
      return p;
    }
  }
  return null;
}

if (wrongAcctVoucher) {
  wrongAcctCounterpart = findCounterpart(wrongAcctVoucher, [6340, 2710]);
  console.log("Wrong account voucher:", wrongAcctVoucher.id, "posting gross:", wrongAcctPosting.amountGross, "vatType:", wrongAcctPosting.vatType?.id);
}

if (dupVouchers.length >= 2) {
  console.log(`Found ${dupVouchers.length} vouchers with 6860/3150 - picking last as duplicate`);
}
// For duplicates, find the counterpart of one of them
const dupEntry = dupVouchers[dupVouchers.length - 1]; // last one is the duplicate
const dupPosting = dupEntry?.posting;
const dupCounterpart = dupEntry ? findCounterpart(dupEntry.voucher, [6860, 2710]) : null;
if (dupEntry) {
  console.log("Duplicate voucher:", dupEntry.voucher.id, "posting gross:", dupPosting.amountGross, "vatType:", dupPosting.vatType?.id);
  console.log("Dup counterpart acct:", dupCounterpart?.account?.number, "id:", dupCounterpart?.account?.id);
}

if (missingVatVoucher) {
  // Check if has 2710 posting
  for (const p of missingVatVoucher.postings) {
    if (p.account?.number === 2710) {
      missingVatHas2710 = true;
    }
  }
  missingVatCounterpart = findCounterpart(missingVatVoucher, [4300, 2710]);
  console.log("Missing VAT voucher:", missingVatVoucher.id, "posting gross:", missingVatPosting.amountGross, "amount(net):", missingVatPosting.amount, "has2710:", missingVatHas2710, "vatType:", missingVatPosting.vatType?.id);
  console.log("MVA counterpart acct:", missingVatCounterpart?.account?.number, "id:", missingVatCounterpart?.account?.id, "supplier:", missingVatCounterpart?.supplier?.id);
}

if (wrongAmtVoucher) {
  wrongAmtCounterpart = findCounterpart(wrongAmtVoucher, [6300, 2710]);
  console.log("Wrong amount voucher:", wrongAmtVoucher.id, "posting gross:", wrongAmtPosting.amountGross, "vatType:", wrongAmtPosting.vatType?.id);
}

// Step 3: Build combined corrective voucher
const postings: any[] = [];
let row = 1;

// --- 1. Wrong account: reclassify 6340 -> 6390, amount 2300 ---
const wrongVatType = wrongAcctPosting.vatType?.id ?? 0;
postings.push({
  row: row++,
  account: { id: acctMap[6340] },
  amountGross: -wrongAcctPosting.amountGross,
  amountGrossCurrency: -wrongAcctPosting.amountGross,
  vatType: { id: wrongVatType },
  description: "Korreksjon: ompostering fra 6340",
});
postings.push({
  row: row++,
  account: { id: acctMap[6390] },
  amountGross: wrongAcctPosting.amountGross,
  amountGrossCurrency: wrongAcctPosting.amountGross,
  vatType: { id: wrongVatType },
  description: "Korreksjon: ompostering til 6390",
});

// --- 2. Duplicate reversal: 6860, 3150 ---
const dupVatType = dupPosting.vatType?.id ?? 0;
postings.push({
  row: row++,
  account: { id: acctMap[6860] },
  amountGross: -dupPosting.amountGross,
  amountGrossCurrency: -dupPosting.amountGross,
  vatType: { id: dupVatType },
  description: "Korreksjon: reversering duplikat",
});
const dupCounterLine: any = {
  row: row++,
  account: { id: dupCounterpart.account.id },
  amountGross: dupPosting.amountGross,
  amountGrossCurrency: dupPosting.amountGross,
  description: "Korreksjon: reversering duplikat",
};
if (dupCounterpart.account.number === 2400 && dupCounterpart.supplier?.id) {
  dupCounterLine.supplier = { id: dupCounterpart.supplier.id };
}
postings.push(dupCounterLine);

// --- 3. Missing VAT: 4300, excl 16550, missing 2710 ---
const vatAmount = 16550 * 0.25; // = 4137.5
if (!missingVatHas2710) {
  // Exact branch: no 2710 posting, add direct VAT line
  postings.push({
    row: row++,
    account: { id: acctMap[2710] },
    amountGross: vatAmount,
    amountGrossCurrency: vatAmount,
    description: "Korreksjon: manglende MVA",
  });
  const vatCounterLine: any = {
    row: row++,
    account: { id: missingVatCounterpart.account.id },
    amountGross: -vatAmount,
    amountGrossCurrency: -vatAmount,
    description: "Korreksjon: manglende MVA",
  };
  if (missingVatCounterpart.account.number === 2400 && missingVatCounterpart.supplier?.id) {
    vatCounterLine.supplier = { id: missingVatCounterpart.supplier.id };
  }
  postings.push(vatCounterLine);
} else {
  // Other branch: 2710 exists but VAT is too low
  postings.push({
    row: row++,
    account: { id: acctMap[4300] },
    amountGross: vatAmount,
    amountGrossCurrency: vatAmount,
    vatType: { id: 1 },
    description: "Korreksjon: manglende MVA",
  });
  const vatCounterLine: any = {
    row: row++,
    account: { id: missingVatCounterpart.account.id },
    amountGross: -vatAmount,
    amountGrossCurrency: -vatAmount,
    description: "Korreksjon: leverandørgjeld MVA",
  };
  if (missingVatCounterpart.account.number === 2400 && missingVatCounterpart.supplier?.id) {
    vatCounterLine.supplier = { id: missingVatCounterpart.supplier.id };
  }
  postings.push(vatCounterLine);
}

// --- 4. Wrong amount: 6300, 17800 posted instead of 8900, diff = 8900 ---
const amtDiff = wrongAmtPosting.amountGross - 8900; // should be 17800 - 8900 = 8900
const wrongAmtVatType = wrongAmtPosting.vatType?.id ?? 0;
postings.push({
  row: row++,
  account: { id: acctMap[6300] },
  amountGross: -amtDiff,
  amountGrossCurrency: -amtDiff,
  vatType: { id: wrongAmtVatType },
  description: "Korreksjon: feil beløp",
});
const amtCounterLine: any = {
  row: row++,
  account: { id: wrongAmtCounterpart.account.id },
  amountGross: amtDiff,
  amountGrossCurrency: amtDiff,
  description: "Korreksjon: feil beløp",
};
if (wrongAmtCounterpart.account.number === 2400 && wrongAmtCounterpart.supplier?.id) {
  amtCounterLine.supplier = { id: wrongAmtCounterpart.supplier.id };
}
postings.push(amtCounterLine);

console.log("\nPosting correction voucher with", postings.length, "lines:");
console.log(JSON.stringify(postings, null, 2));

const result = await api("POST", "/ledger/voucher?sendToLedger=true", {
  date: "2026-02-28",
  description: "Korreksjon: korrigering av feil i hovedbok jan-feb 2026",
  postings,
});

console.log("\nCorrection voucher created:");
console.log(JSON.stringify(result, null, 2));
