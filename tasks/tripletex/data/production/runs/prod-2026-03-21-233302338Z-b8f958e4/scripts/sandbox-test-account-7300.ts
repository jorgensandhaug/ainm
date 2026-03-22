const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

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

// Test 1: Verify account 7300 exists and is applicable for supplier invoices
const acctRes = await api("GET", `/ledger/account?number=7300&isApplicableForSupplierInvoice=true&fields=*`);
console.log(`Account 7300: id=${acctRes.values[0]?.id}, name="${acctRes.values[0]?.name}"`);

// Test 2: Full 5-call proof with account 7300
const ts = Date.now();
const supplierRes = await api("POST", "/supplier", {
  name: `SandboxProof7300-${ts}`,
  organizationNumber: "938165742",
});
const suppId = supplierRes.value.id;
const supLedgAcct = supplierRes.value.ledgerAccount.id;
console.log(`Supplier ${suppId}, ledger ${supLedgAcct}`);

const expAcctId = acctRes.values[0].id;

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>INV-SBX-7300-${ts}</cbc:ID>
  <cbc:IssueDate>2026-03-22</cbc:IssueDate>
  <cbc:DueDate>2026-03-22</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>NOK</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0192">938165742</cbc:EndpointID>
      <cac:PartyName><cbc:Name>SandboxProof7300</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>Test</cbc:StreetName><cbc:CityName>Oslo</cbc:CityName><cbc:PostalZone>0001</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>NO938165742MVA</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity><cbc:RegistrationName>SandboxProof7300</cbc:RegistrationName><cbc:CompanyID schemeID="0192">938165742</cbc:CompanyID></cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0192">123456785</cbc:EndpointID>
      <cac:PartyName><cbc:Name>Mitt Selskap AS</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>Testveien 1</cbc:StreetName><cbc:CityName>Oslo</cbc:CityName><cbc:PostalZone>0001</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyLegalEntity><cbc:RegistrationName>Mitt Selskap AS</cbc:RegistrationName></cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="NOK">6530</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="NOK">26120</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="NOK">6530</cbc:TaxAmount>
      <cac:TaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>25</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="NOK">26120</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="NOK">26120</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="NOK">32650</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="NOK">32650</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  <cac:InvoiceLine>
    <cbc:ID>1</cbc:ID>
    <cbc:InvoicedQuantity unitCode="EA">1</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="NOK">26120</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Name>services de bureau</cbc:Name>
      <cac:ClassifiedTaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>25</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="NOK">26120</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>
</Invoice>`;

const formData = new FormData();
formData.append("file", new Blob([xml], { type: "application/xml" }), `INV-SBX-7300-${ts}.xml`);
const importRes = await api("POST", "/ledger/voucher/importDocument", formData, true);
const vId = importRes.values[0].id;
let vVer = importRes.values[0].version;
console.log(`Voucher ${vId}, version ${vVer}`);

const putRes = await api("PUT", `/ledger/voucher/${vId}?sendToLedger=false`, {
  version: vVer,
  postings: [
    { row: 1, account: { id: expAcctId }, description: "services de bureau", vatType: { id: 1 }, amount: 26120, amountCurrency: 26120, amountGross: 32650, amountGrossCurrency: 32650 },
    { row: 2, account: { id: supLedgAcct }, supplier: { id: suppId }, description: "services de bureau", amount: -32650, amountCurrency: -32650, amountGross: -32650, amountGrossCurrency: -32650, invoiceNumber: `INV-SBX-7300-${ts}`, termOfPayment: "2026-03-22" },
  ],
});
vVer = putRes.value.version;
console.log(`Postings OK, version ${vVer}`);
for (const p of putRes.value.postings) {
  console.log(`  row=${p.row} acct=${p.account?.number} amt=${p.amount} amtGross=${p.amountGross} vatType=${p.vatType?.id}`);
}

const bookRes = await api("PUT", `/ledger/voucher/${vId}?sendToLedger=true`, { version: vVer });
console.log(`Booked: number=${bookRes.value.number}, version=${bookRes.value.version}`);
console.log("Sandbox 5-call proof with account 7300 PASSED");
