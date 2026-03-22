// Deep dump of all entities for Check 5 investigation
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const voucherId = 609371919;
const supplierId = 108569292;
const siId = 2147688156;

// 1. GET orderLine details
console.log("=== ORDER LINE DETAILS ===");
const olRes = await fetch(`${BASE}/order/orderline/1607606795?fields=*`, {
  headers: { Authorization: AUTH }
});
if (olRes.ok) {
  console.log(JSON.stringify((await olRes.json()).value, null, 2));
} else {
  console.log("OrderLine failed:", olRes.status, await olRes.text());
}

// 2. GET postings via voucher expand
console.log("\n=== VOUCHER WITH EXPANDED POSTINGS ===");
const vpRes = await fetch(`${BASE}/ledger/voucher/${voucherId}?fields=id,description,number,date,voucherType(id,name),postings(id,row,date,description,account(id,number,name),amount,amountCurrency,amountGross,amountGrossCurrency,amountVat,amountVatCurrency,vatType(id,number,name,percentage),supplier(id,name),invoiceNumber,termOfPayment,closedDate)`, {
  headers: { Authorization: AUTH }
});
console.log(JSON.stringify((await vpRes.json()).value, null, 2));

// 3. GET approval list elements
console.log("\n=== APPROVAL LIST ELEMENTS ===");
for (const aeId of [647519992, 647520001]) {
  const aeRes = await fetch(`${BASE}/voucherApprovalListElement/${aeId}?fields=*`, {
    headers: { Authorization: AUTH }
  });
  if (aeRes.ok) {
    console.log(JSON.stringify((await aeRes.json()).value, null, 2));
  } else {
    console.log(`Approval element ${aeId}:`, aeRes.status, await aeRes.text());
  }
}

// 4. GET supplierInvoice with ALL possible expand fields
console.log("\n=== SUPPLIER INVOICE (fully expanded) ===");
const si2Res = await fetch(`${BASE}/supplierInvoice/${siId}?fields=id,version,invoiceNumber,invoiceDate,invoiceDueDate,kidOrReceiverReference,amount,amountCurrency,amountExcludingVat,amountExcludingVatCurrency,currency(id,code),isCreditNote,outstandingAmount,supplier(id,name,organizationNumber),voucher(id,number,description,date),orderLines(id,description,amount,amountExcludingVat,unitPriceExcludingVat,vatType(id,number,percentage)),payments,originalInvoiceDocumentId,approvalListElements(id,status,comment,approvedBy)`, {
  headers: { Authorization: AUTH }
});
console.log(JSON.stringify((await si2Res.json()).value, null, 2));

// 5. Check if we can upload a document to the voucher
console.log("\n=== DOCUMENT UPLOAD TEST ===");
// Try uploading a dummy PDF to the voucher
const pdfContent = "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 0/Kids[]>>endobj\nxref\n0 3\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \ntrailer<</Root 1 0 R/Size 3>>\nstartxref\n109\n%%EOF";
const docForm = new FormData();
docForm.append("file", new Blob([pdfContent], { type: "application/pdf" }), "invoice.pdf");
docForm.append("content", JSON.stringify({ voucherId: voucherId }));

// Try POST /document
const docPostRes = await fetch(`${BASE}/document`, {
  method: "POST",
  headers: { Authorization: AUTH },
  body: docForm,
});
console.log("POST /document status:", docPostRes.status);
const docPostText = await docPostRes.text();
console.log("Response:", docPostText.substring(0, 500));

// 6. Try PUT to attach document to voucher
console.log("\n=== VOUCHER DOCUMENT FIELD ===");
// The voucher has document: null. Can we set it?
const vdRes = await fetch(`${BASE}/ledger/voucher/${voucherId}`, {
  method: "PUT",
  headers: { Authorization: AUTH, "Content-Type": "application/json" },
  body: JSON.stringify({ version: 6, document: { id: 1024360110 } })
});
console.log("PUT voucher with document:", vdRes.status);
const vdText = await vdRes.text();
console.log("Response:", vdText.substring(0, 500));
