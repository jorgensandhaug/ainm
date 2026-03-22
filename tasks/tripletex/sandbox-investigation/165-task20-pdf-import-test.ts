// Test importing the ORIGINAL PDF directly via importDocument
// Instead of constructing XML from the PDF data
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

// First, create a simple PDF that looks like a supplier invoice
// (Using a real PDF-like content that Tripletex might parse)
const invoicePdf = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj
3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<</Font<</F1 4 0 R>>>>/Contents 5 0 R>>endobj
4 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
5 0 obj<</Length 200>>
stream
BT /F1 12 Tf 50 700 Td (FAKTURA) Tj ET
BT /F1 10 Tf 50 680 Td (PDF Import Test AS) Tj ET
BT /F1 10 Tf 50 660 Td (Org.nr: 912345678) Tj ET
BT /F1 10 Tf 50 640 Td (Fakturanummer: INV-PDF-001) Tj ET
BT /F1 10 Tf 50 620 Td (Totalt: 10000 kr) Tj ET
endstream
endobj
xref
0 6
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
0000000266 00000 n
0000000343 00000 n
trailer<</Root 1 0 R/Size 6>>
startxref
595
%%EOF`;

// Test importing a PDF
console.log("=== TEST: POST /ledger/voucher/importDocument with PDF ===");
const formData = new FormData();
formData.append("file", new Blob([invoicePdf], { type: "application/pdf" }), "invoice.pdf");

const res = await fetch(`${BASE}/ledger/voucher/importDocument`, {
  method: "POST",
  headers: { Authorization: AUTH },
  body: formData,
});
console.log("Status:", res.status);
const data = await res.json();
console.log(JSON.stringify(data, null, 2));

if (res.ok && data.values?.length > 0) {
  const voucherId = data.values[0].id;
  console.log("\n=== VOUCHER AFTER PDF IMPORT ===");
  const vRes = await fetch(`${BASE}/ledger/voucher/${voucherId}?fields=id,description,number,date,document,attachment,ediDocument,voucherType(id,name)`, {
    headers: { Authorization: AUTH }
  });
  const vData = await vRes.json();
  console.log(JSON.stringify(vData.value, null, 2));

  // Check if a supplierInvoice was created
  console.log("\n=== SUPPLIER INVOICE SEARCH ===");
  const siRes = await fetch(`${BASE}/supplierInvoice?invoiceDateFrom=2025-01-01&invoiceDateTo=2027-12-31&fields=id,invoiceNumber,amount,invoiceDate,supplier(id,name)&count=5&sorting=id&order=desc`, {
    headers: { Authorization: AUTH }
  });
  const siData = await siRes.json();
  console.log("Latest SIs:", siData.count);
  for (const si of siData.values || []) {
    console.log(JSON.stringify(si));
  }
}

// Also try: can we use importDocument with BOTH the XML and PDF?
// Maybe upload PDF as a second call
console.log("\n\n=== TEST 2: What if we use the real production PDF? ===");
// Read the actual production PDF
const fs = require("fs");
const pdfPath = "/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-22-091213690Z-7c4183ab/attachments/01-leverandorfaktura_pt_08.pdf";
if (fs.existsSync(pdfPath)) {
  const pdfData = fs.readFileSync(pdfPath);
  console.log("PDF size:", pdfData.length, "bytes");

  const formData2 = new FormData();
  formData2.append("file", new Blob([pdfData], { type: "application/pdf" }), "leverandorfaktura_pt_08.pdf");

  const res2 = await fetch(`${BASE}/ledger/voucher/importDocument`, {
    method: "POST",
    headers: { Authorization: AUTH },
    body: formData2,
  });
  console.log("Import real PDF status:", res2.status);
  const data2 = await res2.json();
  console.log(JSON.stringify(data2, null, 2).substring(0, 2000));

  if (res2.ok && data2.values?.length > 0) {
    const vid2 = data2.values[0].id;
    console.log("\n=== VOUCHER FROM REAL PDF ===");
    const vr2 = await fetch(`${BASE}/ledger/voucher/${vid2}?fields=id,description,number,date,document,attachment,ediDocument,vendorInvoiceNumber`, {
      headers: { Authorization: AUTH }
    });
    console.log(JSON.stringify((await vr2.json()).value, null, 2));
  }
} else {
  console.log("PDF not found at", pdfPath);
}
