// Investigate task 11 - Part 19:
// Check the voucherType assigned by importDocument vs the actual
// "Leverandørfaktura" voucherType in the sandbox account.
// If they differ, maybe importDocument creates a DIFFERENT type that
// the scorer doesn't recognize.

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };

// Get ALL voucherTypes
console.log("=== All VoucherTypes ===");
const vtRes = await fetch(`${BASE}/ledger/voucherType?fields=*&count=100`, { headers: H });
const vtData = await vtRes.json();
for (const vt of (vtData.values || [])) {
  console.log(`  id=${vt.id} name="${vt.name}" number=${vt.number}`);
}

// Now check what voucherType the importDocument voucher has
// Use a known importDocument-created voucher from previous test
const siRes = await fetch(`${BASE}/supplierInvoice?invoiceDateFrom=2026-01-01&invoiceDateTo=2026-12-31&fields=id,voucher(id,voucherType(*))&count=5`, { headers: H });
const siData = await siRes.json();
console.log("\n=== SupplierInvoice voucher types ===");
for (const si of (siData.values || []).slice(0, 5)) {
  console.log(`  si_id=${si.id} voucher_id=${si.voucher?.id} voucherType_id=${si.voucher?.voucherType?.id} voucherType_name="${si.voucher?.voucherType?.name}"`);
}

// Now check direct POST /ledger/voucher voucher types
// Get recent vouchers by type to compare
const lmfRes = await fetch(`${BASE}/ledger/voucherType?name=Leverandørfaktura&fields=*`, { headers: H });
const lmfData = await lmfRes.json();
const lmfId = lmfData.values?.[0]?.id;
console.log("\n=== Leverandørfaktura voucherType ===");
console.log(`  id=${lmfId} name="${lmfData.values?.[0]?.name}"`);

// Check what importDocument uses
console.log("\n=== Checking importDocument voucher type (8201898 from production trace vs sandbox) ===");
// In the production trace, voucherType.id was 8201898
// In our sandbox, Leverandørfaktura is 9744845
// These are different accounts, so different IDs are expected.
// BUT: are they the SAME type (Leverandørfaktura)?

// Let's check by looking at a supplierInvoice's voucher in the sandbox
const v1Res = await fetch(`${BASE}/supplierInvoice?invoiceDateFrom=2026-01-01&invoiceDateTo=2026-12-31&count=1&fields=id,voucher(id,voucherType(id,name,number))`, { headers: H });
const v1Data = await v1Res.json();
if (v1Data.values?.length) {
  const si = v1Data.values[0];
  console.log(`  SI voucher type: id=${si.voucher?.voucherType?.id} name="${si.voucher?.voucherType?.name}" number=${si.voucher?.voucherType?.number}`);
  console.log(`  Leverandørfaktura type from lookup: id=${lmfId}`);
  console.log(`  Same? ${si.voucher?.voucherType?.id === lmfId}`);
}

// CRITICAL: Check if the importDocument-created voucher has a DIFFERENT
// voucherType than the standard Leverandørfaktura
// Let's look at a specific importDocument-created voucher
const importedVouchers = await fetch(
  `${BASE}/ledger/voucher?dateFrom=2026-03-21&dateTo=2026-03-22&fields=id,number,description,voucherType(id,name,number)&count=10&sorting=-id`,
  { headers: H }
);
const importedData = await importedVouchers.json();
console.log("\n=== Recent vouchers with voucherType ===");
for (const v of (importedData.values || []).slice(0, 10)) {
  console.log(`  id=${v.id} num=${v.number} desc="${v.description?.substring(0,40)}" type=${v.voucherType?.id}/${v.voucherType?.name}/${v.voucherType?.number}`);
}

// NOW THE REAL QUESTION: What is the SCORER checking?
// Let me look at all available supplierInvoice fields to understand what might be wrong
console.log("\n\n=== ONE FULL supplierInvoice from importDocument ===");
const fullSiRes = await fetch(
  `${BASE}/supplierInvoice?invoiceDateFrom=2026-01-01&invoiceDateTo=2026-12-31&count=1&fields=*`,
  { headers: H }
);
const fullSiData = await fullSiRes.json();
if (fullSiData.values?.length) {
  const si = fullSiData.values[0];
  console.log(JSON.stringify(si, null, 2));
}
