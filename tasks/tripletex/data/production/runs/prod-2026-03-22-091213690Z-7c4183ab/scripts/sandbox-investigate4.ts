const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const voucherId = 609370008;

// Get the voucher with full expansion
console.log("=== Voucher with expanded postings ===");
const vRes = await fetch(`${BASE}/ledger/voucher/${voucherId}?fields=id,date,number,year,description,voucherType(id,name),postings(id,row,account(id,number,name),description,amount,amountCurrency,amountGross,amountGrossCurrency,vatType(id,name,number,percentage),supplier(id,name),invoiceNumber,termOfPayment,currency(id,code))`, {
  headers: { Authorization: AUTH }
});
const vData = await vRes.json();
console.log(JSON.stringify(vData.value, null, 2));

// Also look at the supplier invoice entity closely
console.log("\n=== Supplier Invoice entity ===");
const siRes = await fetch(`${BASE}/supplierInvoice?supplierId=108568022&invoiceDateFrom=2025-01-01&invoiceDateTo=2027-01-01&fields=id,invoiceNumber,invoiceDate,supplier(id,name,organizationNumber,postalAddress,physicalAddress,bankAccountPresentation),invoiceDueDate,amount,amountCurrency,amountExcludingVat,amountExcludingVatCurrency,currency(id,code),voucher(id,number,year,voucherType(id,name)),isCreditNote,kidOrReceiverReference,outstandingAmount`, {
  headers: { Authorization: AUTH }
});
const siData = await siRes.json();
console.log(JSON.stringify(siData.values, null, 2));
