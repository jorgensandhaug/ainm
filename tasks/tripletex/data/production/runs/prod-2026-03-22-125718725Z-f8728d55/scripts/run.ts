const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "tLBzXyXSDiHCDfpZAj4GWpqXDqC06fLuZvsK153z7mg";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);

const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}/${path}`;
  const opts: any = { method, headers: body !== undefined ? H : { Authorization: AUTH } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} → ${r.status}`);
  if (r.status >= 400) { console.log("ERROR:", JSON.stringify(json, null, 2)); }
  return { status: r.status, data: json };
}

// PDF data
const supplierName = "Rivière SARL";
const orgNumber = "838532624";
const street = "Storgata 77";
const postalCode = "8006";
const city = "Bodø";
const invoiceNumber = "INV-2026-2554";
const invoiceDate = "2026-01-03";
const dueDate = "2026-02-02";
const description = "Programvarelisens";
const net = 20000;
const vatAmount = 5000;
const gross = 25000;
const expenseAccount = 6340;
const bankAccount = "20108509946";

async function main() {
  // Step 1: POST supplier + Step 2: GET expense account (parallel)
  const [supRes, acctRes] = await Promise.all([
    api("POST", "supplier", {
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
    }),
    api("GET", `ledger/account?number=${expenseAccount}&fields=id,number,vatLocked,legalVatTypes`)
  ]);

  if (supRes.status >= 400) { console.log("Supplier create failed, aborting"); return; }
  const supplierId = supRes.data.value.id;
  const supplierLedgerAccountId = supRes.data.value.ledgerAccount.id;
  console.log("Supplier created:", supplierId, "ledgerAccount.id:", supplierLedgerAccountId);
  console.log("Supplier response:", JSON.stringify(supRes.data.value, null, 2));

  if (acctRes.status >= 400 || !acctRes.data.values?.length) { console.log("Account lookup failed"); return; }
  const expenseAccountId = acctRes.data.values[0].id;
  console.log("Expense account id:", expenseAccountId);

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

  const formData = new FormData();
  formData.append("file", new Blob([xml], { type: "text/xml" }), `${invoiceNumber}.xml`);
  const impRes = await fetch(`${BASE}/ledger/voucher/importDocument`, {
    method: "POST", headers: { Authorization: AUTH }, body: formData,
  });
  const imp = await impRes.json();
  console.log("importDocument →", impRes.status);
  if (impRes.status >= 400) { console.log("importDocument ERROR:", JSON.stringify(imp, null, 2)); return; }
  console.log("importDocument response:", JSON.stringify(imp, null, 2));

  const voucherId = imp.values[0].id;
  const version1 = imp.values[0].version;
  console.log("voucherId:", voucherId, "version:", version1);

  // Step 4: PUT postings (sendToLedger=false)
  const putRes = await api("PUT", `ledger/voucher/${voucherId}?sendToLedger=false`, {
    version: version1,
    postings: [
      {
        row: 1,
        account: { id: expenseAccountId },
        description,
        vatType: { id: 1 },
        amount: net,
        amountCurrency: net,
        amountGross: gross,
        amountGrossCurrency: gross
      },
      {
        row: 2,
        account: { id: supplierLedgerAccountId },
        supplier: { id: supplierId },
        description,
        amount: -gross,
        amountCurrency: -gross,
        amountGross: -gross,
        amountGrossCurrency: -gross,
        invoiceNumber,
        termOfPayment: dueDate
      }
    ]
  });

  if (putRes.status >= 400) { console.log("PUT postings failed"); return; }
  const version2 = putRes.data.value.version;
  console.log("Postings set, version:", version2);
  console.log("PUT postings response:", JSON.stringify(putRes.data.value, null, 2));

  // Step 5: Book (sendToLedger=true)
  const bookRes = await api("PUT", `ledger/voucher/${voucherId}?sendToLedger=true`, {
    version: version2,
    voucherType: { name: "Leverandørfaktura" }
  });

  if (bookRes.status >= 400) { console.log("Book failed"); return; }
  const version3 = bookRes.data.value.version;
  console.log("Booked, version:", version3);
  console.log("Book response:", JSON.stringify(bookRes.data.value, null, 2));

  // Step 6: Verification GETs (free)
  const [vSupplier, vVoucher, vSI, vPostings] = await Promise.all([
    api("GET", `supplier/${supplierId}?fields=id,name,organizationNumber,postalAddress(addressLine1,postalCode,city,country(id)),physicalAddress(addressLine1,postalCode,city,country(id)),bankAccountPresentation`),
    api("GET", `ledger/voucher/${voucherId}?fields=id,number,description,date,vendorInvoiceNumber,document,attachment,ediDocument,voucherType(id,name)`),
    api("GET", `supplierInvoice?invoiceDateFrom=2025-01-01&invoiceDateTo=2027-12-31&invoiceNumber=${encodeURIComponent(invoiceNumber)}&fields=id,invoiceNumber,invoiceDate,invoiceDueDate,amount,amountCurrency,amountExcludingVat,amountExcludingVatCurrency,outstandingAmount,kidOrReceiverReference,isCreditNote,supplier(id,name),voucher(id,number),orderLines(id,description)`),
    api("GET", `ledger/posting?voucherId=${voucherId}&fields=*`)
  ]);

  console.log("\n=== VERIFICATION ===");
  console.log("Supplier:", JSON.stringify(vSupplier.data.value, null, 2));
  console.log("Voucher:", JSON.stringify(vVoucher.data.value, null, 2));
  console.log("SupplierInvoice:", JSON.stringify(vSI.data.values?.[0], null, 2));
  console.log("kidOrReceiverReference:", vSI.data.values?.[0]?.kidOrReceiverReference);
  console.log("Postings:", JSON.stringify(vPostings.data.values, null, 2));
}

main().catch(e => console.error(e));
