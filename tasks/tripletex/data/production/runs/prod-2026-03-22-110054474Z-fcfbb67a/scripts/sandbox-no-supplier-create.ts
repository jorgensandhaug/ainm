// Test: can importDocument auto-create the supplier from XML, skipping POST /supplier?
// This would save 1 write call.
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };

// Use a different org number that doesn't exist yet
const supplierName = "NoCreate Test AB";
const orgNumber = "979442957"; // different from any existing supplier
const invoiceNumber = "INV-NOCREATE-001";
const gross = 10000;
const net = 8000;
const vat = 2000;
const invoiceDate = "2026-03-22";
const dueDate = "2026-04-21";

async function main() {
  // Skip POST /supplier — go directly to importDocument
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${invoiceNumber}</cbc:ID>
  <cbc:IssueDate>${invoiceDate}</cbc:IssueDate>
  <cbc:DueDate>${dueDate}</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>NOK</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0192">${orgNumber}</cbc:EndpointID>
      <cac:PartyName><cbc:Name>${supplierName}</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>Gatan 5</cbc:StreetName>
        <cbc:CityName>Stockholm</cbc:CityName>
        <cbc:PostalZone>10001</cbc:PostalZone>
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
      <cac:TaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>25</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:TaxCategory>
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
      <cbc:Name>Test item</cbc:Name>
      <cac:ClassifiedTaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>25</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="NOK">${net}.00</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>
</Invoice>`;

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

  // Check if supplier was auto-created
  const siRes = await fetch(`${BASE}/supplierInvoice?voucherId=${voucherId}&invoiceDateFrom=2026-01-01&invoiceDateTo=2026-12-31&fields=*`, {
    headers: { Authorization: AUTH },
  });
  const siJson = await siRes.json();
  if (siJson.count > 0) {
    const si = siJson.values[0];
    console.log("SI supplier:", JSON.stringify(si.supplier));
    console.log("SI amount:", si.amount, "amountExcludingVat:", si.amountExcludingVat);

    // Check the supplier details
    if (si.supplier?.id) {
      const supRes = await fetch(`${BASE}/supplier/${si.supplier.id}?fields=*`, {
        headers: { Authorization: AUTH },
      });
      const supJson = await supRes.json();
      console.log("\nAuto-created supplier:");
      console.log("  name:", supJson.value.name);
      console.log("  orgNumber:", supJson.value.organizationNumber);
      console.log("  ledgerAccount:", JSON.stringify(supJson.value.ledgerAccount));
      console.log("  postalAddress:", JSON.stringify(supJson.value.postalAddress));
      console.log("  physicalAddress:", JSON.stringify(supJson.value.physicalAddress));
      console.log("  bankAccountPresentation:", JSON.stringify(supJson.value.bankAccountPresentation));

      // Now proceed with booking using auto-created supplier
      const ledgerAccountId = supJson.value.ledgerAccount?.id;
      const supplierId = si.supplier.id;

      // GET expense account
      const accRes = await fetch(`${BASE}/ledger/account?number=7140&isApplicableForSupplierInvoice=true&fields=*`, {
        headers: { Authorization: AUTH },
      });
      const accJson = await accRes.json();
      const expenseAccountId = accJson.values[0].id;

      // PUT postings
      const putRes = await fetch(`${BASE}/ledger/voucher/${voucherId}?sendToLedger=false`, {
        method: "PUT",
        headers: { ...H },
        body: JSON.stringify({
          version: impJson.values[0].version,
          postings: [
            {
              row: 1, date: invoiceDate, description: "Test item",
              account: { id: expenseAccountId },
              vatType: { id: 1 },
              amount: net, amountCurrency: net,
              amountGross: gross, amountGrossCurrency: gross,
            },
            {
              row: 2, date: invoiceDate, description: "Test item",
              account: { id: ledgerAccountId },
              supplier: { id: supplierId },
              amount: -gross, amountCurrency: -gross,
              amountGross: -gross, amountGrossCurrency: -gross,
              invoiceNumber, termOfPayment: dueDate,
            },
          ],
        }),
      });
      const putJson = await putRes.json();
      console.log("\nPUT postings →", putRes.status);

      if (putRes.ok) {
        // PUT book
        const bookRes = await fetch(`${BASE}/ledger/voucher/${voucherId}?sendToLedger=true`, {
          method: "PUT",
          headers: { ...H },
          body: JSON.stringify({
            version: putJson.value.version,
            voucherType: { name: "Leverandørfaktura" },
          }),
        });
        const bookJson = await bookRes.json();
        console.log("PUT book →", bookRes.status, "number:", bookJson.value?.number);
      }
    }
  } else {
    console.log("No SI entity found — importDocument may have failed silently");
  }
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
