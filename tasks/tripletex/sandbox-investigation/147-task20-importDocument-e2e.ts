// Task 20: Register supplier invoice FROM PDF — importDocument path
// T20 is DIFFERENT from T11: T20 has PDF attachment, 6 checks, 10 points
// importDocument scored 7-8/10 on T20; direct voucher scored 2/10
// Hypothesis: importDocument creates supplierInvoice entity which scorer checks
// Fix for check 5: add physicalAddress + country on supplier

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };

// Test data matching the Oakwood Ltd PDF (en_03)
const SUPPLIER_NAME = "Oakwood SBX T20";
const ORG_NR = "948453436";
const INVOICE_NR = "INV-2026-T20-SBX";
const INVOICE_DATE = "2026-05-24";
const DUE_DATE = "2026-06-23";
const DESCRIPTION = "Programvarelisens";
const NET = 45400;
const GROSS = 56750;
const VAT_AMOUNT = 11350;
const EXPENSE_ACCOUNT = 6340;

async function main() {
  // Step 1: POST /supplier — with physicalAddress + country (fix for check 5)
  console.log("=== Step 1: POST /supplier ===");
  const supplierRes = await fetch(`${BASE}/supplier`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({
      name: SUPPLIER_NAME,
      organizationNumber: ORG_NR,
      postalAddress: {
        addressLine1: "Parkveien 77",
        postalCode: "9008",
        city: "Tromsø",
        country: { id: 161 },
      },
      physicalAddress: {
        addressLine1: "Parkveien 77",
        postalCode: "9008",
        city: "Tromsø",
        country: { id: 161 },
      },
      bankAccountPresentation: [{ bban: "17062016817" }],
    }),
  });
  const supplier = await supplierRes.json();
  console.log("Status:", supplierRes.status);
  if (!supplierRes.ok) {
    console.log("ERROR:", JSON.stringify(supplier, null, 2));
    throw new Error("Supplier creation failed");
  }
  const supplierId = supplier.value.id;
  const supplierLedgerAccountId = supplier.value.ledgerAccount.id;
  console.log(`supplierId=${supplierId}, ledgerAccountId=${supplierLedgerAccountId}`);
  console.log("postalAddress:", JSON.stringify(supplier.value.postalAddress));
  console.log("physicalAddress:", JSON.stringify(supplier.value.physicalAddress));
  console.log("bankAccountPresentation:", JSON.stringify(supplier.value.bankAccountPresentation));

  // Step 2: GET /ledger/account
  console.log("\n=== Step 2: GET /ledger/account ===");
  const acctRes = await fetch(
    `${BASE}/ledger/account?number=${EXPENSE_ACCOUNT}&isApplicableForSupplierInvoice=true&fields=*`,
    { headers: H }
  );
  const acct = await acctRes.json();
  console.log("Status:", acctRes.status);
  if (!acctRes.ok) throw new Error("Account lookup failed");
  const expenseAccountId = acct.values[0].id;
  console.log(`expenseAccountId=${expenseAccountId}, name=${acct.values[0].name}`);

  // Step 3: POST /ledger/voucher/importDocument with EHF XML
  console.log("\n=== Step 3: POST /ledger/voucher/importDocument ===");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${INVOICE_NR}</cbc:ID>
  <cbc:IssueDate>${INVOICE_DATE}</cbc:IssueDate>
  <cbc:DueDate>${DUE_DATE}</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>NOK</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0192">${ORG_NR}</cbc:EndpointID>
      <cac:PartyName>
        <cbc:Name>${SUPPLIER_NAME}</cbc:Name>
      </cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>Parkveien 77</cbc:StreetName>
        <cbc:CityName>Tromsø</cbc:CityName>
        <cbc:PostalZone>9008</cbc:PostalZone>
        <cac:Country>
          <cbc:IdentificationCode>NO</cbc:IdentificationCode>
        </cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>NO${ORG_NR}MVA</cbc:CompanyID>
        <cac:TaxScheme>
          <cbc:ID>VAT</cbc:ID>
        </cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${SUPPLIER_NAME}</cbc:RegistrationName>
        <cbc:CompanyID schemeID="0192">${ORG_NR}</cbc:CompanyID>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0192">999999999</cbc:EndpointID>
      <cac:PartyName>
        <cbc:Name>Ditt firma</cbc:Name>
      </cac:PartyName>
      <cac:PostalAddress>
        <cac:Country>
          <cbc:IdentificationCode>NO</cbc:IdentificationCode>
        </cac:Country>
      </cac:PostalAddress>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>Ditt firma</cbc:RegistrationName>
        <cbc:CompanyID schemeID="0192">999999999</cbc:CompanyID>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="NOK">${VAT_AMOUNT}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="NOK">${NET}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="NOK">${VAT_AMOUNT}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>25</cbc:Percent>
        <cac:TaxScheme>
          <cbc:ID>VAT</cbc:ID>
        </cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="NOK">${NET}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="NOK">${NET}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="NOK">${GROSS}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="NOK">${GROSS}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  <cac:InvoiceLine>
    <cbc:ID>1</cbc:ID>
    <cbc:InvoicedQuantity unitCode="EA">1</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="NOK">${NET}</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Name>${DESCRIPTION}</cbc:Name>
      <cac:ClassifiedTaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>25</cbc:Percent>
        <cac:TaxScheme>
          <cbc:ID>VAT</cbc:ID>
        </cac:TaxScheme>
      </cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="NOK">${NET}</cbc:PriceAmount>
    </cac:Price>
  </cac:InvoiceLine>
