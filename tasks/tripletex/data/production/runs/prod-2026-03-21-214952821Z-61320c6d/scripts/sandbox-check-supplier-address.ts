// Check if our supplier has postalAddress correctly stored
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function api(path: string) {
  const url = `${BASE}${path}`;
  const r = await fetch(url, { headers: { Authorization: "Basic " + btoa("0:" + TOKEN) } });
  const text = await r.text();
  console.log(`GET ${path} → ${r.status}`);
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  return json;
}

async function main() {
  // Check our created supplier 108439395
  console.log("=== Our created supplier (full details with address expansion) ===");
  const s1 = await api("/supplier/108439395?fields=id,name,organizationNumber,postalAddress(*),physicalAddress(*),bankAccountPresentation(*)");
  console.log(JSON.stringify(s1.value, null, 2));

  // Now let's do the COMPLETE test: create a fresh supplier with address, import, check supplierInvoice
  console.log("\n\n=== COMPLETE CLEAN TEST ===");

  // Use a unique org number that's mod11-valid
  // 910079457 was used before and we know it works
  const ORG = "910079457";
  const uniqueId = Date.now().toString().slice(-6);
  const NAME = `CleanDupTest-${uniqueId} AS`;

  // 1. Create supplier with address + bank
  console.log("\n--- Step 1: Create supplier ---");
  const createRes = await fetch(`${BASE}/supplier`, {
    method: "POST",
    headers: { Authorization: "Basic " + btoa("0:" + TOKEN), "Content-Type": "application/json" },
    body: JSON.stringify({
      name: NAME,
      organizationNumber: ORG,
      postalAddress: { addressLine1: "Storgata 42", postalCode: "5003", city: "Bergen" },
      bankAccountPresentation: [{ bban: "12345678903" }]
    })
  });
  const createData = await createRes.json();
  console.log(`POST /supplier → ${createRes.status}`);
  const supplierId = createData.value?.id;
  const supplierLedgerAccountId = createData.value?.ledgerAccount?.id;
  console.log(`  id=${supplierId} ledgerAccount=${supplierLedgerAccountId}`);
  console.log(`  postalAddress: ${createData.value?.postalAddress?.addressLine1}, ${createData.value?.postalAddress?.postalCode} ${createData.value?.postalAddress?.city}`);

  // 2. Resolve account
  console.log("\n--- Step 2: Resolve account 6300 ---");
  const acctData = await api("/ledger/account?number=6300&isApplicableForSupplierInvoice=true&fields=id,number,name");
  const acctId = acctData.values?.[0]?.id;
  console.log(`  accountId=${acctId}`);

  // 3. Import EHF with SAME org number
  console.log("\n--- Step 3: Import EHF ---");
  const invId = `INV-CLEAN-${uniqueId}`;
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${invId}</cbc:ID>
  <cbc:IssueDate>2026-06-10</cbc:IssueDate>
  <cbc:DueDate>2026-07-10</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>NOK</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0192">${ORG}</cbc:EndpointID>
      <cac:PostalAddress>
        <cbc:StreetName>Storgata 42</cbc:StreetName>
        <cbc:CityName>Bergen</cbc:CityName>
        <cbc:PostalZone>5003</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>NO${ORG}MVA</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${NAME}</cbc:RegistrationName>
        <cbc:CompanyID schemeID="0192">${ORG}</cbc:CompanyID>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0192">999999999</cbc:EndpointID>
      <cac:PostalAddress>
        <cbc:StreetName>Testveien 1</cbc:StreetName>
        <cbc:CityName>Oslo</cbc:CityName>
        <cbc:PostalZone>0001</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>Ditt firma</cbc:RegistrationName>
        <cbc:CompanyID schemeID="0192">999999999</cbc:CompanyID>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="NOK">12100.00</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="NOK">48400.00</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="NOK">12100.00</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>25</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="NOK">48400.00</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="NOK">48400.00</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="NOK">60500.00</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="NOK">60500.00</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  <cac:InvoiceLine>
    <cbc:ID>1</cbc:ID>
    <cbc:InvoicedQuantity unitCode="EA">1</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="NOK">48400.00</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Name>Nettverkstjenester</cbc:Name>
      <cac:ClassifiedTaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>25</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="NOK">48400.00</cbc:PriceAmount>
    </cac:Price>
  </cac:InvoiceLine>
</Invoice>`;

  const formData = new FormData();
  formData.append("file", new Blob([xml], { type: "application/xml" }), "invoice.xml");
  const importRes = await fetch(`${BASE}/ledger/voucher/importDocument`, {
    method: "POST",
    headers: { Authorization: "Basic " + btoa("0:" + TOKEN) },
    body: formData
  });
  const importData = await importRes.json();
  console.log(`POST /ledger/voucher/importDocument → ${importRes.status}`);
  const voucherId = importData.values?.[0]?.id;
  const voucherVersion = importData.values?.[0]?.version;
  console.log(`  voucherId=${voucherId} version=${voucherVersion}`);

  // 4. PUT postings
  console.log("\n--- Step 4: PUT postings ---");
  const putRes = await fetch(`${BASE}/ledger/voucher/${voucherId}?sendToLedger=false`, {
    method: "PUT",
    headers: { Authorization: "Basic " + btoa("0:" + TOKEN), "Content-Type": "application/json" },
    body: JSON.stringify({
      version: voucherVersion,
      postings: [
        { row: 1, account: { id: acctId }, description: "Nettverkstjenester", vatType: { id: 1 }, amount: 48400, amountCurrency: 48400, amountGross: 60500, amountGrossCurrency: 60500 },
        { row: 2, account: { id: supplierLedgerAccountId }, supplier: { id: supplierId }, description: "Nettverkstjenester", amount: -60500, amountCurrency: -60500, amountGross: -60500, amountGrossCurrency: -60500, invoiceNumber: invId, termOfPayment: "2026-07-10" }
      ]
    })
  });
  const putData = await putRes.json();
  console.log(`PUT /ledger/voucher → ${putRes.status} version=${putData.value?.version}`);

  // 5. Book
  console.log("\n--- Step 5: Book ---");
  const bookRes = await fetch(`${BASE}/ledger/voucher/${voucherId}?sendToLedger=true`, {
    method: "PUT",
    headers: { Authorization: "Basic " + btoa("0:" + TOKEN), "Content-Type": "application/json" },
    body: JSON.stringify({ version: putData.value?.version })
  });
  const bookData = await bookRes.json();
  console.log(`PUT sendToLedger=true → ${bookRes.status} number=${bookData.value?.number}`);

  // 6. Now check the supplierInvoice — which supplier is it linked to?
  console.log("\n--- Step 6: Check supplierInvoice ---");
  const siData = await api(`/supplierInvoice?invoiceDateFrom=2026-06-01&invoiceDateTo=2026-07-31&voucherId=${voucherId}&fields=*,supplier(id,name,organizationNumber,postalAddress(*),physicalAddress(*),bankAccountPresentation(*))`);
  if (siData.values?.length > 0) {
    const si = siData.values[0];
    console.log(`supplierInvoice id=${si.id}`);
    console.log(`  invoiceNumber: ${si.invoiceNumber}`);
    console.log(`  invoiceDate: ${si.invoiceDate}`);
    console.log(`  invoiceDueDate: ${si.invoiceDueDate}`);
    console.log(`  supplier.id: ${si.supplier?.id}`);
    console.log(`  supplier.name: ${si.supplier?.name}`);
    console.log(`  supplier.organizationNumber: ${si.supplier?.organizationNumber}`);
    console.log(`  supplier.postalAddress: ${JSON.stringify(si.supplier?.postalAddress)}`);
    console.log(`  supplier.physicalAddress: ${JSON.stringify(si.supplier?.physicalAddress)}`);
    console.log(`  supplier.bankAccountPresentation: ${JSON.stringify(si.supplier?.bankAccountPresentation)}`);
    console.log(`  amount: ${si.amount}`);
    console.log(`  amountExcludingVat: ${si.amountExcludingVat}`);
    console.log(`  outstandingAmount: ${si.outstandingAmount}`);
    console.log(`  kidOrReceiverReference: "${si.kidOrReceiverReference}"`);

    // Check if the supplierInvoice's supplier matches ours
    if (si.supplier?.id === supplierId) {
      console.log(`\n  *** Linked to OUR supplier (${supplierId}). No mismatch. ***`);
    } else {
      console.log(`\n  *** MISMATCH! Linked to supplier ${si.supplier?.id}, not ours (${supplierId}) ***`);
    }
  }

  // 7. Count total suppliers with this org number to check for duplicates
  console.log("\n--- Step 7: Count suppliers with org number ---");
  const suppCount = await api(`/supplier?organizationNumber=${ORG}&fields=id,name`);
  console.log(`Total suppliers with org ${ORG}: ${suppCount.fullResultSize}`);
  for (const s of (suppCount.values || [])) {
    console.log(`  id=${s.id} name="${s.name}"`);
  }
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
