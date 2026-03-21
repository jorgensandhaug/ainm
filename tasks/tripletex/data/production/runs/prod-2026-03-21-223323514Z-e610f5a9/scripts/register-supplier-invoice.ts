const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "DQ999k8InaE9iHmDuBUvynpkmvMLry8nzumfwLBFysk";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const headers = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any, isFormData = false) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: isFormData ? { Authorization: AUTH } : headers };
  if (body) opts.body = isFormData ? body : JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  console.log(`${method} ${path} → ${res.status}`);
  if (!res.ok) { console.log(text); throw new Error(`${res.status}`); }
  return text ? JSON.parse(text) : null;
}

const SUPPLIER_NAME = "Luz do Sol Lda";
const ORG_NR = "945810149";
const INVOICE_NR = "INV-2026-5787";
const GROSS = 35950;
const NET = GROSS / 1.25; // 28760
const VAT_AMT = GROSS - NET; // 7190
const EXPENSE_ACCT = 6590;
const DESCRIPTION = "serviços de escritório";
const DATE = "2026-03-21";

async function main() {
  // Step 1: POST /supplier
  const supplierRes = await api("POST", "/supplier", {
    name: SUPPLIER_NAME,
    organizationNumber: ORG_NR,
  });
  const supplierId = supplierRes.value.id;
  const supplierLedgerAccountId = supplierRes.value.ledgerAccount.id;
  console.log(`Supplier id=${supplierId}, ledgerAccount=${supplierLedgerAccountId}`);

  // Step 2: GET expense account
  const acctRes = await api("GET", `/ledger/account?number=${EXPENSE_ACCT}&isApplicableForSupplierInvoice=true&fields=*`);
  const expenseAccountId = acctRes.values[0].id;
  console.log(`Expense account id=${expenseAccountId}`);

  // Step 3: POST /ledger/voucher/importDocument with EHF XML
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${INVOICE_NR}</cbc:ID>
  <cbc:IssueDate>${DATE}</cbc:IssueDate>
  <cbc:DueDate>${DATE}</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>NOK</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0192">${ORG_NR}</cbc:EndpointID>
      <cac:PostalAddress>
        <cbc:StreetName>Gate 1</cbc:StreetName>
        <cbc:CityName>Oslo</cbc:CityName>
        <cbc:PostalZone>0001</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>NO${ORG_NR}MVA</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${SUPPLIER_NAME}</cbc:RegistrationName>
        <cbc:CompanyID schemeID="0192">${ORG_NR}</cbc:CompanyID>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0192">123456785</cbc:EndpointID>
      <cac:PostalAddress>
        <cbc:StreetName>Kundeveien 1</cbc:StreetName>
        <cbc:CityName>Oslo</cbc:CityName>
        <cbc:PostalZone>0001</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>Buyer AS</cbc:RegistrationName>
        <cbc:CompanyID schemeID="0192">123456785</cbc:CompanyID>
      </cac:PartyLegalEntity>
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
    <cac:Price>
      <cbc:PriceAmount currencyID="NOK">${NET}</cbc:PriceAmount>
    </cac:Price>
  </cac:InvoiceLine>
</Invoice>`;

  const formData = new FormData();
  formData.append("file", new Blob([xml], { type: "application/xml" }), `${INVOICE_NR}.xml`);

  const importRes = await api("POST", "/ledger/voucher/importDocument", formData, true);
  const voucherId = importRes.values[0].id;
  let version = importRes.values[0].version;
  console.log(`Voucher id=${voucherId}, version=${version}`);

  // Step 4: PUT postings with sendToLedger=false
  const putRes = await api("PUT", `/ledger/voucher/${voucherId}?sendToLedger=false`, {
    version,
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
        termOfPayment: DATE,
      },
    ],
  });
  version = putRes.value.version;
  console.log(`Postings PUT ok, version=${version}`);
  console.log("Postings:", JSON.stringify(putRes.value.postings?.map((p: any) => ({
    row: p.row, account: p.account?.number, amount: p.amount, amountGross: p.amountGross, vatType: p.vatType?.id
  }))));

  // Step 5: PUT sendToLedger=true (booking) with only version
  const bookRes = await api("PUT", `/ledger/voucher/${voucherId}?sendToLedger=true`, { version });
  console.log(`Booking ok, number=${bookRes.value.number}, version=${bookRes.value.version}`);
}

main().catch(e => { console.error(e); process.exit(1); });
