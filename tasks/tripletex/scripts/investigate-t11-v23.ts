// Investigate task 11 - Part 23:
// EXHAUSTIVE COMPARISON:
// Test ALL approaches and compare their final states.
//
// Approach A: importDocument + PUT postings + book (current approach)
// Approach B: importDocument + PUT postings + book, BUT skip the explicit supplier POST
//            (let importDocument auto-create the supplier)
// Approach C: Direct POST /ledger/voucher with voucherType=Leverandørfaktura (no importDocument)
//
// For each approach, read back ALL scorer-relevant state:
// - supplier fields
// - supplierInvoice fields
// - voucher + postings
// - ledger postings

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };

const DATE = "2026-03-21";
const GROSS = 42100;
const NET = 33680;
const VAT_AMT = 8420;

// Valid org numbers for 3 approaches
const configs = [
  { label: "A: import+supplier+postings+book", org: "104332188", doSupplier: true, doImport: true, doPostings: true, doBook: true },
  { label: "B: import+postings+book (NO explicit supplier)", org: "794026548", doSupplier: false, doImport: true, doPostings: true, doBook: true },
  { label: "C: direct POST voucher (no import)", org: "235116154", doSupplier: true, doImport: false, doPostings: false, doBook: false },
];

for (const cfg of configs) {
  const ts = Date.now();
  const SUPPLIER_NAME = `Test-${cfg.org}`;
  const INVOICE_NR = `INV-${cfg.org}-${ts}`;
  const DESCRIPTION = "kontortjenester";

  console.log(`\n${"=".repeat(60)}`);
  console.log(`=== ${cfg.label} ===`);
  console.log(`${"=".repeat(60)}`);

  let supId: number | null = null;
  let supLedger: number | null = null;

  // Get expense account
  const acctRes = await fetch(`${BASE}/ledger/account?number=6540&isApplicableForSupplierInvoice=true&fields=*`, { headers: H });
  const expAcctId = (await acctRes.json()).values[0].id;

  if (cfg.doSupplier) {
    const supRes = await fetch(`${BASE}/supplier`, {
      method: "POST", headers: H,
      body: JSON.stringify({ name: SUPPLIER_NAME, organizationNumber: cfg.org }),
    });
    const supData = await supRes.json();
    supId = supData.value.id;
    supLedger = supData.value.ledgerAccount.id;
    console.log("  Created supplier:", supId);
  }

  let voucherId: number | null = null;
  let voucherVersion: number = 0;

  if (cfg.doImport) {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${INVOICE_NR}</cbc:ID>
  <cbc:IssueDate>${DATE}</cbc:IssueDate>
  <cbc:DueDate>${DATE}</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>NOK</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0192">${cfg.org}</cbc:EndpointID>
      <cac:PartyName><cbc:Name>${SUPPLIER_NAME}</cbc:Name></cac:PartyName>
      <cac:PostalAddress><cbc:StreetName>G1</cbc:StreetName><cbc:CityName>Oslo</cbc:CityName><cbc:PostalZone>0001</cbc:PostalZone><cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
      <cac:PartyTaxScheme><cbc:CompanyID>NO${cfg.org}MVA</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>
      <cac:PartyLegalEntity><cbc:RegistrationName>${SUPPLIER_NAME}</cbc:RegistrationName><cbc:CompanyID schemeID="0192">${cfg.org}</cbc:CompanyID></cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0192">123456785</cbc:EndpointID>
      <cac:PartyName><cbc:Name>Buyer</cbc:Name></cac:PartyName>
      <cac:PostalAddress><cbc:StreetName>T1</cbc:StreetName><cbc:CityName>Oslo</cbc:CityName><cbc:PostalZone>0001</cbc:PostalZone><cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
      <cac:PartyLegalEntity><cbc:RegistrationName>Buyer</cbc:RegistrationName><cbc:CompanyID schemeID="0192">123456785</cbc:CompanyID></cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="NOK">${VAT_AMT}</cbc:TaxAmount>
    <cac:TaxSubtotal><cbc:TaxableAmount currencyID="NOK">${NET}</cbc:TaxableAmount><cbc:TaxAmount currencyID="NOK">${VAT_AMT}</cbc:TaxAmount><cac:TaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>25</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory></cac:TaxSubtotal>
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
    <cac:Item><cbc:Name>${DESCRIPTION}</cbc:Name><cac:ClassifiedTaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>25</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory></cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="NOK">${NET}</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>
</Invoice>`;

    const fd = new FormData();
    fd.append("file", new Blob([xml], { type: "application/xml" }), "invoice.xml");
    const importRes = await fetch(`${BASE}/ledger/voucher/importDocument`, {
      method: "POST", headers: { Authorization: AUTH },
      body: fd,
    });
    const importData = await importRes.json();
    console.log("  Import status:", importRes.status);
    voucherId = importData.values[0].id;
    voucherVersion = importData.values[0].version;
    console.log("  Voucher:", voucherId, "version:", voucherVersion);

    // If no explicit supplier, find the auto-created one
    if (!cfg.doSupplier) {
      const siRes = await fetch(`${BASE}/supplierInvoice?invoiceDateFrom=2026-01-01&invoiceDateTo=2026-12-31&voucherId=${voucherId}&fields=supplier(id,name,organizationNumber,ledgerAccount(id))`, { headers: H });
      const siData = await siRes.json();
      if (siData.values?.length) {
        supId = siData.values[0].supplier.id;
        supLedger = siData.values[0].supplier.ledgerAccount?.id;
        console.log("  Auto-created supplier:", supId);

        // If ledgerAccount not in SI response, get it
        if (!supLedger) {
          const supFetch = await fetch(`${BASE}/supplier/${supId}?fields=ledgerAccount(id)`, { headers: H });
          const supFetchData = await supFetch.json();
          supLedger = supFetchData.value.ledgerAccount.id;
        }
      }
    }

    if (cfg.doPostings && supId && supLedger) {
      const putRes = await fetch(`${BASE}/ledger/voucher/${voucherId}?sendToLedger=false`, {
        method: "PUT", headers: H,
        body: JSON.stringify({
          version: voucherVersion,
          postings: [
            { row: 1, account: { id: expAcctId }, description: DESCRIPTION, vatType: { id: 1 }, amount: NET, amountCurrency: NET, amountGross: GROSS, amountGrossCurrency: GROSS },
            { row: 2, account: { id: supLedger }, supplier: { id: supId }, description: DESCRIPTION, amount: -GROSS, amountCurrency: -GROSS, amountGross: -GROSS, amountGrossCurrency: -GROSS, invoiceNumber: INVOICE_NR, termOfPayment: DATE },
          ],
        }),
      });
      const putData = await putRes.json();
      console.log("  PUT postings:", putRes.status);
      voucherVersion = putData.value?.version || voucherVersion;
    }

    if (cfg.doBook) {
      const bookRes = await fetch(`${BASE}/ledger/voucher/${voucherId}?sendToLedger=true`, {
        method: "PUT", headers: H,
        body: JSON.stringify({ version: voucherVersion }),
      });
      const bookData = await bookRes.json();
      console.log("  Book:", bookRes.status, "number:", bookData.value?.number);
    }
  } else {
    // Direct POST approach
    const vtRes = await fetch(`${BASE}/ledger/voucherType?name=Leverandørfaktura&fields=*`, { headers: H });
    const vtId = (await vtRes.json()).values[0].id;

    const vRes = await fetch(`${BASE}/ledger/voucher`, {
      method: "POST", headers: H,
      body: JSON.stringify({
        date: DATE,
        description: DESCRIPTION,
        voucherType: { id: vtId },
        postings: [
          { row: 1, date: DATE, description: DESCRIPTION, account: { id: expAcctId }, vatType: { id: 1 }, currency: { id: 1 }, amount: NET, amountCurrency: NET, amountGross: GROSS, amountGrossCurrency: GROSS },
          { row: 2, date: DATE, description: DESCRIPTION, account: { id: supLedger }, supplier: { id: supId }, currency: { id: 1 }, amount: -GROSS, amountCurrency: -GROSS, amountGross: -GROSS, amountGrossCurrency: -GROSS, invoiceNumber: INVOICE_NR, termOfPayment: DATE },
        ],
      }),
    });
    const vData = await vRes.json();
    voucherId = vData.value?.id;
    console.log("  Direct POST:", vRes.status, "number:", vData.value?.number, "vendorInvoiceNumber:", vData.value?.vendorInvoiceNumber);
  }

  // ============================================================
  // READ BACK: All scorer-relevant state
  // ============================================================
  console.log("\n  --- FINAL STATE ---");

  // 1. Supplier
  if (supId) {
    const supRes = await fetch(`${BASE}/supplier/${supId}?fields=id,name,organizationNumber,supplierNumber,isSupplier,postalAddress(*),physicalAddress(*),bankAccountPresentation(*)`, { headers: H });
    const supData = await supRes.json();
    const s = supData.value;
    console.log(`  SUPPLIER: id=${s.id} name="${s.name}" org=${s.organizationNumber} num=${s.supplierNumber} isSup=${s.isSupplier}`);
    console.log(`    postalAddress: ${JSON.stringify(s.postalAddress)?.substring(0,100)}`);
    console.log(`    physicalAddress: ${JSON.stringify(s.physicalAddress)?.substring(0,100)}`);
  }

  // 2. SupplierInvoice
  if (voucherId) {
    const siRes = await fetch(`${BASE}/supplierInvoice?invoiceDateFrom=2026-01-01&invoiceDateTo=2026-12-31&voucherId=${voucherId}&fields=*,supplier(id,name,organizationNumber)`, { headers: H });
    const siData = await siRes.json();
    console.log(`  SUPPLIER_INVOICE: count=${siData.fullResultSize}`);
    if (siData.values?.length) {
      const si = siData.values[0];
      console.log(`    id=${si.id} invoiceNumber="${si.invoiceNumber}" invoiceDate=${si.invoiceDate}`);
      console.log(`    amount=${si.amount} amountCurrency=${si.amountCurrency} amountExcludingVat=${si.amountExcludingVat}`);
      console.log(`    outstandingAmount=${si.outstandingAmount} isCreditNote=${si.isCreditNote}`);
      console.log(`    supplier: id=${si.supplier?.id} name="${si.supplier?.name}" org=${si.supplier?.organizationNumber}`);
      console.log(`    supplierMatchesCreated: ${si.supplier?.id === supId}`);
    }

    // 3. Voucher + postings
    const vRes = await fetch(`${BASE}/ledger/voucher/${voucherId}?fields=*,postings(*,account(number,name),vatType(number,name,percentage),supplier(id,name))`, { headers: H });
    const vData = await vRes.json();
    const v = vData.value;
    console.log(`  VOUCHER: id=${v.id} number=${v.number} description="${v.description}" vendorInvoiceNumber="${v.vendorInvoiceNumber || ''}"`);
    console.log(`    voucherType: ${v.voucherType?.id}`);
    for (const p of (v.postings || [])) {
      console.log(`    POST: row=${p.row} acct=${p.account?.number}(${p.account?.name?.substring(0,15)}) amt=${p.amount} gross=${p.amountGross} vat=${p.vatType?.number}/${p.vatType?.percentage}% sup=${p.supplier?.name || '-'} inv=${p.invoiceNumber || '-'} sysGen=${p.systemGenerated}`);
    }
  }

  // Separate with blank line
  console.log("");
}
