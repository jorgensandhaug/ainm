const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "cSnsdpa9pRC2M0O5khR9zqnFumJRxT001UhQH24429k";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const SUPPLIER_NAME = "Colline SARL";
const ORG_NUMBER = "938165742";
const INVOICE_NUMBER = "INV-2026-8953";
const DESCRIPTION = "services de bureau";
const GROSS = 32650;
const NET = 26120; // 32650 / 1.25
const VAT_AMOUNT = 6530;
const EXPENSE_ACCOUNT = 7300;
const TODAY = "2026-03-22";

async function api(method: string, path: string, body?: any, isFormData?: boolean) {
  const url = `${BASE}${path}`;
  const headers: Record<string, string> = { Authorization: AUTH };
  if (!isFormData) headers["Content-Type"] = "application/json";
  const opts: any = { method, headers };
  if (body) opts.body = isFormData ? body : JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  console.log(`${method} ${path} → ${res.status}`);
  if (!res.ok) { console.log(text); throw new Error(`${res.status}`); }
  return text ? JSON.parse(text) : null;
}

// Step 1: POST /supplier
const supplier = await api("POST", "/supplier", {
  name: SUPPLIER_NAME,
  organizationNumber: ORG_NUMBER,
});
const supplierId = supplier.value.id;
const supplierLedgerAccountId = supplier.value.ledgerAccount.id;
console.log(`Supplier ${supplierId}, ledger account ${supplierLedgerAccountId}`);

// Step 2: GET /ledger/account
const acctRes = await api("GET", `/ledger/account?number=${EXPENSE_ACCOUNT}&isApplicableForSupplierInvoice=true&fields=*`);
const expenseAccountId = acctRes.values[0].id;
console.log(`Expense account id ${expenseAccountId}`);

// Step 3: POST /ledger/voucher/importDocument
const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${INVOICE_NUMBER}</cbc:ID>
  <cbc:IssueDate>${TODAY}</cbc:IssueDate>
  <cbc:DueDate>${TODAY}</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>NOK</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0192">${ORG_NUMBER}</cbc:EndpointID>
      <cac:PartyName><cbc:Name>${SUPPLIER_NAME}</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>Ukjent</cbc:StreetName>
        <cbc:CityName>Oslo</cbc:CityName>
        <cbc:PostalZone>0001</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>NO${ORG_NUMBER}MVA</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity><cbc:RegistrationName>${SUPPLIER_NAME}</cbc:RegistrationName><cbc:CompanyID schemeID="0192">${ORG_NUMBER}</cbc:CompanyID></cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0192">123456785</cbc:EndpointID>
      <cac:PartyName><cbc:Name>Mitt Selskap AS</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>Testveien 1</cbc:StreetName>
        <cbc:CityName>Oslo</cbc:CityName>
        <cbc:PostalZone>0001</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyLegalEntity><cbc:RegistrationName>Mitt Selskap AS</cbc:RegistrationName></cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="NOK">${VAT_AMOUNT}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="NOK">${NET}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="NOK">${VAT_AMOUNT}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>25</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="NOK">${NET}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="NOK">${NET}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="NOK">${GROSS}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="NOK">${GROSS}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  <cac:InvoiceLine>
    <cbc:ID>1</cbc:ID>
    <cbc:InvoicedQuantity unitCode="EA">1</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="NOK">${NET}</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Name>${DESCRIPTION}</cbc:Name>
      <cac:ClassifiedTaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>25</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="NOK">${NET}</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>
</Invoice>`;

const formData = new FormData();
formData.append("file", new Blob([xml], { type: "application/xml" }), `${INVOICE_NUMBER}.xml`);

const importRes = await api("POST", "/ledger/voucher/importDocument", formData, true);
const voucherId = importRes.values[0].id;
let voucherVersion = importRes.values[0].version;
console.log(`Voucher ${voucherId}, version ${voucherVersion}`);

// Step 4: PUT /ledger/voucher/{id}?sendToLedger=false (postings)
const putRes = await api("PUT", `/ledger/voucher/${voucherId}?sendToLedger=false`, {
  version: voucherVersion,
  postings: [
    {
      row: 1,
      account: { id: expenseAccountId },
      description: DESCRIPTION,
      vatType: { id: 1 },
      amount: NET,
      amountCurrency: NET,
      amountGross: GROSS,
      amountGrossCurrency: GROSS,
    },
    {
      row: 2,
      account: { id: supplierLedgerAccountId },
      supplier: { id: supplierId },
      description: DESCRIPTION,
      amount: -GROSS,
      amountCurrency: -GROSS,
      amountGross: -GROSS,
      amountGrossCurrency: -GROSS,
      invoiceNumber: INVOICE_NUMBER,
      termOfPayment: TODAY,
    },
  ],
});
voucherVersion = putRes.value.version;
console.log(`Postings set, version ${voucherVersion}`);
console.log("Postings:", JSON.stringify(putRes.value.postings?.map((p: any) => ({
  row: p.row, account: p.account?.number, amount: p.amount, amountGross: p.amountGross, vatType: p.vatType?.id
}))));

// Step 5: PUT /ledger/voucher/{id}?sendToLedger=true (book)
const bookRes = await api("PUT", `/ledger/voucher/${voucherId}?sendToLedger=true`, {
  version: voucherVersion,
});
console.log(`Booked, number=${bookRes.value.number}, version=${bookRes.value.version}`);
console.log("DONE — 5 calls, 0 errors");
