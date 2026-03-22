// Test: does importDocument auto-create a supplier from XML when no matching supplier exists?
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };

// Use a valid mod11 org number: 123456785
// 1*3+2*2+3*7+4*6+5*5+6*4+7*3+8*2 = 138, 138%11=6, 11-6=5 ✓
const orgNumber = "123456785";
const supplierName = "AutoCreate Test AS";
const invoiceNumber = "INV-AUTOCREATE-001";
const gross = 10000;
const net = 8000;
const vat = 2000;

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${invoiceNumber}</cbc:ID>
  <cbc:IssueDate>2026-03-22</cbc:IssueDate>
  <cbc:DueDate>2026-04-21</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>NOK</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0192">${orgNumber}</cbc:EndpointID>
      <cac:PartyName><cbc:Name>${supplierName}</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>Gatan 5</cbc:StreetName>
        <cbc:CityName>Oslo</cbc:CityName>
        <cbc:PostalZone>0001</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>NO${orgNumber}MVA</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity><cbc:RegistrationName>${supplierName}</cbc:RegistrationName><cbc:CompanyID schemeID="0192">${orgNumber}</cbc:CompanyID></cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0192">987654325</cbc:EndpointID>
      <cac:PartyName><cbc:Name>Buyer AS</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>Veien 2</cbc:StreetName>
        <cbc:CityName>Bergen</cbc:CityName>
        <cbc:PostalZone>5003</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyLegalEntity><cbc:RegistrationName>Buyer AS</cbc:RegistrationName><cbc:CompanyID schemeID="0192">987654325</cbc:CompanyID></cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:PaymentMeans>
    <cbc:PaymentMeansCode>30</cbc:PaymentMeansCode>
    <cbc:PaymentID>${invoiceNumber}</cbc:PaymentID>
    <cac:PayeeFinancialAccount><cbc:ID>12345678903</cbc:ID></cac:PayeeFinancialAccount>
  </cac:PaymentMeans>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="NOK">${vat}.00</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="NOK">${net}.00</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="NOK">${vat}.00</cbc:TaxAmount>
      <cac:TaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>25</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="NOK">${net}.00</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="NOK">${net}.00</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="NOK">${gross}.00</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="NOK">${gross}.00</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  <cac:InvoiceLine>
    <cbc:ID>1</cbc:ID>
    <cbc:InvoicedQuantity unitCode="EA">1</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="NOK">${net}.00</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Name>test items</cbc:Name>
      <cac:ClassifiedTaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>25</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="NOK">${net}.00</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>
</Invoice>`;

async function main() {
  // First check: does supplier with this org number exist?
  const checkRes = await fetch(`${BASE}/supplier?organizationNumber=${orgNumber}&fields=id,name,organizationNumber`, {
    headers: { Authorization: AUTH },
  });
  const checkJson = await checkRes.json();
  console.log("Supplier check (before):", checkJson.count, "matches");

  // importDocument WITHOUT creating supplier first
  const formData = new FormData();
  formData.append("file", new Blob([xml], { type: "application/xml" }), `${invoiceNumber}.xml`);
  const impRes = await fetch(`${BASE}/ledger/voucher/importDocument`, {
    method: "POST",
    headers: { Authorization: AUTH },
    body: formData,
  });
  const impJson = await impRes.json();
  console.log("importDocument →", impRes.status);

  if (!impRes.ok) {
    console.log("ERROR:", JSON.stringify(impJson, null, 2));
    return;
  }

  const voucherId = impJson.values[0].id;
  console.log("Voucher:", voucherId);

  // Check SI
  const siRes = await fetch(`${BASE}/supplierInvoice?voucherId=${voucherId}&invoiceDateFrom=2026-01-01&invoiceDateTo=2026-12-31&fields=*`, {
    headers: { Authorization: AUTH },
  });
  const siJson = await siRes.json();
  console.log("SI count:", siJson.count);
  if (siJson.count > 0) {
    const si = siJson.values[0];
    console.log("SI supplier id:", si.supplier?.id);
    console.log("SI amount:", si.amount, "amountExcludingVat:", si.amountExcludingVat);
    console.log("SI invoiceNumber:", si.invoiceNumber);
    console.log("SI kidOrReceiverReference:", si.kidOrReceiverReference);

    // Check if supplier was auto-created
    if (si.supplier?.id) {
      const supRes = await fetch(`${BASE}/supplier/${si.supplier.id}?fields=*`, {
        headers: { Authorization: AUTH },
      });
      const supJson = await supRes.json();
      console.log("\n=== AUTO-CREATED SUPPLIER ===");
      console.log("id:", supJson.value.id);
      console.log("name:", supJson.value.name);
      console.log("organizationNumber:", supJson.value.organizationNumber);
      console.log("ledgerAccount:", JSON.stringify(supJson.value.ledgerAccount));
      console.log("postalAddress:", JSON.stringify(supJson.value.postalAddress));
      console.log("physicalAddress:", JSON.stringify(supJson.value.physicalAddress));
      console.log("bankAccountPresentation:", JSON.stringify(supJson.value.bankAccountPresentation));

      // Check the address details
      if (supJson.value.postalAddress?.id) {
        const addrRes = await fetch(`${BASE}/address/${supJson.value.postalAddress.id}?fields=*`, {
          headers: { Authorization: AUTH },
        });
        const addrJson = await addrRes.json();
        console.log("\nPostal address:", JSON.stringify(addrJson.value, null, 2));
      }
      if (supJson.value.physicalAddress?.id) {
        const addrRes = await fetch(`${BASE}/address/${supJson.value.physicalAddress.id}?fields=*`, {
          headers: { Authorization: AUTH },
        });
        const addrJson = await addrRes.json();
        console.log("Physical address:", JSON.stringify(addrJson.value, null, 2));
      }
    }
  }

  // Check supplier list again
  const checkAfter = await fetch(`${BASE}/supplier?organizationNumber=${orgNumber}&fields=id,name,organizationNumber`, {
    headers: { Authorization: AUTH },
  });
  const checkAfterJson = await checkAfter.json();
  console.log("\nSupplier check (after):", checkAfterJson.count, "matches");
  if (checkAfterJson.count > 0) {
    for (const s of checkAfterJson.values) {
      console.log("  Supplier:", s.id, s.name, s.organizationNumber);
    }
  }
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
