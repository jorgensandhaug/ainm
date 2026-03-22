/**
 * Test: Does PayeeFinancialAccount value affect kidOrReceiverReference?
 * Hypothesis: "NO0000000000000" (dummy) prevents kid from being set, but "12345678903" (valid) works.
 */

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: { Authorization: AUTH, "Content-Type": "application/json" } };
  if (body && !(body instanceof FormData)) opts.body = JSON.stringify(body);
  if (body instanceof FormData) { opts.body = body; opts.headers = { Authorization: AUTH }; }
  const res = await fetch(url, opts);
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}

function makeXml(invNum: string, suppName: string, suppOrg: string, bban: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${invNum}</cbc:ID>
  <cbc:IssueDate>2026-03-22</cbc:IssueDate>
  <cbc:DueDate>2026-04-21</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>NOK</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty><cac:Party>
    <cbc:EndpointID schemeID="0192">${suppOrg}</cbc:EndpointID>
    <cac:PartyIdentification><cbc:ID schemeID="0192">${suppOrg}</cbc:ID></cac:PartyIdentification>
    <cac:PartyName><cbc:Name>${suppName}</cbc:Name></cac:PartyName>
    <cac:PostalAddress><cbc:StreetName>T1</cbc:StreetName><cbc:CityName>Oslo</cbc:CityName><cbc:PostalZone>0155</cbc:PostalZone><cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
    <cac:PartyTaxScheme><cbc:CompanyID>NO${suppOrg}MVA</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>
    <cac:PartyLegalEntity><cbc:RegistrationName>${suppName}</cbc:RegistrationName><cbc:CompanyID schemeID="0192">${suppOrg}</cbc:CompanyID></cac:PartyLegalEntity>
  </cac:Party></cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty><cac:Party>
    <cbc:EndpointID schemeID="0192">987654325</cbc:EndpointID>
    <cac:PartyIdentification><cbc:ID schemeID="0192">987654325</cbc:ID></cac:PartyIdentification>
    <cac:PartyName><cbc:Name>Buyer AS</cbc:Name></cac:PartyName>
    <cac:PostalAddress><cbc:StreetName>G1</cbc:StreetName><cbc:CityName>Oslo</cbc:CityName><cbc:PostalZone>0001</cbc:PostalZone><cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
    <cac:PartyLegalEntity><cbc:RegistrationName>Buyer AS</cbc:RegistrationName><cbc:CompanyID schemeID="0192">987654325</cbc:CompanyID></cac:PartyLegalEntity>
  </cac:Party></cac:AccountingCustomerParty>
  <cac:PaymentMeans>
    <cbc:PaymentMeansCode>30</cbc:PaymentMeansCode>
    <cbc:PaymentID>${invNum}</cbc:PaymentID>
    <cac:PayeeFinancialAccount><cbc:ID>${bban}</cbc:ID></cac:PayeeFinancialAccount>
  </cac:PaymentMeans>
  <cac:TaxTotal><cbc:TaxAmount currencyID="NOK">2000.00</cbc:TaxAmount>
    <cac:TaxSubtotal><cbc:TaxableAmount currencyID="NOK">8000.00</cbc:TaxableAmount><cbc:TaxAmount currencyID="NOK">2000.00</cbc:TaxAmount><cac:TaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>25</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory></cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="NOK">8000.00</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="NOK">8000.00</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="NOK">10000.00</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="NOK">10000.00</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  <cac:InvoiceLine><cbc:ID>1</cbc:ID><cbc:InvoicedQuantity unitCode="EA">1</cbc:InvoicedQuantity><cbc:LineExtensionAmount currencyID="NOK">8000.00</cbc:LineExtensionAmount>
    <cac:Item><cbc:Name>test</cbc:Name><cac:ClassifiedTaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>25</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory></cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="NOK">8000.00</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>
</Invoice>`;
}

async function testImport(label: string, bban: string, suppOrg: string) {
  const ts = Date.now();
  const inv = `INV-${label}-${ts}`;
  const name = `${label}-${ts}`;

  // Create supplier
  await api("POST", "/supplier", { name, organizationNumber: suppOrg,
    postalAddress: { addressLine1: "T1", postalCode: "0155", city: "Oslo", country: { id: 161 } },
    physicalAddress: { addressLine1: "T1", postalCode: "0155", city: "Oslo", country: { id: 161 } } });

  // Import
  const xml = makeXml(inv, name, suppOrg, bban);
  const form = new FormData();
  form.append("file", new Blob([xml], { type: "application/xml" }), `${inv}.xml`);
  const impRes = await api("POST", "/ledger/voucher/importDocument", form);
  const vId = impRes.data?.values?.[0]?.id;

  // Check kid
  if (vId) {
    const siRes = await api("GET", `/supplierInvoice?voucherId=${vId}&invoiceDateFrom=2026-01-01&invoiceDateTo=2026-12-31&fields=*`);
    const si = siRes.data?.values?.[0];
    console.log(`  [${label}] BBAN="${bban}" suppOrg="${suppOrg}" => kid="${si?.kidOrReceiverReference}"`);
    return si?.kidOrReceiverReference;
  }
  return null;
}

async function main() {
  console.log("=== TESTING BBAN IMPACT ON kidOrReceiverReference ===\n");

  // Test 1: Valid Norwegian BBAN
  await testImport("VALID-BBAN", "12345678903", "913175212");

  // Test 2: Dummy "NO0000000000000"
  await testImport("DUMMY-NO", "NO0000000000000", "974178680");

  // Test 3: Short dummy "00000000000"
  await testImport("SHORT-DUMMY", "00000000000", "933672905");

  // Test 4: Same supplier org as buyer (987654325)
  await testImport("SAME-ORG", "12345678903", "987654325");

  // Test 5: IBAN format
  await testImport("IBAN", "NO9312345678903", "919234830");
}

main().catch(e => { console.error(e); process.exit(1); });
