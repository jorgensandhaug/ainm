// Sandbox verification: confirm that the full buyer block with PostalAddress + PartyTaxScheme works
// and that the minimal buyer block WITHOUT PostalAddress fails with BR-10
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const uniqueSuffix = Date.now().toString().slice(-6);

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: { Authorization: AUTH } };
  if (body instanceof FormData) {
    opts.body = body;
  } else if (body) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  const r = await fetch(url, opts);
  const text = await r.text();
  console.log(`${method} ${path} → ${r.status}`);
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  if (!r.ok) { console.log("ERROR:", JSON.stringify(json).slice(0, 500)); }
  return { ok: r.ok, status: r.status, data: json };
}

function makeXml(includePostalAddress: boolean, includeTaxScheme: boolean): string {
  const customerBlock = `
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0192">999999999</cbc:EndpointID>${includePostalAddress ? `
      <cac:PostalAddress>
        <cbc:StreetName>Testveien 1</cbc:StreetName>
        <cbc:CityName>Oslo</cbc:CityName>
        <cbc:PostalZone>0001</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>` : ''}${includeTaxScheme ? `
      <cac:PartyTaxScheme>
        <cbc:CompanyID>NO999999999MVA</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>` : ''}
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>Ditt firma</cbc:RegistrationName>
        <cbc:CompanyID schemeID="0192">999999999</cbc:CompanyID>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>INV-SANDBOX-BUYER-${uniqueSuffix}</cbc:ID>
  <cbc:IssueDate>2026-03-21</cbc:IssueDate>
  <cbc:DueDate>2026-04-21</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>NOK</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0192">804872205</cbc:EndpointID>
      <cac:PostalAddress>
        <cbc:StreetName>Solveien 92</cbc:StreetName>
        <cbc:CityName>Bodø</cbc:CityName>
        <cbc:PostalZone>8006</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>NO804872205MVA</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>Fjelltopp AS</cbc:RegistrationName>
        <cbc:CompanyID schemeID="0192">804872205</cbc:CompanyID>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
${customerBlock}
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="NOK">12100.00</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="NOK">48400.00</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="NOK">12100.00</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>25</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="NOK">48400.00</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="NOK">48400.00</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="NOK">60500.00</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="NOK">60500.00</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  <cac:InvoiceLine>
    <cbc:ID>1</cbc:ID>
    <cbc:InvoicedQuantity unitCode="EA">1</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="NOK">48400.00</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Name>Nettverkstjenester</cbc:Name>
      <cac:ClassifiedTaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>25</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="NOK">48400.00</cbc:PriceAmount>
    </cac:Price>
  </cac:InvoiceLine>
</Invoice>`;
}

async function testImport(label: string, xml: string): Promise<boolean> {
  console.log(`\n=== TEST: ${label} ===`);
  const formData = new FormData();
  formData.append("file", new Blob([xml], { type: "application/xml" }), "invoice.xml");
  const res = await api("POST", "/ledger/voucher/importDocument", formData);
  return res.ok;
}

async function main() {
  // Test 1: Without PostalAddress (should fail with BR-10)
  const xml1 = makeXml(false, false);
  const r1 = await testImport("No PostalAddress, No TaxScheme", xml1);

  // Test 2: With PostalAddress, without TaxScheme
  const xml2 = makeXml(true, false);
  const r2 = await testImport("With PostalAddress, No TaxScheme", xml2);

  // Test 3: With PostalAddress and TaxScheme (full)
  const xml3 = makeXml(true, true);
  const r3 = await testImport("With PostalAddress and TaxScheme (full)", xml3);

  console.log("\n=== RESULTS ===");
  console.log("No PostalAddress, No TaxScheme:", r1 ? "OK" : "FAILED");
  console.log("With PostalAddress, No TaxScheme:", r2 ? "OK" : "FAILED");
  console.log("With PostalAddress and TaxScheme:", r3 ? "OK" : "FAILED");
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
