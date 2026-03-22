const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = `Basic ${btoa(`0:${TOKEN}`)}`;

async function run() {
  // Use unique 9-digit org number
  const ts = Date.now().toString().slice(-5);
  const supplierName = `Approve Test ${ts}`;
  const orgNumber = `9990${ts}`;  // 9 digits
  const street = "Testgate 1";
  const postalCode = "0100";
  const city = "Oslo";
  const invoiceNumber = `APPR-${ts}`;
  const invoiceDate = "2026-03-01";
  const dueDate = "2026-03-31";
  const description = "Test approval";
  const net = 10000;
  const vatAmount = 2500;
  const gross = 12500;
  const expenseAccount = 6540;
  const bankAccount = "22757315878";  // valid Norwegian BBAN

  // Step 1: POST supplier (no bankAccountPresentation to avoid BIC validation)
  console.log("=== Step 1: POST supplier ===");
  const suppRes = await fetch(`${BASE}/supplier`, {
    method: "POST",
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
    body: JSON.stringify({
      name: supplierName, organizationNumber: orgNumber,
      postalAddress: { addressLine1: street, postalCode, city, country: { id: 161 } },
      physicalAddress: { addressLine1: street, postalCode, city, country: { id: 161 } },
    })
  });
  const suppData = await suppRes.json();
  if (suppRes.status !== 201) {
    console.log("Supplier create failed:", suppRes.status, JSON.stringify(suppData));
    return;
  }
  const supplierId = suppData.value.id;
  const ledgerAccountId = suppData.value.ledgerAccount.id;
  console.log(`OK: supplierId=${supplierId}, ledgerAccountId=${ledgerAccountId}`);

  // Step 2: GET expense account
  const acctRes = await fetch(`${BASE}/ledger/account?number=${expenseAccount}&isApplicableForSupplierInvoice=true&fields=id,number`, {
    headers: { Authorization: AUTH }
  });
  const acctData = await acctRes.json();
  const expenseAccountId = acctData.values[0].id;

  // Step 3: importDocument
  console.log("\n=== Step 3: importDocument ===");
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
  <cac:PaymentMeans>
    <cbc:PaymentMeansCode>30</cbc:PaymentMeansCode>
    <cbc:PaymentID>${invoiceNumber}</cbc:PaymentID>
    <cac:PayeeFinancialAccount>
      <cbc:ID>${bankAccount}</cbc:ID>
    </cac:PayeeFinancialAccount>
  </cac:PaymentMeans>
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
  const fd = new FormData();
  fd.append("file", new Blob([xml], { type: "text/xml" }), `${invoiceNumber}.xml`);
  const impRes = await fetch(`${BASE}/ledger/voucher/importDocument`, {
    method: "POST", headers: { Authorization: AUTH }, body: fd,
  });
  const imp = await impRes.json();
  console.log("importDocument status:", impRes.status);
  const voucherId = imp.values[0].id;
  const version1 = imp.values[0].version;

  // Find SI
  const siRes = await fetch(`${BASE}/supplierInvoice?invoiceDateFrom=2025-01-01&invoiceDateTo=2027-12-31&invoiceNumber=${invoiceNumber}&fields=*`, {
    headers: { Authorization: AUTH }
  });
  const siData = await siRes.json();
  const siId = siData.values?.[0]?.id;
  console.log(`SI id=${siId}`);
  console.log("SI approvalListElements:", JSON.stringify(siData.values?.[0]?.approvalListElements));

  // Step 4: PUT postings
  console.log("\n=== Step 4: PUT postings ===");
  const putRes = await fetch(`${BASE}/ledger/voucher/${voucherId}?sendToLedger=false`, {
    method: "PUT",
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
    body: JSON.stringify({
      version: version1,
      postings: [
        { row: 1, account: { id: expenseAccountId }, description, vatType: { id: 1 },
          amount: net, amountCurrency: net, amountGross: gross, amountGrossCurrency: gross },
        { row: 2, account: { id: ledgerAccountId }, supplier: { id: supplierId }, description,
          amount: -gross, amountCurrency: -gross, amountGross: -gross, amountGrossCurrency: -gross,
          invoiceNumber, termOfPayment: dueDate }
      ]
    })
  });
  const putData = await putRes.json();
  console.log("PUT postings status:", putRes.status);
  const version2 = putData.value.version;

  // Try APPROVE before book
  if (siId) {
    console.log("\n=== Step 4b: Approve SI ===");
    const approveRes = await fetch(`${BASE}/supplierInvoice/${siId}/:approve`, {
      method: "PUT",
      headers: { Authorization: AUTH }
    });
    console.log("Approve status:", approveRes.status);
    const approveText = await approveRes.text();
    console.log("Approve response:", approveText.substring(0, 500));
  }

  // Get fresh version
  const freshV = await fetch(`${BASE}/ledger/voucher/${voucherId}?fields=id,version`, {
    headers: { Authorization: AUTH }
  });
  const freshVData = await freshV.json();
  const latestVersion = freshVData.value.version;

  // Book
  console.log("\n=== Step 5: PUT book ===");
  const bookRes = await fetch(`${BASE}/ledger/voucher/${voucherId}?sendToLedger=true`, {
    method: "PUT",
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
    body: JSON.stringify({
      version: latestVersion,
      voucherType: { name: "Leverandørfaktura" }
    })
  });
  console.log("Book status:", bookRes.status);
  const bookData = await bookRes.json();
  if (bookRes.status !== 200) console.log("Book error:", JSON.stringify(bookData));

  // Final verification
  console.log("\n=== Final SI ===");
  const siFinal = await fetch(`${BASE}/supplierInvoice/${siId}?fields=*`, {
    headers: { Authorization: AUTH }
  });
  const siFinalData = await siFinal.json();
  console.log("Final SI:", JSON.stringify(siFinalData.value, null, 2));

  // Check approval elements
  if (siFinalData.value?.approvalListElements?.length) {
    console.log("\n=== Approval Elements ===");
    for (const elem of siFinalData.value.approvalListElements) {
      const elemRes = await fetch(`${BASE}/voucherApprovalListElement/${elem.id}?fields=*`, {
        headers: { Authorization: AUTH }
      });
      console.log("Element:", JSON.stringify((await elemRes.json()).value, null, 2));
    }
  }

  // Also try: what if we upload the original PDF as the voucher document?
  console.log("\n=== Upload original PDF as attachment ===");
  const pdfContent = new Uint8Array([37,80,68,70]); // minimal PDF header
  const pdfFd = new FormData();
  pdfFd.append("file", new Blob([pdfContent], { type: "application/pdf" }), "original-invoice.pdf");
  const uploadRes = await fetch(`${BASE}/ledger/voucher/${voucherId}/attachment`, {
    method: "POST", headers: { Authorization: AUTH }, body: pdfFd,
  });
  console.log("Upload attachment status:", uploadRes.status);
  if (uploadRes.status === 201) {
    const uploadData = await uploadRes.json();
    console.log("Upload response document/attachment:", JSON.stringify({
      document: uploadData.value?.document,
      attachment: uploadData.value?.attachment
    }));
  } else {
    console.log("Upload failed:", await uploadRes.text());
  }
}

run().catch(e => { console.error("FATAL:", e); process.exit(1); });
