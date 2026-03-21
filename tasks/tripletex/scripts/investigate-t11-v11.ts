// Investigate task 11 - Part 11: DEEP COMPARISON
// Create both an EHF-imported voucher AND a direct POST voucher
// and compare ALL fields to find what's different

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };

const ts = Date.now();
const DATE = "2026-03-21";
const GROSS = 42100;
const NET = 33680;
const VAT_AMT = 8420;
const ORG_NR = "976098897";
const DESCRIPTION = "kontortjenester";

// Get expense account
const acctRes = await fetch(`${BASE}/ledger/account?number=6540&isApplicableForSupplierInvoice=true&fields=*`, { headers: H });
const acctData = await acctRes.json();
const expAcctId = acctData.values[0].id;

// Get voucherType
const vtRes = await fetch(`${BASE}/ledger/voucherType?name=Leverandørfaktura&fields=*`, { headers: H });
const vtData = await vtRes.json();
const vtId = vtData.values[0].id;

// ============================================================
// Create BOTH approaches
// ============================================================

// --- DIRECT POST VOUCHER ---
console.log("=== DIRECT POST /ledger/voucher ===");
const supDRes = await fetch(`${BASE}/supplier`, {
  method: "POST", headers: H,
  body: JSON.stringify({ name: `Direct ${ts}`, organizationNumber: ORG_NR }),
});
const supDData = await supDRes.json();
const supDId = supDData.value.id;
const supDLedger = supDData.value.ledgerAccount.id;

const vDRes = await fetch(`${BASE}/ledger/voucher`, {
  method: "POST", headers: H,
  body: JSON.stringify({
    date: DATE,
    description: DESCRIPTION,
    voucherType: { id: vtId },
    postings: [
      { row: 1, account: { id: expAcctId }, description: DESCRIPTION, vatType: { id: 1 }, amount: NET, amountCurrency: NET, amountGross: GROSS, amountGrossCurrency: GROSS },
      { row: 2, account: { id: supDLedger }, supplier: { id: supDId }, description: DESCRIPTION, amount: -GROSS, amountCurrency: -GROSS, amountGross: -GROSS, amountGrossCurrency: -GROSS, invoiceNumber: `INV-D-${ts}`, termOfPayment: DATE },
    ],
  }),
});
const vDData = await vDRes.json();
const directVId = vDData.value.id;
console.log("Direct voucher:", directVId, "number:", vDData.value.number);