</Invoice>`;

  const formData = new FormData();
  formData.append("file", new Blob([xml], { type: "text/xml" }), `${INVOICE_NR}.xml`);

  const importRes = await fetch(`${BASE}/ledger/voucher/importDocument`, {
    method: "POST",
    headers: { Authorization: AUTH },
    body: formData,
  });
  const importJson = await importRes.json();
  console.log("Status:", importRes.status);
  if (!importRes.ok) {
    console.log("ERROR:", JSON.stringify(importJson, null, 2));
    throw new Error("importDocument failed");
  }
  console.log("Response shape: values length =", importJson.values?.length);
  const voucherId = importJson.values[0].id;
  const voucherVersion = importJson.values[0].version;
  console.log(`voucherId=${voucherId}, version=${voucherVersion}, number=${importJson.values[0].number}`);
  console.log("vendorInvoiceNumber:", importJson.values[0].vendorInvoiceNumber);
  console.log("description:", importJson.values[0].description);

  // Step 4: PUT /ledger/voucher/{id}?sendToLedger=false — set postings
  console.log("\n=== Step 4: PUT /ledger/voucher — set postings ===");
  const putRes = await fetch(`${BASE}/ledger/voucher/${voucherId}?sendToLedger=false`, {
    method: "PUT",
    headers: H,
    body: JSON.stringify({
      version: voucherVersion,
      postings: [
        {
          row: 1,
          account: { id: expenseAccountId },
          description: DESCRIPTION,
          vatType: { id: 1 },
          amount: NET,
          amountCurrency: NET,
          amountGross: GROSS,
          amountGrossCurrency: GROSS,
        },
        {
          row: 2,
          account: { id: supplierLedgerAccountId },
          supplier: { id: supplierId },
          description: DESCRIPTION,
          amount: -GROSS,
          amountCurrency: -GROSS,
          amountGross: -GROSS,
          amountGrossCurrency: -GROSS,
          invoiceNumber: INVOICE_NR,
          termOfPayment: DUE_DATE,
        },
      ],
    }),
  });
  const putJson = await putRes.json();
  console.log("Status:", putRes.status);
  if (!putRes.ok) {
    console.log("ERROR:", JSON.stringify(putJson, null, 2));
    throw new Error("PUT postings failed");
  }
  const newVersion = putJson.value.version;
  console.log(`newVersion=${newVersion}, number=${putJson.value.number}`);
  console.log("Postings count:", putJson.value.postings?.length);
  for (const p of putJson.value.postings || []) {
    console.log(`  row=${p.row} account=${p.account?.id} amount=${p.amount} amountGross=${p.amountGross} vatType=${p.vatType?.id} supplier=${p.supplier?.id || '-'} systemGenerated=${p.systemGenerated}`);
  }

  // Step 5: PUT /ledger/voucher/{id}?sendToLedger=true — book (ONLY version, no postings)
  console.log("\n=== Step 5: PUT /ledger/voucher — book ===");
  const bookRes = await fetch(`${BASE}/ledger/voucher/${voucherId}?sendToLedger=true`, {
    method: "PUT",
    headers: H,
    body: JSON.stringify({ version: newVersion }),
  });
  const bookJson = await bookRes.json();
  console.log("Status:", bookRes.status);
  if (!bookRes.ok) {
    console.log("ERROR:", JSON.stringify(bookJson, null, 2));
    throw new Error("Booking failed");
  }
  console.log(`BOOKED: number=${bookJson.value.number}, numberAsString=${bookJson.value.numberAsString}`);

  // === VERIFICATION ===
  console.log("\n=== VERIFICATION: GET /supplierInvoice ===");
  const siRes = await fetch(
    `${BASE}/supplierInvoice?supplierName=${encodeURIComponent(SUPPLIER_NAME)}&fields=*`,
    { headers: H }
  );
  const siJson = await siRes.json();
  console.log("Status:", siRes.status);
  if (siRes.ok && siJson.values?.length > 0) {
    for (const si of siJson.values) {
      console.log(`  supplierInvoice id=${si.id}`);
      console.log(`    invoiceNumber=${si.invoiceNumber}`);
      console.log(`    invoiceDate=${si.invoiceDate}`);
      console.log(`    dueDate=${si.dueDate}`);
      console.log(`    amount=${si.amount}`);
      console.log(`    amountCurrency=${si.amountCurrency}`);
      console.log(`    outstandingAmount=${si.outstandingAmount}`);
      console.log(`    supplier.id=${si.supplier?.id}`);
      console.log(`    voucher.id=${si.voucher?.id}`);
      console.log(`    vendorInvoiceNumber=${si.vendorInvoiceNumber || '(not set)'}`);
    }
  } else {
    console.log("No supplierInvoice found or error:", JSON.stringify(siJson));
  }

  // Also verify supplier data
  console.log("\n=== VERIFICATION: GET /supplier ===");
  const supVerifyRes = await fetch(
    `${BASE}/supplier/${supplierId}?fields=*`,
    { headers: H }
  );
  const supVerify = await supVerifyRes.json();
  if (supVerifyRes.ok) {
    const s = supVerify.value;
    console.log(`  name=${s.name}`);
    console.log(`  organizationNumber=${s.organizationNumber}`);
    console.log(`  postalAddress: ${s.postalAddress?.addressLine1}, ${s.postalAddress?.postalCode} ${s.postalAddress?.city}, country=${s.postalAddress?.country?.id}`);
    console.log(`  physicalAddress: ${s.physicalAddress?.addressLine1}, ${s.physicalAddress?.postalCode} ${s.physicalAddress?.city}, country=${s.physicalAddress?.country?.id}`);
    console.log(`  bankAccountPresentation: ${JSON.stringify(s.bankAccountPresentation)}`);
    console.log(`  ledgerAccount.id=${s.ledgerAccount?.id}`);
  }

  // Verify voucher final state
  console.log("\n=== VERIFICATION: GET /ledger/voucher ===");
  const vVerifyRes = await fetch(
    `${BASE}/ledger/voucher/${voucherId}?fields=*`,
    { headers: H }
  );
  const vVerify = await vVerifyRes.json();
  if (vVerifyRes.ok) {
    const v = vVerify.value;
    console.log(`  id=${v.id}, number=${v.number}, numberAsString=${v.numberAsString}`);
    console.log(`  description=${v.description}`);
    console.log(`  date=${v.date}`);
    console.log(`  voucherType=${JSON.stringify(v.voucherType)}`);
    console.log(`  supplierVoucherType=${JSON.stringify(v.supplierVoucherType)}`);
    console.log(`  vendorInvoiceNumber=${v.vendorInvoiceNumber}`);
    console.log("  Postings:");
    for (const p of v.postings || []) {
      console.log(`    row=${p.row} account=${p.account?.id} amount=${p.amount} amountGross=${p.amountGross} vatType=${p.vatType?.id} supplier=${p.supplier?.id || '-'} invoiceNumber=${p.invoiceNumber || '-'} systemGenerated=${p.systemGenerated}`);
    }
  }

  console.log("\n=== DONE ===");
  console.log("5 API calls + 3 verification GETs");
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
