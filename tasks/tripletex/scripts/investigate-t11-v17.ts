// Investigate task 11 - Part 17:
// HYPOTHESIS: The scorer might check for a supplierInvoice object differently,
// or maybe the importDocument approach creates some metadata that breaks things.
//
// NEW APPROACH: Try POST /ledger/voucher with voucherType=Leverandørfaktura directly,
// then check what the scorer might see.
// Also: check what happens if we DON'T use importDocument at all.

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };

const ts = Date.now();
const DATE = "2026-03-21";
const GROSS = 42100;
const NET = 33680;
const VAT_AMT = 8420;
const ORG_NR = "914791676"; // Fresh valid org number
const SUPPLIER_NAME = `DirectVoucher ${ts}`;
const INVOICE_NR = `INV-DIRECT-${ts}`;
const DESCRIPTION = "kontortjenester";

// Step 1: Create supplier
const supRes = await fetch(`${BASE}/supplier`, {
  method: "POST", headers: H,
  body: JSON.stringify({ name: SUPPLIER_NAME, organizationNumber: ORG_NR }),
});
const supData = await supRes.json();
const supId = supData.value.id;
const supLedger = supData.value.ledgerAccount.id;
console.log("Supplier:", supId, "ledger:", supLedger);

// Step 2: Get expense account
const acctRes = await fetch(`${BASE}/ledger/account?number=6540&isApplicableForSupplierInvoice=true&fields=*`, { headers: H });
const acctData = await acctRes.json();
const expAcctId = acctData.values[0].id;
console.log("Account:", expAcctId);

// Step 3: Get voucherType for Leverandørfaktura
const vtRes = await fetch(`${BASE}/ledger/voucherType?name=Leverandørfaktura&fields=*`, { headers: H });
const vtData = await vtRes.json();
const vtId = vtData.values?.[0]?.id;
console.log("VoucherType Leverandørfaktura:", vtId);

// ============================================================
// Approach A: POST /ledger/voucher with voucherType=Leverandørfaktura + booking
// ============================================================
console.log("\n=== Approach A: Direct POST /ledger/voucher with Leverandørfaktura type ===");