// --- EHF IMPORT ---
console.log("\n=== EHF IMPORT ===");
const supERes = await fetch(`${BASE}/supplier`, {
  method: "POST", headers: H,
  body: JSON.stringify({ name: `EHF ${ts}`, organizationNumber: "810079468" }),
});
const supEData = await supERes.json();
const supEId = supEData.value.id;
const supELedger = supEData.value.ledgerAccount.id;

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>INV-E-${ts}</cbc:ID><cbc:IssueDate>${DATE}</cbc:IssueDate><cbc:DueDate>${DATE}</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode><cbc:DocumentCurrencyCode>NOK</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty><cac:Party><cbc:EndpointID schemeID="0192">810079468</cbc:EndpointID><cac:PartyName><cbc:Name>EHF ${ts}</cbc:Name></cac:PartyName><cac:PostalAddress><cbc:StreetName>G 1</cbc:StreetName><cbc:CityName>Oslo</cbc:CityName><cbc:PostalZone>0001</cbc:PostalZone><cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country></cac:PostalAddress><cac:PartyTaxScheme><cbc:CompanyID>NO810079468MVA</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme><cac:PartyLegalEntity><cbc:RegistrationName>EHF ${ts}</cbc:RegistrationName><cbc:CompanyID schemeID="0192">810079468</cbc:CompanyID></cac:PartyLegalEntity></cac:Party></cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty><cac:Party><cbc:EndpointID schemeID="0192">999999999</cbc:EndpointID><cac:PartyName><cbc:Name>My Co</cbc:Name></cac:PartyName><cac:PostalAddress><cbc:StreetName>T 1</cbc:StreetName><cbc:CityName>Oslo</cbc:CityName><cbc:PostalZone>0001</cbc:PostalZone><cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country></cac:PostalAddress><cac:PartyLegalEntity><cbc:RegistrationName>My Co</cbc:RegistrationName><cbc:CompanyID schemeID="0192">999999999</cbc:CompanyID></cac:PartyLegalEntity></cac:Party></cac:AccountingCustomerParty>
  <cac:TaxTotal><cbc:TaxAmount currencyID="NOK">${VAT_AMT}</cbc:TaxAmount><cac:TaxSubtotal><cbc:TaxableAmount currencyID="NOK">${NET}</cbc:TaxableAmount><cbc:TaxAmount currencyID="NOK">${VAT_AMT}</cbc:TaxAmount><cac:TaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>25</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory></cac:TaxSubtotal></cac:TaxTotal>
  <cac:LegalMonetaryTotal><cbc:LineExtensionAmount currencyID="NOK">${NET}</cbc:LineExtensionAmount><cbc:TaxExclusiveAmount currencyID="NOK">${NET}</cbc:TaxExclusiveAmount><cbc:TaxInclusiveAmount currencyID="NOK">${GROSS}</cbc:TaxInclusiveAmount><cbc:PayableAmount currencyID="NOK">${GROSS}</cbc:PayableAmount></cac:LegalMonetaryTotal>
  <cac:InvoiceLine><cbc:ID>1</cbc:ID><cbc:InvoicedQuantity unitCode="EA">1</cbc:InvoicedQuantity><cbc:LineExtensionAmount currencyID="NOK">${NET}</cbc:LineExtensionAmount><cac:Item><cbc:Name>${DESCRIPTION}</cbc:Name><cac:ClassifiedTaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>25</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory></cac:Item><cac:Price><cbc:PriceAmount currencyID="NOK">${NET}</cbc:PriceAmount></cac:Price></cac:InvoiceLine>
