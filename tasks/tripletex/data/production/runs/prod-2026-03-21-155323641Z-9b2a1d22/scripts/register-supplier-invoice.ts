const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "g5m5mmgNOj_d9MKzV4G7btACmZI9u0USB3GD-44kM6w";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };

async function api(method: string, path: string, body?: any, isForm?: boolean) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: isForm ? { Authorization: AUTH } : H };
  if (body && !isForm) opts.body = JSON.stringify(body);
  if (isForm) opts.body = body;
  const r = await fetch(url, opts);
  const text = await r.text();
  console.log(`${method} ${path} -> ${r.status}`);
  if (!r.ok) { console.log(text); }
  return { status: r.status, data: text ? JSON.parse(text) : null };
}

// Invoice data from PDF
const SUPPLIER_NAME = "Bergvik AS";
const ORG_NR = "919398051";
const INV_NR = "INV-2026-8506";
const INV_DATE = "2026-02-01";
const DUE_DATE = "2026-03-03";
const DESCRIPTION = "Kontorrekvisita";
const NET = 41050;
const VAT_AMT = 10262;
const GROSS = 51312;
const EXPENSE_ACCT = 6500;

// Step 1: Create supplier with address and bank account
const step1 = await api("POST", "/supplier", {
  name: SUPPLIER_NAME,
  organizationNumber: ORG_NR,
  postalAddress: {
    addressLine1: "Sjøgata 2",
    postalCode: "4611",
    city: "Kristiansand",
  },
  bankAccountPresentation: [{ bban: "58637944698" }],
});
const supplierId = step1.data.value.id;
const supplierLedgerAccountId = step1.data.value.ledgerAccount.id;
console.log("Supplier ID:", supplierId, "Ledger Account ID:", supplierLedgerAccountId);

// Step 2: Get expense account
const step2 = await api("GET", `/ledger/account?number=${EXPENSE_ACCT}&isApplicableForSupplierInvoice=true&fields=*`);
const expenseAccountId = step2.data.values[0].id;
console.log("Expense Account ID:", expenseAccountId);

// Step 3: Get incoming VAT type
const step3 = await api("GET", `/ledger/vatType?typeOfVat=INCOMING&vatDate=${INV_DATE}&fields=*`);
const vatTypes = step3.data.values.filter((v: any) => v.percentage === 25);
const vatType = vatTypes.find((v: any) => v.number === "1") || vatTypes[0];
const vatTypeId = vatType.id;
console.log("VAT Type ID:", vatTypeId, "number:", vatType.number);

// Step 4: Import EHF XML
const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${INV_NR}</cbc:ID>
  <cbc:IssueDate>${INV_DATE}</cbc:IssueDate>
  <cbc:DueDate>${DUE_DATE}</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>NOK</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0192">${ORG_NR}</cbc:EndpointID>
      <cac:PartyName><cbc:Name>${SUPPLIER_NAME}</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>Sjøgata 2</cbc:StreetName>
        <cbc:CityName>Kristiansand</cbc:CityName>
        <cbc:PostalZone>4611</cbc:PostalZone>
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
      <cbc:EndpointID schemeID="0192">999999999</cbc:EndpointID>
      <cac:PartyName><cbc:Name>Ditt firma</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:CityName>Oslo</cbc:CityName>
        <cbc:PostalZone>0001</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>NO999999999MVA</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity><cbc:RegistrationName>Ditt firma</cbc:RegistrationName><cbc:CompanyID schemeID="0192">999999999</cbc:CompanyID></cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="NOK">${VAT_AMT}.00</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="NOK">${NET}.00</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="NOK">${VAT_AMT}.00</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>25</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="NOK">${NET}.00</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="NOK">${NET}.00</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="NOK">${GROSS}.00</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="NOK">${GROSS}.00</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  <cac:InvoiceLine>
    <cbc:ID>1</cbc:ID>
    <cbc:InvoicedQuantity unitCode="EA">1</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="NOK">${NET}.00</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Name>${DESCRIPTION}</cbc:Name>
      <cac:ClassifiedTaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>25</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="NOK">${NET}.00</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>
</Invoice>`;

const form = new FormData();
form.append("file", new Blob([xml], { type: "application/xml" }), "invoice.xml");

const step4 = await api("POST", "/ledger/voucher/importDocument", form, true);
// CRITICAL: response is { values: [...] }, NOT { value: {...} }
const voucherId = step4.data.values[0].id;
const voucherVersion = step4.data.values[0].version;
console.log("Voucher ID:", voucherId, "Version:", voucherVersion);

// Step 5: PUT voucher with correct postings
const step5 = await api("PUT", `/ledger/voucher/${voucherId}?sendToLedger=false`, {
  version: voucherVersion,
  postings: [
    {
      row: 1,
      account: { id: expenseAccountId },
      description: DESCRIPTION,
      vatType: { id: vatTypeId },
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
      invoiceNumber: INV_NR,
      termOfPayment: DUE_DATE,
    },
  ],
});

console.log("\n=== FINAL RESULT ===");
console.log(JSON.stringify(step5.data, null, 2));
