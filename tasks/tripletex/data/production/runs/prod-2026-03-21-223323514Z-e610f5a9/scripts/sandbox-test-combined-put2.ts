// Test: can we PUT postings with sendToLedger=true in one call?
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const headers = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any, isFormData = false) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: isFormData ? { Authorization: AUTH } : headers };
  if (body) opts.body = isFormData ? body : JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  console.log(`${method} ${path} → ${res.status}`);
  if (!res.ok) { console.log(text.slice(0, 600)); }
  return { status: res.status, data: text ? JSON.parse(text) : null };
}

async function main() {
  const ORG = "987654325"; // valid mod11
  const suppRes = await api("POST", "/supplier", { name: "Sandbox CombinedPut2 AS", organizationNumber: ORG });
  if (suppRes.status !== 201) { console.log("Supplier failed"); return; }
  const supplierId = suppRes.data.value.id;
  const supplierLedgerAcctId = suppRes.data.value.ledgerAccount.id;

  const acctRes = await api("GET", "/ledger/account?number=6590&isApplicableForSupplierInvoice=true&fields=*");
  const expAcctId = acctRes.data.values[0].id;

  const NET = 8000, GROSS = 10000, VAT = 2000, DATE = "2026-03-21", INV = "SBX-COMB2-001";
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${INV}</cbc:ID>
  <cbc:IssueDate>${DATE}</cbc:IssueDate>
  <cbc:DueDate>${DATE}</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>NOK</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0192">${ORG}</cbc:EndpointID>
      <cac:PostalAddress><cbc:StreetName>Gate 1</cbc:StreetName><cbc:CityName>Oslo</cbc:CityName><cbc:PostalZone>0001</cbc:PostalZone><cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
      <cac:PartyTaxScheme><cbc:CompanyID>NO${ORG}MVA</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>
      <cac:PartyLegalEntity><cbc:RegistrationName>Sandbox CombinedPut2 AS</cbc:RegistrationName><cbc:CompanyID schemeID="0192">${ORG}</cbc:CompanyID></cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0192">123456785</cbc:EndpointID>
      <cac:PostalAddress><cbc:StreetName>Kundeveien 1</cbc:StreetName><cbc:CityName>Oslo</cbc:CityName><cbc:PostalZone>0001</cbc:PostalZone><cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
      <cac:PartyLegalEntity><cbc:RegistrationName>Buyer AS</cbc:RegistrationName><cbc:CompanyID schemeID="0192">123456785</cbc:CompanyID></cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="NOK">${VAT}</cbc:TaxAmount>
    <cac:TaxSubtotal><cbc:TaxableAmount currencyID="NOK">${NET}</cbc:TaxableAmount><cbc:TaxAmount currencyID="NOK">${VAT}</cbc:TaxAmount>
      <cac:TaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>25</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="NOK">${NET}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="NOK">${NET}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="NOK">${GROSS}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="NOK">${GROSS}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  <cac:InvoiceLine>
    <cbc:ID>1</cbc:ID><cbc:InvoicedQuantity unitCode="EA">1</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="NOK">${NET}</cbc:LineExtensionAmount>
    <cac:Item><cbc:Name>test services</cbc:Name><cac:ClassifiedTaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>25</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory></cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="NOK">${NET}</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>
</Invoice>`;

  const fd = new FormData();
  fd.append("file", new Blob([xml], { type: "application/xml" }), `${INV}.xml`);
  const importRes = await api("POST", "/ledger/voucher/importDocument", fd, true);
  if (importRes.status !== 201) { console.log("Import failed"); return; }
  const vid = importRes.data.values[0].id;
  let ver = importRes.data.values[0].version;
  console.log(`Voucher id=${vid}, version=${ver}`);

  // TEST: Combined postings + sendToLedger=true
  console.log("\n=== TEST: postings + sendToLedger=true ===");
  const res = await api("PUT", `/ledger/voucher/${vid}?sendToLedger=true`, {
    version: ver,
    postings: [
      { row: 1, account: { id: expAcctId }, description: "test services", vatType: { id: 1 },
        amount: NET, amountCurrency: NET, amountGross: GROSS, amountGrossCurrency: GROSS },
      { row: 2, account: { id: supplierLedgerAcctId }, supplier: { id: supplierId }, description: "test services",
        amount: -GROSS, amountCurrency: -GROSS, amountGross: -GROSS, amountGrossCurrency: -GROSS,
        invoiceNumber: INV, termOfPayment: DATE },
    ],
  });

  if (res.status === 200) {
    console.log("SUCCESS: combined PUT works!");
    console.log(`number=${res.data.value.number}, version=${res.data.value.version}`);
    const postings = res.data.value.postings?.map((p: any) => ({
      row: p.row, acct: p.account?.number, amount: p.amount, amountGross: p.amountGross, vatType: p.vatType?.id
    }));
    console.log("Postings:", JSON.stringify(postings));
  } else {
    console.log("FAILED: combined PUT does NOT work");
  }
}

main().catch(e => { console.error(e); process.exit(1); });
