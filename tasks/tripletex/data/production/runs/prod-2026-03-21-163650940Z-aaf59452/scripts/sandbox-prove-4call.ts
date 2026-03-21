// Sandbox proof: complete 4-call path for supplier invoice registration
// Skips GET /ledger/vatType by hard-coding vatType: { id: 1 } for 25% incoming

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: { Authorization: AUTH } };
  if (body && !(body instanceof FormData)) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  } else if (body instanceof FormData) {
    opts.body = body;
  }
  console.log(`\n>>> ${method} ${url}`);
  const resp = await fetch(url, opts);
  const text = await resp.text();
  console.log(`<<< ${resp.status}`);
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  if (!resp.ok) {
    console.log("ERROR:", JSON.stringify(json, null, 2).substring(0, 1500));
    throw new Error(`${resp.status}`);
  }
  return json;
}

const TS = Date.now();
const SUPPLIER_NAME = `SandboxProof4Call ${TS}`;
const ORG_NR = "966941901";
const INVOICE_NR = `INV-SBX-4CALL-${TS}`;
const INVOICE_DATE = "2026-03-21";
const DUE_DATE = "2026-04-20";
const DESCRIPTION = "Programvarelisens sandbox proof";
const NET = 20000;
const VAT_AMT = 5000;
const GROSS = 25000;
const EXPENSE_ACCOUNT_NR = 6340;

async function main() {
  let callCount = 0;

  // Call 1: POST /supplier
  callCount++;
  const supRes = await api("POST", "/supplier", {
    name: SUPPLIER_NAME,
    organizationNumber: ORG_NR,
    postalAddress: { addressLine1: "Fjordveien 86", postalCode: "3015", city: "Drammen" },
    bankAccountPresentation: [{ bban: "36204404121" }],
  });
  const supplier = supRes.value;
  const supplierId = supplier.id;
  const supplierLedgerAccountId = supplier.ledgerAccount.id;
  console.log(`[Call ${callCount}] Supplier ID: ${supplierId}, Ledger Account ID: ${supplierLedgerAccountId}`);

  // Call 2: GET /ledger/account (still required - can't use account by number alone)
  callCount++;
  const acctRes = await api("GET", `/ledger/account?number=${EXPENSE_ACCOUNT_NR}&isApplicableForSupplierInvoice=true&fields=*`);
  const expenseAccountId = acctRes.values[0].id;
  console.log(`[Call ${callCount}] Expense Account ID: ${expenseAccountId}`);

  // Call 3: POST /ledger/voucher/importDocument (skip vatType lookup!)
  callCount++;
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${INVOICE_NR}</cbc:ID>
  <cbc:IssueDate>${INVOICE_DATE}</cbc:IssueDate>
  <cbc:DueDate>${DUE_DATE}</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>NOK</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0192">${ORG_NR}</cbc:EndpointID>
      <cac:PartyName><cbc:Name>${SUPPLIER_NAME}</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>Fjordveien 86</cbc:StreetName>
        <cbc:CityName>Drammen</cbc:CityName>
        <cbc:PostalZone>3015</cbc:PostalZone>
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
        <cbc:StreetName>Testveien 1</cbc:StreetName>
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

  const formData = new FormData();
  formData.append("file", new Blob([xml], { type: "application/xml" }), "invoice.xml");
  const importRes = await api("POST", "/ledger/voucher/importDocument", formData);
  const voucher = importRes.values[0];
  const voucherId = voucher.id;
  const voucherVersion = voucher.version;
  console.log(`[Call ${callCount}] Voucher ID: ${voucherId}, Version: ${voucherVersion}`);

  // Call 4: PUT /ledger/voucher/{id} with hard-coded vatType.id=1
  callCount++;
  const putBody = {
    version: voucherVersion,
    postings: [
      {
        row: 1,
        account: { id: expenseAccountId },
        description: DESCRIPTION,
        vatType: { id: 1 }, // HARD-CODED: 25% incoming VAT is always id=1
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
  };

  const putRes = await api("PUT", `/ledger/voucher/${voucherId}?sendToLedger=false`, putBody);
  const finalVoucher = putRes.value;
  console.log(`[Call ${callCount}] PUT succeeded`);
  console.log("\nFinal voucher postings:");
  for (const p of finalVoucher.postings) {
    console.log(`  row=${p.row} account=${p.account?.number} amount=${p.amount} amountGross=${p.amountGross} vatType.id=${p.vatType?.id} vatType.number=${p.vatType?.number} supplier=${p.supplier?.id}`);
  }

  console.log(`\n=== PROOF COMPLETE: ${callCount} API calls, 0 errors ===`);
  console.log(`Supplier: ${supplierId}`);
  console.log(`Voucher: ${voucherId}`);
}

main().catch((e) => { console.error("FATAL:", e.message); process.exit(1); });
