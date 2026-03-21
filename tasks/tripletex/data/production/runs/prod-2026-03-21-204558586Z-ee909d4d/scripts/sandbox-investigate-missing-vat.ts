// Sandbox investigation: verify missing-VAT detection priority (Case A vs Case B)
// The updated playbook says runs 397faff2, 7fed6a02, db732541 ALL failed Check 3
// by matching a voucher WITH 2710 (Case B) when the actual error was a different
// voucher WITHOUT 2710 (Case A).
//
// This run (ee909d4d) used the same approach and likely also failed.
// Let's investigate what the correct detection logic should be.

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
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

// Step 1: Get account IDs for 6500 and 2710
const acctData = await api(
  "GET",
  `/ledger/account?number=6500,2710,2400,1920&fields=id,number,vatType(id)`
);
console.log("Accounts:", JSON.stringify(acctData.values.map((a: any) => ({ number: a.number, id: a.id, vatTypeId: a.vatType?.id }))));

const acctMap: Record<number, { id: number; vatTypeId: number }> = {};
for (const a of acctData.values) {
  acctMap[a.number] = { id: a.id, vatTypeId: a.vatType?.id ?? 0 };
}

// Step 2: Create two vouchers on account 6500 for amount 14100:
// Voucher A: CORRECTLY booked (with VAT) - gross=14100, vatType=1 → auto-generates 2710=2820
// Voucher B: ERROR voucher (without VAT) - gross=14100, vatType=0 → no 2710 posting

// Get a supplier for 2400 postings
const supplierData = await api("GET", "/supplier?count=1&fields=id,name");
const supplierId = supplierData.values[0]?.id;
console.log(`Supplier: id=${supplierId}, name=${supplierData.values[0]?.name}`);

// Create voucher A: correctly booked WITH VAT
const voucherA = await api("POST", "/ledger/voucher?sendToLedger=true", {
  date: "2026-01-15",
  description: "Konsulenttjenester - korrekt bokført",
  postings: [
    { row: 1, account: { id: acctMap[6500].id }, amountGross: 14100, amountGrossCurrency: 14100, vatType: { id: 1 }, description: "Konsulenttjenester" },
    { row: 2, account: { id: acctMap[2400].id }, amountGross: -14100, amountGrossCurrency: -14100, supplier: { id: supplierId }, description: "Konsulenttjenester" },
  ],
});
console.log(`\nVoucher A (correct, WITH VAT): id=${voucherA.value.id}`);
for (const p of voucherA.value.postings || []) {
  console.log(`  acct=${p.account?.number ?? p.account?.id}, gross=${p.amountGross}, net=${p.amount}, vatType=${p.vatType?.id}`);
}

// Create voucher B: ERROR voucher WITHOUT VAT (missing VAT line)
const voucherB = await api("POST", "/ledger/voucher?sendToLedger=true", {
  date: "2026-02-10",
  description: "Konsulenttjenester uten MVA",
  postings: [
    { row: 1, account: { id: acctMap[6500].id }, amountGross: 14100, amountGrossCurrency: 14100, vatType: { id: 0 }, description: "Konsulenttjenester uten MVA" },
    { row: 2, account: { id: acctMap[2400].id }, amountGross: -14100, amountGrossCurrency: -14100, supplier: { id: supplierId }, description: "Konsulenttjenester uten MVA" },
  ],
});
console.log(`\nVoucher B (error, WITHOUT VAT): id=${voucherB.value.id}`);
for (const p of voucherB.value.postings || []) {
  console.log(`  acct=${p.account?.number ?? p.account?.id}, gross=${p.amountGross}, net=${p.amount}, vatType=${p.vatType?.id}`);
}

// Step 3: Now query all vouchers and demonstrate detection logic
const voucherData = await api(
  "GET",
  `/ledger/voucher?dateFrom=2026-01-01&dateTo=2026-03-01&fields=id,date,description,postings(id,account(id,number),amount,amountGross,amountGrossCurrency,vatType(id),supplier(id),description)&count=1000`
);

console.log(`\n--- Detection Logic Test ---`);
console.log(`Total vouchers found: ${voucherData.values.length}`);

// Find all vouchers with 6500 posting where gross=14100
const candidates: { voucher: any; posting6500: any; has2710: boolean; amount2710: number }[] = [];

for (const v of voucherData.values) {
  let posting6500: any = null;
  let has2710 = false;
  let amount2710 = 0;

  for (const p of v.postings || []) {
    if (p.account?.number === 6500 && Math.abs(p.amountGross) === 14100) {
      posting6500 = p;
    }
    if (p.account?.number === 2710) {
      has2710 = true;
      amount2710 = Math.abs(p.amountGross);
    }
  }

  if (posting6500) {
    candidates.push({ voucher: v, posting6500, has2710, amount2710 });
  }
}

console.log(`\nCandidates with 6500/14100 gross:`);
for (const c of candidates) {
  console.log(`  Voucher ${c.voucher.id} (${c.voucher.date}): "${c.voucher.description}", has2710=${c.has2710}, amount2710=${c.amount2710}, net=${c.posting6500.amount}, gross=${c.posting6500.amountGross}, vatType=${c.posting6500.vatType?.id}`);
}

// NEW DETECTION: Priority 1 = no-2710 (Case A), Priority 2 = with-2710 (Case B)
const caseA = candidates.find(c => !c.has2710);
const caseB = candidates.find(c => c.has2710);

console.log(`\nCase A match (no 2710): ${caseA ? `voucher ${caseA.voucher.id}` : 'NONE'}`);
console.log(`Case B match (with 2710): ${caseB ? `voucher ${caseB.voucher.id}` : 'NONE'}`);

if (caseA) {
  console.log(`\n>>> CORRECT: Should use Case A (no 2710 posting)`);
  console.log(`   VAT to add on 2710: ${14100 * 0.25} = 3525`);
  console.log(`   Counterpart: -3525`);
} else if (caseB) {
  console.log(`\n>>> Fallback to Case B (2710 exists but too low)`);
  const correctVat = 14100 * 0.25;
  const vatShortfall = correctVat - caseB.amount2710;
  console.log(`   Correct VAT: ${correctVat}, existing 2710: ${caseB.amount2710}, shortfall: ${vatShortfall}`);
}

// Step 4: Post correction using Case A
if (caseA) {
  // Find counterpart for missing VAT voucher
  let counterpart: any = null;
  for (const p of caseA.voucher.postings || []) {
    if (p.account?.number !== 6500 && p.account?.number !== 2710) {
      counterpart = p;
    }
  }

  console.log(`\nPosting Case A correction:`);
  const correctionBody = {
    date: "2026-02-28",
    description: "Korreksjonsbilag: manglende MVA",
    postings: [
      {
        row: 1,
        account: { id: acctMap[2710].id },
        amountGross: 3525,
        amountGrossCurrency: 3525,
        description: "Korreksjon: manglende MVA",
      },
      {
        row: 2,
        account: { id: counterpart.account.id },
        amountGross: -3525,
        amountGrossCurrency: -3525,
        supplier: counterpart.supplier?.id ? { id: counterpart.supplier.id } : undefined,
        description: "Korreksjon: manglende MVA",
      },
    ],
  };

  const result = await api("POST", "/ledger/voucher?sendToLedger=true", correctionBody);
  console.log(`\nCorrection voucher created: id=${result.value.id}`);
  for (const p of result.value.postings || []) {
    console.log(`  acct=${p.account?.id}, gross=${p.amountGross}, net=${p.amount}, vatType=${p.vatType?.id}`);
  }
}

console.log(`\nTotal sandbox calls: ${callCount}`);
