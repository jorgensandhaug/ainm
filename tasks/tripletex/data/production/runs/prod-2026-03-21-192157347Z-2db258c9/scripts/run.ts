const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "pFlbRMg79_HiE8rKBcJ5nIBdKArIMVoq1C1cHH-1Pho";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const headers = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any, contentType?: string) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: { ...headers } };
  if (contentType) opts.headers["Content-Type"] = contentType;
  if (body !== undefined) opts.body = typeof body === "string" ? body : JSON.stringify(body);
  console.log(`\n>>> ${method} ${path}`);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`<<< ${r.status}`);
  console.log(JSON.stringify(json, null, 2));
  if (!r.ok) throw new Error(`${r.status}: ${JSON.stringify(json)}`);
  return json;
}

async function main() {
  // Invoice data from PDF
  const supplierName = "Luz do Sol Lda";
  const orgNumber = "964942366";
  const invoiceNumber = "INV-2026-8987";
  const invoiceDate = "2026-01-06";
  const dueDate = "2026-02-05";
  const description = "Kontorrekvisita";
  const net = 24750;
  const gross = 30937;
  const vatPercent = 25;
  const expenseAccountNumber = 6500;

  // Step 1: POST /supplier (with address + bank)
  const supplierResp = await api("POST", "/supplier", {
    name: supplierName,
    organizationNumber: orgNumber,
    postalAddress: {
      addressLine1: "Kirkegata 135",
      postalCode: "5003",
      city: "Bergen",
    },
    bankAccountPresentation: [{ bban: "53342237408" }],
  });
  const supplierId = supplierResp.value.id;
  const supplierLedgerAccountId = supplierResp.value.ledgerAccount.id;
  console.log(`Supplier ID: ${supplierId}, Ledger Account ID: ${supplierLedgerAccountId}`);

  // Step 2: GET /ledger/account for expense account
  const accountResp = await api("GET", `/ledger/account?number=${expenseAccountNumber}&isApplicableForSupplierInvoice=true&fields=*`);
  const expenseAccountId = accountResp.values[0].id;
  console.log(`Expense Account ID: ${expenseAccountId}`);

  // Step 3: POST /ledger/voucher/importDocument with EHF XML
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
        <cbc:StreetName>Kirkegata 135</cbc:StreetName>
        <cbc:CityName>Bergen</cbc:CityName>
        <cbc:PostalZone>5003</cbc:PostalZone>
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
      <cac:PartyTaxScheme>
        <cbc:CompanyID>NO999999999MVA</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>Ditt firma</cbc:RegistrationName>
        <cbc:CompanyID schemeID="0192">999999999</cbc:CompanyID>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="NOK">${gross - net}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="NOK">${net}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="NOK">${gross - net}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>${vatPercent}</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="NOK">${net}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="NOK">${net}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="NOK">${gross}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="NOK">${gross}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  <cac:InvoiceLine>
    <cbc:ID>1</cbc:ID>
    <cbc:InvoicedQuantity unitCode="EA">1</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="NOK">${net}</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Name>${description}</cbc:Name>
      <cac:ClassifiedTaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>${vatPercent}</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="NOK">${net}</cbc:PriceAmount>
    </cac:Price>
  </cac:InvoiceLine>
</Invoice>`;

  const formData = new FormData();
  formData.append("file", new Blob([xml], { type: "application/xml" }), `${invoiceNumber}.xml`);
  formData.append("split", "false");

  const importResp = await fetch(`${BASE}/ledger/voucher/importDocument`, {
    method: "POST",
    headers: { Authorization: AUTH },
    body: formData,
  });
  const importText = await importResp.text();
  let importJson: any;
  try { importJson = JSON.parse(importText); } catch { importJson = importText; }
  console.log(`\n>>> POST /ledger/voucher/importDocument`);
  console.log(`<<< ${importResp.status}`);
  console.log(JSON.stringify(importJson, null, 2));
  if (!importResp.ok) throw new Error(`Import failed: ${importResp.status}: ${JSON.stringify(importJson)}`);

  // Extract from values[0] (list wrapper!)
  const voucherId = importJson.values[0].id;
  let voucherVersion = importJson.values[0].version;
  console.log(`Voucher ID: ${voucherId}, Version: ${voucherVersion}`);

  // Step 4: PUT /ledger/voucher/{id}?sendToLedger=false with postings
  const putResp = await api("PUT", `/ledger/voucher/${voucherId}?sendToLedger=false`, {
    version: voucherVersion,
    postings: [
      {
        row: 1,
        account: { id: expenseAccountId },
        description: description,
        vatType: { id: 1 },
        amount: net,
        amountCurrency: net,
        amountGross: gross,
        amountGrossCurrency: gross,
      },
      {
        row: 2,
        account: { id: supplierLedgerAccountId },
        supplier: { id: supplierId },
        description: description,
        amount: -gross,
        amountCurrency: -gross,
        amountGross: -gross,
        amountGrossCurrency: -gross,
        invoiceNumber: invoiceNumber,
        termOfPayment: dueDate,
      },
    ],
  });
  voucherVersion = putResp.value.version;
  console.log(`Postings PUT OK, new version: ${voucherVersion}`);

  // Step 5: PUT /ledger/voucher/{id}?sendToLedger=true with ONLY version (books the voucher)
  const bookResp = await api("PUT", `/ledger/voucher/${voucherId}?sendToLedger=true`, {
    version: voucherVersion,
  });
  console.log(`Booking PUT OK, voucher number: ${bookResp.value.number}`);

  console.log("\n=== DONE ===");
  console.log(`Supplier: ${supplierId}`);
  console.log(`Voucher: ${voucherId}, Number: ${bookResp.value.number}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
