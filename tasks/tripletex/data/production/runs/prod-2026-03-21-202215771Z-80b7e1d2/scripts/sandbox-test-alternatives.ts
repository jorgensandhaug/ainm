const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };

// Test 1: Can we skip GET /ledger/account by using account number in PUT postings?
// Already proven to fail, but let's re-confirm with a fresh attempt.

// Test 2: Can we combine postings + sendToLedger=true in a single PUT?
// Already proven to fail, but re-confirm.

// Test 3: Does importDocument auto-create a supplier from the XML org number?
// If yes, we could skip POST /supplier.

async function testImportWithoutPreCreatedSupplier() {
  console.log("=== Test 3: Import XML without pre-creating supplier ===");
  const orgNr = "952485174"; // random valid org nr
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>INV-SANDBOX-TEST-NOSUP</cbc:ID>
  <cbc:IssueDate>2026-03-21</cbc:IssueDate>
  <cbc:DueDate>2026-04-21</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>NOK</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0192">${orgNr}</cbc:EndpointID>
      <cac:PartyName><cbc:Name>TestAutoSupplier AS</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>Testgata 1</cbc:StreetName>
        <cbc:CityName>Oslo</cbc:CityName>
        <cbc:PostalZone>0001</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>NO${orgNr}MVA</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity><cbc:RegistrationName>TestAutoSupplier AS</cbc:RegistrationName><cbc:CompanyID schemeID="0192">${orgNr}</cbc:CompanyID></cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0192">999999999</cbc:EndpointID>
      <cac:PartyName><cbc:Name>Ditt firma</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>Testveien 1</cbc:StreetName>
        <cbc:CityName>Oslo</cbc:CityName>
        <cbc:PostalZone>0001</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyLegalEntity><cbc:RegistrationName>Ditt firma</cbc:RegistrationName><cbc:CompanyID schemeID="0192">999999999</cbc:CompanyID></cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="NOK">5000</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="NOK">20000</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="NOK">5000</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>25</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="NOK">20000</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="NOK">20000</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="NOK">25000</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="NOK">25000</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  <cac:InvoiceLine>
    <cbc:ID>1</cbc:ID>
    <cbc:InvoicedQuantity unitCode="EA">1</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="NOK">20000</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Name>Testtjenester</cbc:Name>
      <cac:ClassifiedTaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>25</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="NOK">20000</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>
</Invoice>`;

  const formData = new FormData();
  formData.append("file", new Blob([xml], { type: "application/xml" }), "invoice.xml");

  const importRes = await fetch(`${BASE}/ledger/voucher/importDocument`, {
    method: "POST",
    headers: { Authorization: AUTH },
    body: formData,
  });
  const importData = await importRes.json();
  console.log("Import status:", importRes.status);

  if (!importRes.ok) {
    console.log("Import failed (expected if supplier must pre-exist):", JSON.stringify(importData));
    return null;
  }

  const voucherId = importData.values[0].id;
  console.log("Import succeeded! voucherId:", voucherId);

  // Check if a supplier was auto-created
  const supSearch = await fetch(`${BASE}/supplier?organizationNumber=${orgNr}&fields=*`, { headers: H });
  const supData = await supSearch.json();
  console.log("Supplier search for", orgNr, ":", JSON.stringify(supData.values?.map((s: any) => ({id: s.id, name: s.name, ledgerAccountId: s.ledgerAccount?.id}))));

  if (supData.values?.length > 0) {
    console.log("FINDING: importDocument AUTO-CREATES the supplier!");
    const autoSupplierId = supData.values[0].id;
    const autoLedgerAccountId = supData.values[0].ledgerAccount?.id;
    console.log("Auto-created supplierId:", autoSupplierId, "ledgerAccountId:", autoLedgerAccountId);

    // But does the auto-created supplier have address/bank? Probably not.
    console.log("Address:", JSON.stringify(supData.values[0].postalAddress));
    console.log("Bank:", JSON.stringify(supData.values[0].bankAccountPresentation));

    return { voucherId, supplierId: autoSupplierId, ledgerAccountId: autoLedgerAccountId };
  } else {
    console.log("FINDING: importDocument does NOT auto-create supplier");
    return { voucherId, supplierId: null, ledgerAccountId: null };
  }
}

testImportWithoutPreCreatedSupplier().catch(e => { console.error(e); process.exit(1); });
