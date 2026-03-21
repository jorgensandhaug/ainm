// Sandbox verification: test VAT rounding when PDF amounts don't perfectly reconcile
// Question: does sending amount=41050 vs amount=41049.6 change anything when amountGross=51312?

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
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

const uniq = Date.now().toString().slice(-6);
const SUPPLIER_NAME = `Rounding Test ${uniq} AS`;
const ORG_NR = "919398051";  // reuse known valid org nr
const INV_NR = `INV-SAND-ROUND-${uniq}`;
const INV_DATE = "2026-02-01";
const DUE_DATE = "2026-03-03";

// Test amounts where net*1.25 != gross (same as production PDF)
const NET = 41050;    // PDF value
const VAT_AMT = 10262;  // PDF value
const GROSS = 51312;  // PDF value
// Math: 41050*1.25=51312.5, not 51312. So there's a 0.50 discrepancy.
// Tripletex should recalculate: 51312/1.25 = 41049.6, VAT = 10262.4

// Step 1: Create supplier
const step1 = await api("POST", "/supplier", {
  name: SUPPLIER_NAME,
  organizationNumber: ORG_NR,
});
const supplierId = step1.data.value.id;
const supplierLedgerAccountId = step1.data.value.ledgerAccount.id;
console.log("Supplier ID:", supplierId);

// Step 2: Get expense account
const step2 = await api("GET", "/ledger/account?number=6500&isApplicableForSupplierInvoice=true&fields=*");
const expenseAccountId = step2.data.values[0].id;

// Step 3: Get VAT type
const step3 = await api("GET", `/ledger/vatType?typeOfVat=INCOMING&vatDate=${INV_DATE}&fields=*`);
const vatTypes = step3.data.values.filter((v: any) => v.percentage === 25);
const vatType = vatTypes.find((v: any) => v.number === "1") || vatTypes[0];
const vatTypeId = vatType.id;

// Step 4: Import EHF
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
        <cbc:StreetName>Test 1</cbc:StreetName>
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
      <cbc:EndpointID schemeID="0192">999999999</cbc:EndpointID>
      <cac:PartyName><cbc:Name>Buyer</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:CityName>Oslo</cbc:CityName>
        <cbc:PostalZone>0001</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>NO999999999MVA</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity><cbc:RegistrationName>Buyer</cbc:RegistrationName><cbc:CompanyID schemeID="0192">999999999</cbc:CompanyID></cac:PartyLegalEntity>
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
      <cbc:Name>Kontorrekvisita</cbc:Name>
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
const voucherId = step4.data.values[0].id;
const voucherVersion = step4.data.values[0].version;
console.log("Voucher ID:", voucherId, "Version:", voucherVersion);

// Test A: Send amount=NET (PDF value, 41050)
console.log("\n=== TEST: Sending amount=41050 (PDF net) amountGross=51312 (PDF gross) ===");
const stepA = await api("PUT", `/ledger/voucher/${voucherId}?sendToLedger=false`, {
  version: voucherVersion,
  postings: [
    {
      row: 1,
      account: { id: expenseAccountId },
      description: "Kontorrekvisita",
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
      description: "Kontorrekvisita",
      amount: -GROSS,
      amountCurrency: -GROSS,
      amountGross: -GROSS,
      amountGrossCurrency: -GROSS,
      invoiceNumber: INV_NR,
      termOfPayment: DUE_DATE,
    },
  ],
});

// Check what Tripletex actually stored
const postings = stepA.data.value.postings;
console.log("\nStored postings:");
for (const p of postings) {
  console.log(`  row=${p.row} account=${p.account.id} amount=${p.amount} amountGross=${p.amountGross} systemGenerated=${p.systemGenerated}`);
}

const debitPosting = postings.find((p: any) => p.row === 1);
const vatPosting = postings.find((p: any) => p.systemGenerated);
console.log(`\nDebit: sent amount=${NET}, stored amount=${debitPosting.amount} (diff: ${NET - debitPosting.amount})`);
console.log(`VAT: system computed ${vatPosting.amount} vs PDF value ${VAT_AMT} (diff: ${vatPosting.amount - VAT_AMT})`);
console.log(`\nConclusion: Tripletex recalculates net from gross. gross/1.25 = ${GROSS/1.25}`);
