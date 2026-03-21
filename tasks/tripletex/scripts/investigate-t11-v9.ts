// Investigate task 11 - Part 9:
// Direct POST /ledger/voucher with row numbers
// Compare: does the direct voucher approach create a supplierInvoice object?

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };

const ts = Date.now();
const DATE = "2026-03-21";
const GROSS = 42100;
const NET = 33680;
const SUPPLIER_NAME = `DirectRow ${ts}`;
const ORG_NR = "976098897";
const INVOICE_NR = `INV-DROW-${ts}`;
const DESCRIPTION = "kontortjenester";

// Step 1: POST /supplier
const supRes = await fetch(`${BASE}/supplier`, {
  method: "POST", headers: H,
  body: JSON.stringify({ name: SUPPLIER_NAME, organizationNumber: ORG_NR }),
});
const supData = await supRes.json();
const supId = supData.value.id;
const supLedger = supData.value.ledgerAccount.id;
console.log("Supplier:", supId);

// Step 2: GET expense account
const acctRes = await fetch(`${BASE}/ledger/account?number=6540&isApplicableForSupplierInvoice=true&fields=*`, { headers: H });
const acctData = await acctRes.json();
const expAcctId = acctData.values[0].id;

// Step 3: GET voucherType
const vtRes = await fetch(`${BASE}/ledger/voucherType?name=Leverandørfaktura&fields=*`, { headers: H });
const vtData = await vtRes.json();
const vtId = vtData.values?.[0]?.id;

// Step 4: POST /ledger/voucher with row numbers
console.log("\n=== POST /ledger/voucher with rows ===");
const voucherRes = await fetch(`${BASE}/ledger/voucher`, {
  method: "POST",
  headers: H,
  body: JSON.stringify({
    date: DATE,
    description: DESCRIPTION,
    voucherType: { id: vtId },
    postings: [
      {
        row: 1,
        account: { id: expAcctId },
        description: DESCRIPTION,
        vatType: { id: 1 },
        amount: NET,
        amountCurrency: NET,
        amountGross: GROSS,
        amountGrossCurrency: GROSS,
      },
      {
        row: 2,
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

if (voucherRes.ok) {
  const vId = voucherData.value.id;
  const vNumber = voucherData.value.number;
  console.log("Voucher ID:", vId, "Number:", vNumber);
  console.log("vendorInvoiceNumber:", voucherData.value.vendorInvoiceNumber);

  // Check if supplierInvoice was created
  console.log("\n--- Check supplierInvoice for direct voucher ---");
  const siRes = await fetch(
    `${BASE}/supplierInvoice?invoiceDateFrom=2026-01-01&invoiceDateTo=2026-12-31&voucherId=${vId}&fields=*,supplier(id,name)`,
    { headers: H }
  );
  const siData = await siRes.json();
  console.log("SupplierInvoice count:", siData.fullResultSize);
  if (siData.values?.length) {
    for (const si of siData.values) {
      console.log("  SI id:", si.id, "invoiceNumber:", si.invoiceNumber, "amount:", si.amount);
      console.log("  supplier:", si.supplier?.name, "id:", si.supplier?.id);
    }
  } else {
    console.log("  NO supplierInvoice created by POST /ledger/voucher!");
    console.log("  This means: POST /ledger/voucher does NOT create a supplierInvoice object");
    console.log("  Only importDocument creates a supplierInvoice");
  }

  // Check postings
  const vpRes = await fetch(`${BASE}/ledger/voucher/${vId}?fields=*,postings(*)`, { headers: H });
  const vpData = await vpRes.json();
  console.log("\n--- Voucher postings ---");
  console.log("Number:", vpData.value?.number, "Description:", vpData.value?.description);
  for (const p of (vpData.value?.postings || [])) {
    console.log(`  row=${p.row} acct=${p.account?.id} amt=${p.amount} gross=${p.amountGross} vat=${p.vatType?.id} sup=${p.supplier?.id} sysGen=${p.systemGenerated}`);
  }
} else {
  console.log("FAILED:", JSON.stringify(voucherData, null, 2));
}

// ============================================================
// KEY DISCOVERY: Now let's compare the EHF approach state
// ============================================================
console.log("\n\n=== COMPARISON: EHF import vs direct voucher ===");
console.log("The question is: what does the scorer check?");
console.log("If it checks /supplierInvoice: only EHF import creates one");
console.log("If it checks /ledger/voucher: both approaches create one");
console.log("");
console.log("Since EHF import scores 0/8 on task 11, maybe the scorer");
console.log("is NOT checking /supplierInvoice but /ledger/voucher");
console.log("And the EHF import creates something DIFFERENT from what scorer expects.");
console.log("");
console.log("Hypotheses:");
console.log("1. Scorer checks voucher.description and EHF sets it to 'Faktura nummer X fra Y'");
console.log("   while scorer expects just the task description like 'kontortjenester'");
console.log("2. Scorer checks vendorInvoiceNumber on the voucher");
console.log("3. Scorer checks specific posting field values");
console.log("4. Something about the proxy or the scored environment is different");

// Let's see what the EHF import sets as voucher description
console.log("\n--- Check voucher description from EHF import ---");
// Use the voucher from v7 test
const ehfVRes = await fetch(`${BASE}/ledger/voucher/609184371?fields=*`, { headers: H });
if (ehfVRes.ok) {
  const ehfVData = await ehfVRes.json();
  console.log("EHF voucher description:", JSON.stringify(ehfVData.value?.description));
  console.log("EHF vendorInvoiceNumber:", JSON.stringify(ehfVData.value?.vendorInvoiceNumber));
}

// And check the direct voucher
if (voucherRes.ok) {
  console.log("\nDirect voucher description:", JSON.stringify(voucherData.value?.description));
  console.log("Direct vendorInvoiceNumber:", JSON.stringify(voucherData.value?.vendorInvoiceNumber));
}
