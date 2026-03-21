const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };

// Use the production org number 871162069 (Nordlicht GmbH) - valid mod11, unlikely in sandbox
const orgNr = "871162069";

async function run() {
  // First check if this supplier exists in sandbox
  console.log("=== Check if supplier exists in sandbox ===");
  const searchRes = await fetch(`${BASE}/supplier?organizationNumber=${orgNr}&fields=*`, { headers: H });
  const searchData = await searchRes.json();
  console.log("Existing suppliers with org", orgNr, ":", searchData.values?.length || 0);

  if (searchData.values?.length > 0) {
    console.log("Supplier already exists, using different org nr would be needed");
    // Try with a different org number - 987654325
    // mod11: 9×3+8×2+7×7+6×6+5×5+4×4+3×3+2×2 = 27+16+49+36+25+16+9+4 = 182, 182%11=6, check=5
    console.log("Testing with 987654325 instead");
  }

  // Try import without pre-creating supplier
  const testOrgNr = searchData.values?.length > 0 ? "987654325" : orgNr;
  console.log("\n=== Import XML without pre-creating supplier (org:", testOrgNr, ") ===");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>INV-SANDBOX-AUTOSUP</cbc:ID>
  <cbc:IssueDate>2026-03-21</cbc:IssueDate>
  <cbc:DueDate>2026-04-21</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>NOK</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0192">${testOrgNr}</cbc:EndpointID>
      <cac:PartyName><cbc:Name>AutoSupplier Test AS</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>Testgata 1</cbc:StreetName>
        <cbc:CityName>Oslo</cbc:CityName>
        <cbc:PostalZone>0001</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>NO${testOrgNr}MVA</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity><cbc:RegistrationName>AutoSupplier Test AS</cbc:RegistrationName><cbc:CompanyID schemeID="0192">${testOrgNr}</cbc:CompanyID></cac:PartyLegalEntity>
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
    console.log("Import FAILED:", JSON.stringify(importData, null, 2));
    console.log("\nFINDING: importDocument requires supplier to pre-exist OR auto-creates it.");
    return;
  }

  console.log("Import succeeded! Voucher:", importData.values[0].id);

  // Check if supplier was auto-created
  const supSearch2 = await fetch(`${BASE}/supplier?organizationNumber=${testOrgNr}&fields=*`, { headers: H });
  const supData2 = await supSearch2.json();
  if (supData2.values?.length > 0) {
    const sup = supData2.values[0];
    console.log("\nFINDING: importDocument AUTO-CREATES supplier!");
    console.log("Supplier id:", sup.id);
    console.log("Supplier name:", sup.name);
    console.log("Supplier ledgerAccount.id:", sup.ledgerAccount?.id);
    console.log("Supplier postalAddress:", JSON.stringify(sup.postalAddress));
    console.log("Supplier bankAccountPresentation:", JSON.stringify(sup.bankAccountPresentation));

    // If auto-created, can we do 4 calls?
    // importDocument (creates voucher + supplier) → GET account → PUT postings → PUT book
    // BUT: we need supplier.id and supplier.ledgerAccount.id for the postings PUT
    // So we'd need a GET /supplier to discover the auto-created supplier ids
    // That's still 5 calls, just in a different order
    // Unless the voucher response already contains supplier info...
    console.log("\nVoucher postings (might contain supplier ref):");
    const voucherId = importData.values[0].id;
    const vRes = await fetch(`${BASE}/ledger/voucher/${voucherId}?fields=*`, { headers: H });
    const vData = await vRes.json();
    console.log("Voucher postings count:", vData.value?.postings?.length);
    vData.value?.postings?.forEach((p: any, i: number) => {
      console.log(`Posting ${i}: account=${p.account?.id}, supplier=${p.supplier?.id}, amount=${p.amount}`);
    });
  } else {
    console.log("\nFINDING: importDocument does NOT auto-create supplier. Supplier must be pre-created.");
  }
}

run().catch(e => { console.error(e); process.exit(1); });
