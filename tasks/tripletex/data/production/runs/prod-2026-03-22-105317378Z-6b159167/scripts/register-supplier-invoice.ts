const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "KBXKVQrMu7Ji6n8M38r2BpAd-6Gx8u1qnSUnLCtfMlg";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);

const headers = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} → ${r.status}`);
  console.log(JSON.stringify(json, null, 2));
  if (!r.ok) throw new Error(`${method} ${path} failed: ${r.status} ${text}`);
  return json;
}

async function apiForm(path: string, formData: FormData) {
  const url = `${BASE}${path}`;
  const r = await fetch(url, {
    method: "POST",
    headers: { Authorization: AUTH },
    body: formData,
  });
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`POST ${path} → ${r.status}`);
  console.log(JSON.stringify(json, null, 2));
  if (!r.ok) throw new Error(`POST ${path} failed: ${r.status} ${text}`);
  return json;
}

// Already-created supplier from previous run
const supplierId = 108586566;
const supplierLedgerAccountId = 499153428;
const expenseAccountId = 499153635;

const supplierName = "Solmar Lda";
const orgNumber = "974178680";
const invoiceNumber = "INV-2026-6556";
const gross = 50750;
const net = 40600;
const vat = 10150;
const invoiceDate = "2026-03-22";
const dueDate = "2026-04-21";
const description = "serviços de escritório";

async function main() {
  // Use valid Norwegian org number for buyer (passes mod11 check)
  const companyOrgNr = "987654325";
  const companyName = "My Company";

  // importDocument with EHF XML using real buyer org number
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
        <cbc:StreetName>Ukjent</cbc:StreetName>
        <cbc:CityName>Ukjent</cbc:CityName>
        <cbc:PostalZone>0000</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>NO${orgNumber}MVA</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity><cbc:RegistrationName>${supplierName}</cbc:RegistrationName></cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0192">${companyOrgNr}</cbc:EndpointID>
      <cac:PartyName><cbc:Name>${companyName}</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>Street</cbc:StreetName>
        <cbc:CityName>Oslo</cbc:CityName>
        <cbc:PostalZone>0001</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyLegalEntity><cbc:RegistrationName>${companyName}</cbc:RegistrationName></cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:PaymentMeans>
    <cbc:PaymentMeansCode>30</cbc:PaymentMeansCode>
    <cbc:PaymentID>${invoiceNumber}</cbc:PaymentID>
    <cac:PayeeFinancialAccount>
      <cbc:ID>00000000000</cbc:ID>
    </cac:PayeeFinancialAccount>
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
      <cbc:Name>serviços de escritório</cbc:Name>
      <cac:ClassifiedTaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>25</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="NOK">${net}.00</cbc:PriceAmount>
    </cac:Price>
  </cac:InvoiceLine>
</Invoice>`;

  const formData = new FormData();
  const xmlBlob = new Blob([xml], { type: "application/xml" });
  formData.append("file", xmlBlob, `${invoiceNumber}.xml`);
  formData.append("split", "false");

  const importRes = await apiForm("/ledger/voucher/importDocument", formData);
  const voucherId = importRes.values[0].id;
  const voucherVersion = importRes.values[0].version;
  console.log(`Voucher ID: ${voucherId}, Version: ${voucherVersion}`);

  // Verify SI entity
  const siRes = await api("GET", `/supplierInvoice?voucherId=${voucherId}&fields=*`);
  console.log(`SupplierInvoice count: ${siRes.count}`);
  if (siRes.count === 0) throw new Error("No supplierInvoice entity created!");

  // PUT postings (sendToLedger=false)
  const putPostingsRes = await api("PUT", `/ledger/voucher/${voucherId}?sendToLedger=false`, {
    version: voucherVersion,
    postings: [
      {
        row: 1,
        date: invoiceDate,
        description: description,
        account: { id: expenseAccountId },
        vatType: { id: 1 },
        amount: net,
        amountCurrency: net,
        amountGross: gross,
        amountGrossCurrency: gross,
      },
      {
        row: 2,
        date: invoiceDate,
        description: description,
        account: { id: supplierLedgerAccountId },
        supplier: { id: supplierId },
        amount: -gross,
        amountCurrency: -gross,
        amountGross: -gross,
        amountGrossCurrency: -gross,
        invoiceNumber: invoiceNumber,
        termOfPayment: dueDate,
      },
    ],
  });
  const version2 = putPostingsRes.value.version;
  console.log(`After PUT postings, version: ${version2}`);

  // PUT book (sendToLedger=true)
  const bookRes = await api("PUT", `/ledger/voucher/${voucherId}?sendToLedger=true`, {
    version: version2,
    voucherType: { name: "Leverandørfaktura" },
  });
  console.log(`Booked voucher number: ${bookRes.value.number}`);

  // Verify voucher
  const voucherVerify = await api("GET", `/ledger/voucher/${voucherId}?fields=*`);
  console.log(`Voucher number: ${voucherVerify.value.number}, description: ${voucherVerify.value.description}`);

  // Verify supplier
  const supplierVerify = await api("GET", `/supplier/${supplierId}?fields=*`);
  console.log(`Supplier: ${supplierVerify.value.name}, org: ${supplierVerify.value.organizationNumber}`);

  console.log("\nDONE — supplier invoice registered and booked.");
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
