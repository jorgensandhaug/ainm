const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "uC56rYv-hryAZUQeqsafBnPuvnNyqV49NRP_kZVM7ZU";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const h = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: h };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const j = await r.json();
  console.log(`${method} ${path} → ${r.status}`);
  console.log(JSON.stringify(j, null, 2));
  if (!r.ok) throw new Error(`${method} ${path} failed: ${r.status} ${JSON.stringify(j)}`);
  return j;
}

// Constants from prompt
const supplierName = "Stormberg AS";
const orgNumber = "935090350";
const invoiceNumber = "INV-2026-7530";
const gross = 27050;
const net = 21640; // 27050 / 1.25
const vat = 5410;  // 27050 - 21640
const expenseAccount = 6540;
const description = "Kontortjenester";
const invoiceDate = "2026-03-22";
const dueDate = "2026-04-21";

async function main() {
  // Step 1: Create supplier
  const supRes = await api("POST", "/supplier", {
    name: supplierName,
    organizationNumber: orgNumber,
    postalAddress: { country: { id: 161 } },
    physicalAddress: { country: { id: 161 } },
  });
  const supplierId = supRes.value.id;
  const supplierLedgerAccountId = supRes.value.ledgerAccount.id;
  console.log(`Supplier created: id=${supplierId}, ledgerAccountId=${supplierLedgerAccountId}`);

  // Step 2: GET expense account id
  const accRes = await api("GET", `/ledger/account?number=${expenseAccount}&isApplicableForSupplierInvoice=true&fields=*`);
  const expenseAccountId = accRes.values[0].id;
  console.log(`Expense account id=${expenseAccountId}`);

  // Step 3: POST importDocument with EHF XML
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
      <cbc:EndpointID schemeID="0192">987654325</cbc:EndpointID>
      <cac:PartyName><cbc:Name>Buyer</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>Gate 1</cbc:StreetName>
        <cbc:CityName>Oslo</cbc:CityName>
        <cbc:PostalZone>0001</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyLegalEntity><cbc:RegistrationName>Buyer AS</cbc:RegistrationName></cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:PaymentMeans>
    <cbc:PaymentMeansCode>30</cbc:PaymentMeansCode>
    <cbc:PaymentID>${invoiceNumber}</cbc:PaymentID>
    <cac:PayeeFinancialAccount>
      <cbc:ID>NO0000000000000</cbc:ID>
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
      <cbc:Name>${description}</cbc:Name>
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
  const blob = new Blob([xml], { type: "application/xml" });
  formData.append("file", blob, `${invoiceNumber}.xml`);

  const impRes = await fetch(`${BASE}/ledger/voucher/importDocument`, {
    method: "POST",
    headers: { Authorization: AUTH },
    body: formData,
  });
  const impJson = await impRes.json();
  console.log(`POST /ledger/voucher/importDocument → ${impRes.status}`);
  console.log(JSON.stringify(impJson, null, 2));
  if (!impRes.ok) throw new Error(`importDocument failed: ${impRes.status} ${JSON.stringify(impJson)}`);

  const voucherId = impJson.values[0].id;
  const voucherVersion = impJson.values[0].version;
  console.log(`Voucher created: id=${voucherId}, version=${voucherVersion}`);

  // Step 4: Verify SI entity
  const siRes = await api("GET", `/supplierInvoice?voucherId=${voucherId}&invoiceDateFrom=2026-01-01&invoiceDateTo=2026-12-31&fields=*`);
  console.log(`SI count=${siRes.count}`);

  // Step 5: PUT postings (sendToLedger=false)
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
  console.log(`Postings set, version=${version2}`);

  // Step 6: PUT book (sendToLedger=true)
  const bookRes = await api("PUT", `/ledger/voucher/${voucherId}?sendToLedger=true`, {
    version: version2,
    voucherType: { name: "Leverandørfaktura" },
  });
  console.log(`Booked: number=${bookRes.value.number}`);

  // Step 7: Verify voucher
  await api("GET", `/ledger/voucher/${voucherId}?fields=*`);

  // Step 8: Verify supplier
  await api("GET", `/supplier/${supplierId}?fields=*`);

  console.log("DONE");
}

main().catch((e) => { console.error(e); process.exit(1); });
