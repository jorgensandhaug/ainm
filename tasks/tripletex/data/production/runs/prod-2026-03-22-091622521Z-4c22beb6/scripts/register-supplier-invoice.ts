const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "iJLpUWAdgcmahh7sQFtFYuUfsJ5rXdS-XQ2UxAJ8wrg";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

// PDF data
const supplierName = "Stormberg AS";
const orgNumber = "979784783";
const street = "Fjordveien 90";
const postalCode = "6003";
const city = "Ålesund";
const invoiceNumber = "INV-2026-2148";
const invoiceDate = "2026-04-29";
const dueDate = "2026-05-29";
const description = "IT-konsulenttjenester";
const net = 22950;
const vatAmount = 5737;
const gross = 28687;
const expenseAccount = 6300;
const bankAccount = "11288015858";

async function run() {
  // Step 1: Create supplier
  const supRes = await fetch(`${BASE}/supplier`, {
    method: "POST", headers: H,
    body: JSON.stringify({
      name: supplierName,
      organizationNumber: orgNumber,
      postalAddress: {
        addressLine1: street, postalCode, city,
        country: { id: 161 }
      },
      physicalAddress: {
        addressLine1: street, postalCode, city,
        country: { id: 161 }
      },
      bankAccountPresentation: [{ bban: bankAccount }]
    })
  });
  const sup = await supRes.json();
  console.log("Step 1 - Supplier:", supRes.status, JSON.stringify(sup));
  const supplierId = sup.value.id;
  const acct2400Id = sup.value.ledgerAccount.id;

  // Step 2: Get expense account ID
  const acctRes = await fetch(`${BASE}/ledger/account?number=${expenseAccount}&isApplicableForSupplierInvoice=true&fields=id,number`, {
    headers: { Authorization: AUTH }
  });
  const acct = await acctRes.json();
  console.log("Step 2 - Account:", acctRes.status, JSON.stringify(acct));
  const expenseAcctId = acct.values[0].id;

  // Step 3: importDocument with EHF XML
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
  <cac:AccountingSupplierParty><cac:Party>
    <cbc:EndpointID schemeID="0192">${orgNumber}</cbc:EndpointID>
    <cac:PartyName><cbc:Name>${supplierName}</cbc:Name></cac:PartyName>
    <cac:PostalAddress>
      <cbc:StreetName>${street}</cbc:StreetName><cbc:CityName>${city}</cbc:CityName>
      <cbc:PostalZone>${postalCode}</cbc:PostalZone>
      <cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country>
    </cac:PostalAddress>
    <cac:PartyTaxScheme>
      <cbc:CompanyID>NO${orgNumber}MVA</cbc:CompanyID>
      <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
    </cac:PartyTaxScheme>
    <cac:PartyLegalEntity>
      <cbc:RegistrationName>${supplierName}</cbc:RegistrationName>
      <cbc:CompanyID schemeID="0192">${orgNumber}</cbc:CompanyID>
    </cac:PartyLegalEntity>
  </cac:Party></cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty><cac:Party>
    <cbc:EndpointID schemeID="0192">999999999</cbc:EndpointID>
    <cac:PartyName><cbc:Name>Ditt firma</cbc:Name></cac:PartyName>
    <cac:PostalAddress><cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
    <cac:PartyLegalEntity><cbc:RegistrationName>Ditt firma</cbc:RegistrationName>
      <cbc:CompanyID schemeID="0192">999999999</cbc:CompanyID></cac:PartyLegalEntity>
  </cac:Party></cac:AccountingCustomerParty>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="NOK">${vatAmount}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="NOK">${net}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="NOK">${vatAmount}</cbc:TaxAmount>
      <cac:TaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>25</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="NOK">${net}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="NOK">${net}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="NOK">${gross}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="NOK">${gross}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  <cac:InvoiceLine><cbc:ID>1</cbc:ID>
    <cbc:InvoicedQuantity unitCode="EA">1</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="NOK">${net}</cbc:LineExtensionAmount>
    <cac:Item><cbc:Name>${description}</cbc:Name>
      <cac:ClassifiedTaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>25</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="NOK">${net}</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>
</Invoice>`;

  const formData = new FormData();
  formData.append("file", new Blob([xml], { type: "text/xml" }), `${invoiceNumber}.xml`);
  const impRes = await fetch(`${BASE}/ledger/voucher/importDocument`, {
    method: "POST", headers: { Authorization: AUTH }, body: formData,
  });
  const imp = await impRes.json();
  console.log("Step 3 - importDocument:", impRes.status, JSON.stringify(imp));
  const voucherId = imp.values[0].id;
  const version1 = imp.values[0].version;

  // Step 4: Set postings (sendToLedger=false)
  const postingsRes = await fetch(`${BASE}/ledger/voucher/${voucherId}?sendToLedger=false`, {
    method: "PUT", headers: H,
    body: JSON.stringify({
      version: version1,
      postings: [
        {
          row: 1, account: { id: expenseAcctId },
          description, vatType: { id: 1 },
          amount: net, amountCurrency: net,
          amountGross: gross, amountGrossCurrency: gross
        },
        {
          row: 2, account: { id: acct2400Id },
          supplier: { id: supplierId }, description,
          amount: -gross, amountCurrency: -gross,
          amountGross: -gross, amountGrossCurrency: -gross,
          invoiceNumber, termOfPayment: dueDate
        }
      ]
    })
  });
  const postings = await postingsRes.json();
  console.log("Step 4 - Postings:", postingsRes.status, JSON.stringify(postings));
  const version2 = postings.value.version;

  // Step 5: Book (sendToLedger=true)
  const bookRes = await fetch(`${BASE}/ledger/voucher/${voucherId}?sendToLedger=true`, {
    method: "PUT", headers: H,
    body: JSON.stringify({
      version: version2,
      voucherType: { name: "Leverandørfaktura" }
    })
  });
  const book = await bookRes.json();
  console.log("Step 5 - Book:", bookRes.status, JSON.stringify(book));
}

run().catch(e => { console.error(e); process.exit(1); });
