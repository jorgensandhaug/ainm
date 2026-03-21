// Investigate task 11 - Part 16:
// Test supplierInvoice search by invoiceNumber filter
// This could be what the scorer uses

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

const voucherId = 609190742; // From v14 test (Tindra AS)

// Method 1: by voucherId
const r1 = await fetch(`${BASE}/supplierInvoice?invoiceDateFrom=2026-01-01&invoiceDateTo=2026-12-31&voucherId=${voucherId}&fields=id,invoiceNumber`, { headers: H });
const d1 = await r1.json();
console.log("By voucherId:", d1.fullResultSize);

// Method 2: by supplierName
const r2 = await fetch(`${BASE}/supplierInvoice?invoiceDateFrom=2026-01-01&invoiceDateTo=2026-12-31&supplierName=Tindra&fields=id,invoiceNumber,supplier(name)`, { headers: H });
const d2 = await r2.json();
console.log("By supplierName Tindra:", d2.fullResultSize);

// Method 3: by invoiceNumber
const r3 = await fetch(`${BASE}/supplierInvoice?invoiceDateFrom=2026-01-01&invoiceDateTo=2026-12-31&invoiceNumber=INV-2026-3624&fields=id,invoiceNumber`, { headers: H });
const d3 = await r3.json();
console.log("By invoiceNumber:", r3.status, d3.fullResultSize);
if (d3.values) console.log("  found:", d3.values.map((v: any) => `id=${v.id} inv=${v.invoiceNumber}`));
if (d3.validationMessages) console.log("  validation:", JSON.stringify(d3.validationMessages));

// Method 4: check if we can filter by invoiceNumber via query params
const r4 = await fetch(`${BASE}/supplierInvoice?invoiceDateFrom=2026-01-01&invoiceDateTo=2026-12-31&fields=id,invoiceNumber,supplier(id,name)&count=5&sorting=-invoiceDate`, { headers: H });
const d4 = await r4.json();
console.log("\nAll SIs (latest 5):");
for (const si of (d4.values || []).slice(0, 5)) {
  console.log(`  id=${si.id} inv=${si.invoiceNumber} sup=${si.supplier?.name}`);
}

// Method 5: Check supplier search
const r5 = await fetch(`${BASE}/supplier?name=Tindra&fields=id,name,organizationNumber`, { headers: H });
const d5 = await r5.json();
console.log("\nSupplier search 'Tindra':", d5.fullResultSize);
for (const s of (d5.values || [])) {
  console.log(`  id=${s.id} name="${s.name}" org=${s.organizationNumber}`);
}

// Method 6: Check ledger/voucher search with vendorInvoiceNumber
const r6 = await fetch(`${BASE}/ledger/voucher?dateFrom=2026-01-01&dateTo=2026-12-31&number=508&fields=id,number,description,vendorInvoiceNumber`, { headers: H });
const d6 = await r6.json();
console.log("\nVoucher search by number 508:", d6.fullResultSize);
for (const v of (d6.values || [])) {
  console.log(`  id=${v.id} num=${v.number} desc="${v.description}" vendor=${v.vendorInvoiceNumber}`);
}

// Method 7: Check ledger/posting search by account
const r7 = await fetch(`${BASE}/ledger/posting?dateFrom=2026-03-21&dateTo=2026-03-22&accountNumberFrom=6540&accountNumberTo=6540&fields=id,amount,amountGross,invoiceNumber,supplier(id,name),account(number)&count=10`, { headers: H });
const d7 = await r7.json();
console.log("\nPostings on account 6540 today:", d7.fullResultSize);
for (const p of (d7.values || []).slice(0, 5)) {
  console.log(`  id=${p.id} acct=${p.account?.number} amt=${p.amount} gross=${p.amountGross} inv=${p.invoiceNumber} sup=${p.supplier?.name}`);
}

// CRITICAL: Check the number of each key entity type
console.log("\n\n=== CRITICAL COUNTS IN FRESH ACCOUNT ===");

// In a fresh production account, there should be exactly:
// - 1 supplier
// - 1 supplierInvoice
// - 1 voucher (the booked one)
// But what if something else creates extra entities?

const rSup = await fetch(`${BASE}/supplier?fields=id,name&count=1000`, { headers: H });
const dSup = await rSup.json();
console.log("Total suppliers:", dSup.fullResultSize);
if ((dSup.fullResultSize || 0) > 5) {
  console.log("  (listing first 5 only)");
  for (const s of (dSup.values || []).slice(0, 5)) {
    console.log(`    id=${s.id} name="${s.name}"`);
  }
}
