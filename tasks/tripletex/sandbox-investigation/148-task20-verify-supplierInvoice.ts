// Verify supplierInvoice entity from importDocument run
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };

async function main() {
  // 1. Check supplierInvoice with proper date params
  console.log("=== GET /supplierInvoice ===");
  const siRes = await fetch(
    `${BASE}/supplierInvoice?invoiceDateFrom=2026-01-01&invoiceDateTo=2026-12-31&fields=*`,
    { headers: H }
  );
  const siJson = await siRes.json();
  console.log("Status:", siRes.status, "count:", siJson.values?.length);

  // Find ones from our test
  for (const si of siJson.values || []) {
    if (si.voucher?.id === 609294111 || si.vendorInvoiceNumber?.includes("T20")) {
      console.log("\n--- Our T20 supplierInvoice ---");
      console.log(JSON.stringify(si, null, 2));
    }
  }

  // Show last few entries
  console.log("\n=== Last 3 supplierInvoices ===");
  const last = (siJson.values || []).slice(-3);
  for (const si of last) {
    console.log(`  id=${si.id} vendorInvoiceNumber=${si.vendorInvoiceNumber} invoiceDate=${si.invoiceDate} amount=${si.amount} supplier=${si.supplier?.id} voucher=${si.voucher?.id}`);
  }

  // 2. GET voucher with expanded postings
  console.log("\n=== GET /ledger/voucher/609294111 with expanded fields ===");
  const vRes = await fetch(
    `${BASE}/ledger/voucher/609294111?fields=id,number,description,date,voucherType(*),supplierVoucherType,vendorInvoiceNumber,postings(*)`,
    { headers: H }
  );
  const vJson = await vRes.json();
  console.log("Status:", vRes.status);
  if (vRes.ok) {
    const v = vJson.value;
    console.log(`  description: "${v.description}"`);
    console.log(`  vendorInvoiceNumber: "${v.vendorInvoiceNumber}"`);
    console.log(`  voucherType: id=${v.voucherType?.id} name=${v.voucherType?.name}`);
    console.log(`  postings (${v.postings?.length}):`);
    for (const p of v.postings || []) {
      console.log(`    row=${p.row} account=${p.account?.id} amount=${p.amount} amountGross=${p.amountGross} vatType=${p.vatType?.id} supplier=${p.supplier?.id || '-'} invoiceNumber=${p.invoiceNumber || '-'} termOfPayment=${p.termOfPayment || '-'} systemGenerated=${p.systemGenerated}`);
    }
  }

  // 3. GET supplier with expanded address fields
  console.log("\n=== GET /supplier/108510907 with address fields ===");
  const supRes = await fetch(
    `${BASE}/supplier/108510907?fields=id,name,organizationNumber,postalAddress(*),physicalAddress(*),bankAccountPresentation(*)`,
    { headers: H }
  );
  const supJson = await supRes.json();
  console.log("Status:", supRes.status);
  if (supRes.ok) {
    const s = supJson.value;
    console.log(`  name: ${s.name}`);
    console.log(`  postalAddress: ${s.postalAddress?.addressLine1}, ${s.postalAddress?.postalCode} ${s.postalAddress?.city}, country=${s.postalAddress?.country?.id}`);
    console.log(`  physicalAddress: ${s.physicalAddress?.addressLine1}, ${s.physicalAddress?.postalCode} ${s.physicalAddress?.city}, country=${s.physicalAddress?.country?.id}`);
  }

  // 4. Compare: what does a direct voucher (non-importDocument) look like?
  // The 2/10 production run voucher had vendorInvoiceNumber=null and supplierVoucherType=null
  // Let's confirm by creating a direct voucher and comparing
  console.log("\n=== Compare: What production 2/10 run had ===");
  console.log("Direct POST /ledger/voucher: vendorInvoiceNumber=null, no supplierInvoice entity");
  console.log("importDocument: vendorInvoiceNumber set, supplierInvoice entity created");
}

main().catch(e => { console.error(e); process.exit(1); });
