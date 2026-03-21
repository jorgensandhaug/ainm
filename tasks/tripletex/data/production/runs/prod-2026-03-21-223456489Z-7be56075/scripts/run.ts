const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "TqHwVvpLV0Hhz7M8sQm875eKcS367Rnv9ax9AI1Zbsw";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const SUPPLIER_NAME = "Lumière SARL";
const ORG_NR = "904564184";
const INVOICE_NR = "INV-2026-5683";
const GROSS = 75500;
const NET = 60400; // 75500 / 1.25
const VAT_AMT = 15100;
const EXPENSE_ACCOUNT_NR = 7140;
const DESCRIPTION = "services de bureau";
const INV_DATE = "2026-03-21";
const DUE_DATE = "2026-03-21";

async function api(method: string, path: string, body?: any, isFormData?: boolean) {
  const url = `${BASE}${path}`;
  const headers: Record<string, string> = { Authorization: AUTH };
  if (body && !isFormData) headers["Content-Type"] = "application/json";
  const res = await fetch(url, {
    method,
    headers,
    body: isFormData ? body : body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  console.log(`${method} ${path} → ${res.status}`);
  if (res.status >= 400) {
    console.error("ERROR:", JSON.stringify(data).slice(0, 500));
    throw new Error(`${method} ${path} failed with ${res.status}`);
  }
  return data;
}

// Step 1: Create supplier
const supplierRes = await api("POST", "/supplier", {
  name: SUPPLIER_NAME,
  organizationNumber: ORG_NR,
  isSupplier: true,
});
const supplierId = supplierRes.value.id;
const supplierLedgerAccountId = supplierRes.value.ledgerAccount.id;
console.log(`Supplier created: id=${supplierId}, ledgerAccount=${supplierLedgerAccountId}`);

// Step 2: Get expense account
const accountRes = await api("GET", `/ledger/account?number=${EXPENSE_ACCOUNT_NR}&isApplicableForSupplierInvoice=true&fields=*`);
const expenseAccount = accountRes.values[0];
const expenseAccountId = expenseAccount.id;
console.log(`Expense account: id=${expenseAccountId}, name=${expenseAccount.name}`);

// Step 3: Import EHF XML
const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${INVOICE_NR}</cbc:ID>
  <cbc:IssueDate>${INV_DATE}</cbc:IssueDate>
  <cbc:DueDate>${DUE_DATE}</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>NOK</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0192">${ORG_NR}</cbc:EndpointID>
      <cac:PartyName><cbc:Name>${SUPPLIER_NAME}</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>Unknown</cbc:StreetName>
        <cbc:CityName>Oslo</cbc:CityName>
        <cbc:PostalZone>0001</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>NO${ORG_NR}MVA</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity><cbc:RegistrationName>${SUPPLIER_NAME}</cbc:RegistrationName><cbc:CompanyID schemeID="0192">${ORG_NR}</cbc:CompanyID></cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0192">123456785</cbc:EndpointID>
      <cac:PostalAddress>
        <cbc:StreetName>Testveien 1</cbc:StreetName>
        <cbc:CityName>Oslo</cbc:CityName>
        <cbc:PostalZone>0001</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyLegalEntity><cbc:RegistrationName>Buyer AS</cbc:RegistrationName><cbc:CompanyID schemeID="0192">123456785</cbc:CompanyID></cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="NOK">${VAT_AMT}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="NOK">${NET}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="NOK">${VAT_AMT}</cbc:TaxAmount>
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
formData.append("file", new Blob([xml], { type: "application/xml" }), `${INVOICE_NR}.xml`);

const importRes = await api("POST", "/ledger/voucher/importDocument", formData, true);
const voucherId = importRes.values[0].id;
let voucherVersion = importRes.values[0].version;
console.log(`Voucher imported: id=${voucherId}, version=${voucherVersion}`);

// Step 4: PUT postings with sendToLedger=false
const postingsRes = await api("PUT", `/ledger/voucher/${voucherId}?sendToLedger=false`, {
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
      invoiceNumber: INVOICE_NR,
      termOfPayment: DUE_DATE,
    },
  ],
});
voucherVersion = postingsRes.value.version;
console.log(`Postings set, version=${voucherVersion}`);
console.log("Postings:", JSON.stringify(postingsRes.value.postings?.map((p: any) => ({
  row: p.row, account: p.account?.number, amount: p.amount, amountGross: p.amountGross, vatType: p.vatType?.id
}))));

// Step 5: Book the voucher
const bookRes = await api("PUT", `/ledger/voucher/${voucherId}?sendToLedger=true`, {
  version: voucherVersion,
});
console.log(`Voucher booked: number=${bookRes.value.number}, version=${bookRes.value.version}`);
console.log("DONE — 5 calls, 0 errors");
