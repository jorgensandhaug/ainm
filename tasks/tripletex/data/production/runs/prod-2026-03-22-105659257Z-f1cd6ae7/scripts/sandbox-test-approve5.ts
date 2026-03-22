const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = `Basic ${btoa(`0:${TOKEN}`)}`;

async function api(method: string, path: string, body?: any): Promise<any> {
  const opts: any = { method, headers: { Authorization: AUTH } };
  if (body instanceof FormData) opts.body = body;
  else if (body) { opts.headers["Content-Type"] = "application/json"; opts.body = JSON.stringify(body); }
  const res = await fetch(`${BASE}${path}`, opts);
  const text = await res.text();
  let json: any; try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} → ${res.status}`);
  if (res.status >= 400) console.log("  Error:", typeof json === 'string' ? json.substring(0, 500) : JSON.stringify(json).substring(0, 500));
  return { status: res.status, data: json };
}

async function run() {
  // Use an existing sandbox supplier (Codex Sandbox Supplier) to avoid org number issues
  const { data: suppList } = await api("GET", "/supplier?count=1&fields=id,name,organizationNumber,ledgerAccount(id)");
  const existingSupp = suppList.values[0];
  const supplierId = existingSupp.id;
  const orgNumber = existingSupp.organizationNumber;
  const supplierName = existingSupp.name;
  const ledgerAccountId = existingSupp.ledgerAccount.id;
  console.log(`Using existing: ${supplierName} (${orgNumber}), id=${supplierId}, ledgerAcct=${ledgerAccountId}`);

  const { data: acctData } = await api("GET", "/ledger/account?number=6540&isApplicableForSupplierInvoice=true&fields=id,number");
  const expenseAccountId = acctData.values[0].id;

  // importDocument with unique invoice number
  const rnd = Math.floor(Math.random() * 99999);
  const invoiceNumber = `APPR-${rnd}`;
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${invoiceNumber}</cbc:ID>
  <cbc:IssueDate>2026-03-01</cbc:IssueDate>
  <cbc:DueDate>2026-03-31</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>NOK</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty><cac:Party>
    <cbc:EndpointID schemeID="0192">${orgNumber}</cbc:EndpointID>
    <cac:PartyName><cbc:Name>${supplierName}</cbc:Name></cac:PartyName>
    <cac:PostalAddress>
      <cbc:StreetName>Gate 1</cbc:StreetName><cbc:CityName>Oslo</cbc:CityName>
      <cbc:PostalZone>0100</cbc:PostalZone>
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
    <cac:PayeeFinancialAccount><cbc:ID>22757315878</cbc:ID></cac:PayeeFinancialAccount>
  </cac:PaymentMeans>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="NOK">2500</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="NOK">10000</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="NOK">2500</cbc:TaxAmount>
      <cac:TaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>25</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="NOK">10000</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="NOK">10000</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="NOK">12500</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="NOK">12500</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  <cac:InvoiceLine><cbc:ID>1</cbc:ID>
    <cbc:InvoicedQuantity unitCode="EA">1</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="NOK">10000</cbc:LineExtensionAmount>
    <cac:Item><cbc:Name>Datautstyr</cbc:Name>
      <cac:ClassifiedTaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>25</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="NOK">10000</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>
</Invoice>`;

  const fd = new FormData();
  fd.append("file", new Blob([xml], { type: "text/xml" }), `${invoiceNumber}.xml`);
  const { status: impSt, data: imp } = await api("POST", "/ledger/voucher/importDocument", fd);
  if (impSt !== 201) return;
  const voucherId = imp.values[0].id;
  const version1 = imp.values[0].version;

  // Find SI
  const { data: siData } = await api("GET", `/supplierInvoice?invoiceDateFrom=2025-01-01&invoiceDateTo=2027-12-31&invoiceNumber=${invoiceNumber}&fields=*`);
  const siId = siData.values?.[0]?.id;
  console.log(`\nSI id=${siId}`);

  // PUT postings
  const { status: putSt, data: putData } = await api("PUT", `/ledger/voucher/${voucherId}?sendToLedger=false`, {
    version: version1,
    postings: [
      { row: 1, account: { id: expenseAccountId }, description: "Datautstyr", vatType: { id: 1 },
        amount: 10000, amountCurrency: 10000, amountGross: 12500, amountGrossCurrency: 12500 },
      { row: 2, account: { id: ledgerAccountId }, supplier: { id: supplierId }, description: "Datautstyr",
        amount: -12500, amountCurrency: -12500, amountGross: -12500, amountGrossCurrency: -12500,
        invoiceNumber, termOfPayment: "2026-03-31" }
    ]
  });
  if (putSt !== 200) return;

  // APPROVE the SI
  if (siId) {
    console.log("\n=== APPROVE SI ===");
    const { status: appSt, data: appData } = await api("PUT", `/supplierInvoice/${siId}/:approve`);
    if (appSt === 200) {
      console.log("Approve OK");
    }
  }

  // Get fresh version (approve might have changed it)
  const { data: freshV } = await api("GET", `/ledger/voucher/${voucherId}?fields=id,version`);
  const latestVersion = freshV.value.version;

  // Book
  const { status: bookSt } = await api("PUT", `/ledger/voucher/${voucherId}?sendToLedger=true`, {
    version: latestVersion,
    voucherType: { name: "Leverandørfaktura" }
  });
  if (bookSt !== 200) return;

  // Final SI
  console.log("\n=== Final SI ===");
  const { data: siFinal } = await api("GET", `/supplierInvoice/${siId}?fields=*`);
  console.log("SI:", JSON.stringify(siFinal.value, null, 2));

  // Approval elements
  if (siFinal.value?.approvalListElements?.length) {
    for (const elem of siFinal.value.approvalListElements) {
      const { data: elemData } = await api("GET", `/voucherApprovalListElement/${elem.id}?fields=*`);
      console.log("ApprovalElem:", JSON.stringify(elemData.value, null, 2));
    }
  }
}

run().catch(e => { console.error("FATAL:", e); process.exit(1); });
