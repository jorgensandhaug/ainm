const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "4J3QV8b7rQdV1UDWtr4lVRphz-w6tTRKUuDvtUWg85Y";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };

// PDF data
const supplier = { name: "Nordlicht GmbH", orgNr: "871162069" };
const invoice = {
  number: "INV-2026-7611",
  date: "2026-04-06",
  dueDate: "2026-05-06",
  description: "Nettverkstjenester",
  net: 35650,
  vat: 8912,
  gross: 44562,
  expenseAccount: 6300,
};
const address = { addressLine1: "Nygata 53", postalCode: "9008", city: "Tromsø" };
const bankAccount = "28390913577";

async function run() {
  // Step 1: POST /supplier
  console.log("=== Step 1: POST /supplier ===");
  const supplierRes = await fetch(`${BASE}/supplier`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({
      name: supplier.name,
      organizationNumber: supplier.orgNr,
      postalAddress: address,
      bankAccountPresentation: [{ bban: bankAccount }],
    }),
  });
  const supplierData = await supplierRes.json();
  console.log("Status:", supplierRes.status);
  console.log("Supplier:", JSON.stringify(supplierData, null, 2));
  if (!supplierRes.ok) throw new Error("Supplier creation failed");
  const supplierId = supplierData.value.id;
  const supplierLedgerAccountId = supplierData.value.ledgerAccount.id;
  console.log("supplierId:", supplierId, "ledgerAccountId:", supplierLedgerAccountId);

  // Step 2: GET /ledger/account
  console.log("\n=== Step 2: GET /ledger/account ===");
  const accountRes = await fetch(
    `${BASE}/ledger/account?number=${invoice.expenseAccount}&isApplicableForSupplierInvoice=true&fields=*`,
    { headers: H }
  );
  const accountData = await accountRes.json();
  console.log("Status:", accountRes.status);
  if (!accountRes.ok) throw new Error("Account lookup failed");
  const expenseAccountId = accountData.values[0].id;
  console.log("expenseAccountId:", expenseAccountId);

  // Step 3: POST /ledger/voucher/importDocument (EHF XML)
  console.log("\n=== Step 3: POST /ledger/voucher/importDocument ===");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${invoice.number}</cbc:ID>
  <cbc:IssueDate>${invoice.date}</cbc:IssueDate>
  <cbc:DueDate>${invoice.dueDate}</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>NOK</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0192">${supplier.orgNr}</cbc:EndpointID>
      <cac:PartyName><cbc:Name>${supplier.name}</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>Nygata 53</cbc:StreetName>
        <cbc:CityName>Tromsø</cbc:CityName>
        <cbc:PostalZone>9008</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>NO${supplier.orgNr}MVA</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity><cbc:RegistrationName>${supplier.name}</cbc:RegistrationName><cbc:CompanyID schemeID="0192">${supplier.orgNr}</cbc:CompanyID></cac:PartyLegalEntity>
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
    <cbc:TaxAmount currencyID="NOK">${invoice.vat}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="NOK">${invoice.net}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="NOK">${invoice.vat}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>25</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="NOK">${invoice.net}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="NOK">${invoice.net}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="NOK">${invoice.gross}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="NOK">${invoice.gross}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  <cac:InvoiceLine>
    <cbc:ID>1</cbc:ID>
    <cbc:InvoicedQuantity unitCode="EA">1</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="NOK">${invoice.net}</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Name>${invoice.description}</cbc:Name>
      <cac:ClassifiedTaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>25</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="NOK">${invoice.net}</cbc:PriceAmount></cac:Price>
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
  console.log("Status:", importRes.status);
  console.log("Import:", JSON.stringify(importData, null, 2));
  if (!importRes.ok) throw new Error("Import failed");
  const voucherId = importData.values[0].id;
  const voucherVersion = importData.values[0].version;
  console.log("voucherId:", voucherId, "version:", voucherVersion);

  // Step 4: PUT /ledger/voucher/{id}?sendToLedger=false (postings)
  console.log("\n=== Step 4: PUT /ledger/voucher sendToLedger=false ===");
  const putBody = {
    version: voucherVersion,
    postings: [
      {
        row: 1,
        account: { id: expenseAccountId },
        description: invoice.description,
        vatType: { id: 1 },
        amount: invoice.net,
        amountCurrency: invoice.net,
        amountGross: invoice.gross,
        amountGrossCurrency: invoice.gross,
      },
      {
        row: 2,
        account: { id: supplierLedgerAccountId },
        supplier: { id: supplierId },
        description: invoice.description,
        amount: -invoice.gross,
        amountCurrency: -invoice.gross,
        amountGross: -invoice.gross,
        amountGrossCurrency: -invoice.gross,
        invoiceNumber: invoice.number,
        termOfPayment: invoice.dueDate,
      },
    ],
  };
  const putRes = await fetch(`${BASE}/ledger/voucher/${voucherId}?sendToLedger=false`, {
    method: "PUT",
    headers: H,
    body: JSON.stringify(putBody),
  });
  const putData = await putRes.json();
  console.log("Status:", putRes.status);
  console.log("PUT postings:", JSON.stringify(putData, null, 2));
  if (!putRes.ok) throw new Error("PUT postings failed");
  const newVersion = putData.value.version;
  console.log("newVersion:", newVersion);

  // Step 5: PUT /ledger/voucher/{id}?sendToLedger=true (book)
  console.log("\n=== Step 5: PUT /ledger/voucher sendToLedger=true ===");
  const bookRes = await fetch(`${BASE}/ledger/voucher/${voucherId}?sendToLedger=true`, {
    method: "PUT",
    headers: H,
    body: JSON.stringify({ version: newVersion }),
  });
  const bookData = await bookRes.json();
  console.log("Status:", bookRes.status);
  console.log("Booking:", JSON.stringify(bookData, null, 2));
  if (!bookRes.ok) throw new Error("Booking failed");
  console.log("Voucher number:", bookData.value.number, "- BOOKED:", bookData.value.number > 0);
}

run().catch((e) => { console.error(e); process.exit(1); });
