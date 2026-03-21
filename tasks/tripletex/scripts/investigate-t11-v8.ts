// Investigate task 11 - Part 8:
// Try POST /ledger/voucher directly (the OLD approach before EHF import)
// The EHF import CREATES a supplierInvoice object, but
// the old POST /ledger/voucher might NOT create one -- that's maybe what the scorer checks

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };

const ts = Date.now();
const DATE = "2026-03-21";
const GROSS = 42100;
const NET = 33680;
const VAT_AMT = 8420;
const SUPPLIER_NAME = `DirectV ${ts}`;
const ORG_NR = "976098897";
const INVOICE_NR = `INV-DIR-${ts}`;
const DESCRIPTION = "kontortjenester";

// ============================================================
// APPROACH: POST /ledger/voucher directly (no EHF import)
// ============================================================
console.log("=== APPROACH: Direct POST /ledger/voucher ===");

// Step 1: POST /supplier
console.log("\n--- Step 1: POST /supplier ---");
const supRes = await fetch(`${BASE}/supplier`, {
  method: "POST", headers: H,
  body: JSON.stringify({ name: SUPPLIER_NAME, organizationNumber: ORG_NR }),
});
const supData = await supRes.json();
const supId = supData.value.id;
const supLedger = supData.value.ledgerAccount.id;
console.log("Supplier:", supId, "LedgerAcct:", supLedger);

// Step 2: GET expense account
console.log("\n--- Step 2: GET /ledger/account ---");
const acctRes = await fetch(`${BASE}/ledger/account?number=6540&isApplicableForSupplierInvoice=true&fields=*`, { headers: H });
const acctData = await acctRes.json();
const expAcctId = acctData.values[0].id;
console.log("Expense account:", expAcctId);

// Step 3: GET voucherType (Leverandørfaktura)
console.log("\n--- Step 3: GET /ledger/voucherType ---");
const vtRes = await fetch(`${BASE}/ledger/voucherType?name=Leverandørfaktura&fields=*`, { headers: H });
const vtData = await vtRes.json();
console.log("VoucherType count:", vtData.fullResultSize);
for (const vt of (vtData.values || [])) {
  console.log("  id:", vt.id, "name:", vt.name);
}
const vtId = vtData.values?.[0]?.id;
console.log("Using voucherType:", vtId);

// Step 4: POST /ledger/voucher directly with correct postings
console.log("\n--- Step 4: POST /ledger/voucher ---");
const voucherRes = await fetch(`${BASE}/ledger/voucher`, {
  method: "POST",
  headers: H,
  body: JSON.stringify({
    date: DATE,
    description: DESCRIPTION,
    voucherType: { id: vtId },
    postings: [
      {
        account: { id: expAcctId },
        description: DESCRIPTION,
        vatType: { id: 1 },
        amount: NET,
        amountCurrency: NET,
        amountGross: GROSS,
        amountGrossCurrency: GROSS,
      },
      {
        account: { id: supLedger },
        supplier: { id: supId },
        description: DESCRIPTION,
        amount: -GROSS,
        amountCurrency: -GROSS,
        amountGross: -GROSS,
        amountGrossCurrency: -GROSS,
        invoiceNumber: INVOICE_NR,
        termOfPayment: DATE,
      },
    ],
  }),
});
console.log("Status:", voucherRes.status);
const voucherData = await voucherRes.json();
console.log("Response:", JSON.stringify(voucherData, null, 2));

if (voucherRes.ok) {
  const vId = voucherData.value.id;
  const vNumber = voucherData.value.number;
  console.log("\nVoucher ID:", vId, "Number:", vNumber);

  // Check if a supplierInvoice was created
  console.log("\n--- Check supplierInvoice ---");
  const siRes = await fetch(
    `${BASE}/supplierInvoice?invoiceDateFrom=2026-01-01&invoiceDateTo=2026-12-31&voucherId=${vId}&fields=*,supplier(id,name)`,
    { headers: H }
  );
  const siData = await siRes.json();
  console.log("SupplierInvoice by voucherId:", siRes.status, "count:", siData.fullResultSize);
  if (siData.values && siData.values.length > 0) {
    for (const si of siData.values) {
      console.log(JSON.stringify(si, null, 2));
    }
  } else {
    console.log("NO supplierInvoice created by POST /ledger/voucher");
  }

  // Get full voucher state
  console.log("\n--- Full voucher state ---");
  const fvRes = await fetch(`${BASE}/ledger/voucher/${vId}?fields=*,postings(*)`, { headers: H });
  const fvData = await fvRes.json();
  console.log("Number:", fvData.value?.number, "VoucherType:", fvData.value?.voucherType?.id);
  console.log("Description:", fvData.value?.description);
  console.log("vendorInvoiceNumber:", fvData.value?.vendorInvoiceNumber);
  for (const p of (fvData.value?.postings || [])) {
    console.log(`  row=${p.row} acct=${p.account?.id} amt=${p.amount} gross=${p.amountGross} vat=${p.vatType?.id} sup=${p.supplier?.id} invNr=${p.invoiceNumber} term=${p.termOfPayment} sysGen=${p.systemGenerated}`);
  }
}

// ============================================================
// Also try POST /supplierInvoice with a file upload (multipart)
// ============================================================
console.log("\n\n=== APPROACH B: POST /supplierInvoice with file ===");

// Create new supplier for this test
const supB_Name = `SIPost ${ts}`;
const supBRes = await fetch(`${BASE}/supplier`, {
  method: "POST", headers: H,
  body: JSON.stringify({ name: supB_Name, organizationNumber: "810079468" }),
});
const supBData = await supBRes.json();
if (!supBRes.ok) {
  console.log("Supplier B failed:", JSON.stringify(supBData));
} else {
  const supBId = supBData.value.id;
  console.log("Supplier B:", supBId);

  // Try multipart POST to /supplierInvoice
  const formData = new FormData();
  formData.append("body", JSON.stringify({
    supplier: { id: supBId },
    invoiceNumber: `INV-SIPOST-${ts}`,
    invoiceDate: DATE,
    invoiceDueDate: DATE,
    amount: -GROSS,
    amountCurrency: -GROSS,
    currency: { id: 1 },
  }));

  const siPostRes = await fetch(`${BASE}/supplierInvoice`, {
    method: "POST",
    headers: { Authorization: AUTH },
    body: formData,
  });
  console.log("Multipart POST status:", siPostRes.status);
  const siPostData = await siPostRes.json();
  console.log("Response:", JSON.stringify(siPostData, null, 2));

  // Try with Content-Type: application/json
  console.log("\n--- Try JSON POST ---");
  const siPostRes2 = await fetch(`${BASE}/supplierInvoice`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({
      supplier: { id: supBId },
      invoiceNumber: `INV-SIPOST2-${ts}`,
      invoiceDate: DATE,
      invoiceDueDate: DATE,
      amount: -GROSS,
      amountCurrency: -GROSS,
      currency: { id: 1 },
      orderLines: [{
        description: DESCRIPTION,
        count: -1,
        unitCostCurrency: GROSS,
        unitPriceExcludingVatCurrency: NET,
        unitPriceIncludingVatCurrency: GROSS,
        vatType: { id: 1 },
        amountExcludingVatCurrency: -NET,
        amountIncludingVatCurrency: -GROSS,
        currency: { id: 1 },
      }],
    }),
  });
  console.log("JSON POST status:", siPostRes2.status);
  const siPostData2 = await siPostRes2.json();
  console.log("Response:", JSON.stringify(siPostData2, null, 2));
}