const vRes = await fetch(`${BASE}/ledger/voucher`, {
  method: "POST", headers: H,
  body: JSON.stringify({
    date: DATE,
    description: DESCRIPTION,
    voucherType: { id: vtId },
    postings: [
      {
        row: 1,
        date: DATE,
        description: DESCRIPTION,
        account: { id: expAcctId },
        vatType: { id: 1 },
        currency: { id: 1 },
        amount: NET,
        amountCurrency: NET,
        amountGross: GROSS,
        amountGrossCurrency: GROSS,
      },
      {
        row: 2,
        date: DATE,
        description: DESCRIPTION,
        account: { id: supLedger },
        supplier: { id: supId },
        currency: { id: 1 },
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
const vData = await vRes.json();
console.log("POST voucher status:", vRes.status);

if (!vRes.ok) {
  console.log("FAILED:", JSON.stringify(vData));
} else {
  const voucher = vData.value;
  console.log("Voucher id:", voucher.id, "number:", voucher.number, "description:", voucher.description);
  console.log("Postings count:", voucher.postings?.length);

  // Check if a supplierInvoice was auto-created
  console.log("\n--- Check supplierInvoice after direct POST ---");
  const siRes = await fetch(
    `${BASE}/supplierInvoice?invoiceDateFrom=2026-01-01&invoiceDateTo=2026-12-31&voucherId=${voucher.id}&fields=*,supplier(id,name)`,
    { headers: H }
  );
  const siData = await siRes.json();
  console.log("SI count (by voucherId):", siData.fullResultSize);

  // Also search by supplier
  const siRes2 = await fetch(
    `${BASE}/supplierInvoice?invoiceDateFrom=2026-01-01&invoiceDateTo=2026-12-31&supplierId=${supId}&fields=*,supplier(id,name)`,
    { headers: H }
  );
  const siData2 = await siRes2.json();
  console.log("SI count (by supplierId):", siData2.fullResultSize);

  if (siData.values?.length) {
    const si = siData.values[0];
    console.log("SI found!", JSON.stringify(si, null, 2));
  }

  if (siData2.values?.length) {
    console.log("SI by supplier:", siData2.values.map((si: any) => `id=${si.id} inv=${si.invoiceNumber} amt=${si.amount}`));
  }

  // Check the voucher in detail
  const vDetailRes = await fetch(`${BASE}/ledger/voucher/${voucher.id}?fields=*,postings(*,account(*),vatType(*),supplier(*))`, { headers: H });
  const vDetail = await vDetailRes.json();
  console.log("\n--- Voucher detail ---");
  console.log("  description:", vDetail.value.description);
  console.log("  vendorInvoiceNumber:", vDetail.value.vendorInvoiceNumber);
  console.log("  voucherType:", vDetail.value.voucherType?.id, vDetail.value.voucherType?.name);
  console.log("  number:", vDetail.value.number);
  for (const p of (vDetail.value.postings || [])) {
    console.log(`  posting: row=${p.row} acct=${p.account?.number} amt=${p.amount} gross=${p.amountGross} vat=${p.vatType?.number || '-'} sup=${p.supplier?.name || '-'} inv=${p.invoiceNumber || '-'} sysGen=${p.systemGenerated}`);
  }
}

// ============================================================
// Approach B: What if we need to use POST /supplierInvoice/:addRecipient or
// some other API? Let's check available endpoints
// ============================================================
console.log("\n\n=== Check available supplierInvoice endpoints ===");

// Try OPTIONS
const optRes = await fetch(`${BASE}/supplierInvoice`, {
  method: "OPTIONS",
  headers: { Authorization: AUTH },
});
console.log("OPTIONS /supplierInvoice:", optRes.status);
console.log("Allow header:", optRes.headers.get("Allow"));

// Try GET to list all supplier invoices
const allSiRes = await fetch(
  `${BASE}/supplierInvoice?invoiceDateFrom=2026-01-01&invoiceDateTo=2026-12-31&fields=id,invoiceNumber,amount,supplier(id,name),voucher(id,number,description)&count=5&sorting=-invoiceDate`,
  { headers: H }
);
const allSi = await allSiRes.json();
console.log("\nLatest 5 supplierInvoices:");
for (const si of (allSi.values || []).slice(0, 5)) {
  console.log(`  id=${si.id} inv=${si.invoiceNumber} amt=${si.amount} sup=${si.supplier?.name} voucher_id=${si.voucher?.id} voucher_num=${si.voucher?.number} voucher_desc=${si.voucher?.description?.substring(0,40)}`);
}

// ============================================================
// Approach C: Check if the issue is that POST /ledger/voucher auto-books
// (returns number immediately), while importDocument doesn't
// ============================================================
console.log("\n\n=== Check: does direct POST auto-book? ===");
// The voucher from approach A - is it already booked?
if (vData.value) {
  console.log("Direct POST voucher number:", vData.value.number);
  console.log("Direct POST voucher numberAsString:", vData.value.numberAsString);
  // If number is set and >0, it's booked

  // Now try to book it with sendToLedger=true
  console.log("\nTrying to book (sendToLedger=true)...");
  const bookRes = await fetch(`${BASE}/ledger/voucher/${vData.value.id}?sendToLedger=true`, {
    method: "PUT", headers: H,
    body: JSON.stringify({ version: vData.value.version }),
  });
  const bookData = await bookRes.json();
  console.log("Book status:", bookRes.status);
  if (bookRes.ok) {
    console.log("Booked! number:", bookData.value?.number);
  } else {
    console.log("Book failed:", JSON.stringify(bookData).substring(0, 500));
  }

  // After booking, check SI again
  if (bookRes.ok) {
    console.log("\n--- Check supplierInvoice AFTER booking ---");
    const siRes3 = await fetch(
      `${BASE}/supplierInvoice?invoiceDateFrom=2026-01-01&invoiceDateTo=2026-12-31&voucherId=${vData.value.id}&fields=*,supplier(id,name)`,
      { headers: H }
    );
    const siData3 = await siRes3.json();
    console.log("SI count (by voucherId after book):", siData3.fullResultSize);
    if (siData3.values?.length) {
      const si = siData3.values[0];
      console.log("SI found:", `id=${si.id} inv=${si.invoiceNumber} amt=${si.amount} sup=${si.supplier?.name}`);
    }
  }
}