</Invoice>`;

const formData = new FormData();
formData.append("file", new Blob([xml], { type: "application/xml" }), "invoice.xml");
const importRes = await fetch(`${BASE}/ledger/voucher/importDocument`, {
  method: "POST", headers: { Authorization: AUTH }, body: formData,
});
const importData = await importRes.json();
const ehfVId = importData.values[0].id;
console.log("EHF voucher:", ehfVId);

// Set postings + book
const putRes = await fetch(`${BASE}/ledger/voucher/${ehfVId}?sendToLedger=false`, {
  method: "PUT", headers: H,
  body: JSON.stringify({
    version: importData.values[0].version,
    postings: [
      { row: 1, account: { id: expAcctId }, description: DESCRIPTION, vatType: { id: 1 }, amount: NET, amountCurrency: NET, amountGross: GROSS, amountGrossCurrency: GROSS },
      { row: 2, account: { id: supELedger }, supplier: { id: supEId }, description: DESCRIPTION, amount: -GROSS, amountCurrency: -GROSS, amountGross: -GROSS, amountGrossCurrency: -GROSS, invoiceNumber: `INV-E-${ts}`, termOfPayment: DATE },
    ],
  }),
});
const putData = await putRes.json();
const bookRes = await fetch(`${BASE}/ledger/voucher/${ehfVId}?sendToLedger=true`, {
  method: "PUT", headers: H,
  body: JSON.stringify({ version: putData.value.version }),
});
const bookData = await bookRes.json();
console.log("EHF booked, number:", bookData.value?.number);

// ============================================================
// COMPARE: Full voucher details
// ============================================================
console.log("\n\n=== COMPARISON ===");
const fields = "*,postings(*,account(*),vatType(*),supplier(*),currency(*)),voucherType(*)";

const dRes = await fetch(`${BASE}/ledger/voucher/${directVId}?fields=${fields}`, { headers: H });
const dData = await dRes.json();
const eRes = await fetch(`${BASE}/ledger/voucher/${ehfVId}?fields=${fields}`, { headers: H });
const eData = await eRes.json();

const dv = dData.value;
const ev = eData.value;

console.log("Field                    | Direct                | EHF");
console.log("-------------------------|-----------------------|---");
console.log(`number                   | ${dv.number}                     | ${ev.number}`);
console.log(`description              | ${dv.description?.substring(0,30)} | ${ev.description?.substring(0,30)}`);
console.log(`voucherType.id           | ${dv.voucherType?.id}             | ${ev.voucherType?.id}`);
console.log(`voucherType.name         | ${dv.voucherType?.name} | ${ev.voucherType?.name}`);
console.log(`vendorInvoiceNumber      | ${dv.vendorInvoiceNumber}              | ${ev.vendorInvoiceNumber}`);
console.log(`document                 | ${dv.document?.id || 'null'}              | ${ev.document?.id || 'null'}`);
console.log(`attachment               | ${dv.attachment?.id || 'null'}              | ${ev.attachment?.id || 'null'}`);
console.log(`ediDocument              | ${dv.ediDocument?.id || 'null'}              | ${ev.ediDocument?.id || 'null'}`);
console.log(`externalVoucherNumber    | ${JSON.stringify(dv.externalVoucherNumber)} | ${JSON.stringify(ev.externalVoucherNumber)}`);
console.log(`supplierVoucherType      | ${dv.supplierVoucherType || 'null'}              | ${ev.supplierVoucherType || 'null'}`);
console.log(`wasAutoMatched           | ${dv.wasAutoMatched}              | ${ev.wasAutoMatched}`);
console.log(`numberAsString           | ${dv.numberAsString}              | ${ev.numberAsString}`);

console.log("\n--- Postings comparison ---");
for (const p of dv.postings || []) {
  console.log(`DIRECT row=${p.row} acct=${p.account?.number} (${p.account?.name?.substring(0,15)}) amt=${p.amount} gross=${p.amountGross} vat=${p.vatType?.number}(${p.vatType?.name?.substring(0,20)}) sup=${p.supplier?.id || '-'} inv=${p.invoiceNumber || '-'} term=${p.termOfPayment || '-'} sysGen=${p.systemGenerated}`);
}
console.log("---");
for (const p of ev.postings || []) {
  console.log(`EHF    row=${p.row} acct=${p.account?.number} (${p.account?.name?.substring(0,15)}) amt=${p.amount} gross=${p.amountGross} vat=${p.vatType?.number}(${p.vatType?.name?.substring(0,20)}) sup=${p.supplier?.id || '-'} inv=${p.invoiceNumber || '-'} term=${p.termOfPayment || '-'} sysGen=${p.systemGenerated}`);
}

// Check if supplierInvoice exists for direct
console.log("\n--- SupplierInvoice for direct voucher ---");
const siDRes = await fetch(`${BASE}/supplierInvoice?invoiceDateFrom=2026-01-01&invoiceDateTo=2026-12-31&voucherId=${directVId}&fields=id,invoiceNumber,amount`, { headers: H });
const siDData = await siDRes.json();
console.log("Count:", siDData.fullResultSize, siDData.values?.map((v: any) => `id=${v.id}`).join(', '));

console.log("\n--- SupplierInvoice for EHF voucher ---");
const siERes = await fetch(`${BASE}/supplierInvoice?invoiceDateFrom=2026-01-01&invoiceDateTo=2026-12-31&voucherId=${ehfVId}&fields=id,invoiceNumber,amount`, { headers: H });
const siEData = await siERes.json();
console.log("Count:", siEData.fullResultSize, siEData.values?.map((v: any) => `id=${v.id} inv=${v.invoiceNumber} amt=${v.amount}`).join(', '));
