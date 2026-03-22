// Dump supplierInvoice entity and voucher postings for Check 5 investigation
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const voucherId = 609371919;
const supplierId = 108569292;

// GET supplierInvoice with proper date range
console.log("=== SUPPLIER INVOICE (with date range) ===");
const siRes = await fetch(`${BASE}/supplierInvoice?invoiceDateFrom=2025-01-01&invoiceDateTo=2027-12-31&supplierId=${supplierId}&fields=*`, {
  headers: { Authorization: AUTH }
});
const siData = await siRes.json();
console.log("Status:", siRes.status, "Count:", siData.count);
if (siData.values && siData.values.length > 0) {
  for (const si of siData.values) {
    console.log("\n--- SupplierInvoice ---");
    console.log(JSON.stringify(si, null, 2));
  }
} else {
  console.log("No supplierInvoices found");
  // Try searching by invoiceNumber
  console.log("\n=== TRY BY INVOICE NUMBER ===");
  const si2 = await fetch(`${BASE}/supplierInvoice?invoiceDateFrom=2025-01-01&invoiceDateTo=2027-12-31&invoiceNumber=INV-2026-CHK5&fields=*`, {
    headers: { Authorization: AUTH }
  });
  const si2Data = await si2.json();
  console.log("By invoiceNumber:", si2.status, "count:", si2Data.count);
  if (si2Data.values?.length > 0) {
    console.log(JSON.stringify(si2Data.values[0], null, 2));
  }
}

// GET voucher postings with full details
console.log("\n\n=== VOUCHER POSTINGS (fields=*) ===");
const pRes = await fetch(`${BASE}/ledger/posting?voucherId=${voucherId}&fields=*`, {
  headers: { Authorization: AUTH }
});
const pData = await pRes.json();
console.log("Postings count:", pData.count);
for (const p of pData.values) {
  console.log("\n--- Posting row", p.row, "---");
  console.log(JSON.stringify(p, null, 2));
}

// GET the attachment document details
console.log("\n\n=== VOUCHER ATTACHMENT DOCUMENT ===");
const aRes = await fetch(`${BASE}/document/1024360110?fields=*`, {
  headers: { Authorization: AUTH }
});
if (aRes.ok) {
  const aData = await aRes.json();
  console.log(JSON.stringify(aData.value, null, 2));
} else {
  console.log("Document 1024360110:", aRes.status, await aRes.text());
}

// GET the ediDocument details
console.log("\n\n=== EDI DOCUMENT ===");
const eRes = await fetch(`${BASE}/document/1024360107?fields=*`, {
  headers: { Authorization: AUTH }
});
if (eRes.ok) {
  const eData = await eRes.json();
  console.log(JSON.stringify(eData.value, null, 2));
} else {
  console.log("Document 1024360107:", eRes.status, await eRes.text());
}

// Check the voucher type details
console.log("\n\n=== VOUCHER TYPE ===");
const vtRes = await fetch(`${BASE}/ledger/voucherType/9744845?fields=*`, {
  headers: { Authorization: AUTH }
});
if (vtRes.ok) {
  const vtData = await vtRes.json();
  console.log(JSON.stringify(vtData.value, null, 2));
} else {
  console.log("VoucherType:", vtRes.status, await vtRes.text());
}

// Check supplierInvoice orderLines
console.log("\n\n=== SUPPLIER INVOICE ORDER LINES ===");
const olRes = await fetch(`${BASE}/supplierInvoice?invoiceDateFrom=2025-01-01&invoiceDateTo=2027-12-31&supplierId=${supplierId}&fields=id,invoiceNumber,amount,amountExcludingVat,outstandingAmount,invoiceDate,invoiceDueDate,supplier,voucher,orderLines(id,description,amount,amountExcludingVat,unitPriceExcludingVat,vatType),comment,description,paymentTypeId,currency,isCreditNote,kid,approvalListElements`, {
  headers: { Authorization: AUTH }
});
const olData = await olRes.json();
console.log("Status:", olRes.status);
if (olData.values?.length > 0) {
  console.log(JSON.stringify(olData.values[0], null, 2));
}
