/**
 * Investigate kidOrReceiverReference:
 * 1. Does PaymentID in XML actually set kidOrReceiverReference?
 * 2. Does booking affect kidOrReceiverReference?
 * 3. Can we SET it via PUT /supplierInvoice?
 * 4. Does the Note element in XML set it?
 */

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: { Authorization: AUTH, "Content-Type": "application/json" } };
  if (body && !(body instanceof FormData)) opts.body = body;
  if (body instanceof FormData) { opts.headers = { Authorization: AUTH }; }
  const res = await fetch(url, opts);
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  if (res.status >= 400) console.log(`❌ ${method} ${path} => ${res.status}: ${JSON.stringify(data).slice(0, 300)}`);
  else console.log(`✅ ${method} ${path} => ${res.status}`);
  return { status: res.status, data };
}

async function main() {
  const TS = Date.now();

  // First: look at existing SIs that DO have kidOrReceiverReference populated
  console.log("=== CHECK EXISTING SIs WITH NON-EMPTY kidOrReceiverReference ===");
  const allSi = await api("GET", "/supplierInvoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2027-12-31&count=200&fields=id,invoiceNumber,kidOrReceiverReference,invoiceDueDate,voucher(*)");
  const sis = allSi.data?.values || [];
  const withKid = sis.filter((si: any) => si.kidOrReceiverReference && si.kidOrReceiverReference.trim() !== "");
  console.log(`Total SIs: ${sis.length}, with kidOrReceiverReference: ${withKid.length}`);
  for (const si of withKid.slice(0, 10)) {
    console.log(`  SI id=${si.id} inv#=${si.invoiceNumber} kid="${si.kidOrReceiverReference}" voucherNum=${si.voucher?.number}`);
  }

  // Look at the most recent SI we just created (from 201 script) - confirm kid is empty
  const recentSi = sis[sis.length - 1];
  console.log(`\nMost recent SI: id=${recentSi?.id} inv#=${recentSi?.invoiceNumber} kid="${recentSi?.kidOrReceiverReference}"`);

  // Test: can we PUT kidOrReceiverReference on a supplier invoice?
  console.log("\n=== TEST: PUT /supplierInvoice to set kidOrReceiverReference ===");
  if (recentSi) {
    // Get full SI first
    const siFull = await api("GET", `/supplierInvoice/${recentSi.id}?fields=*`);
    const siVer = siFull.data?.value?.version;
    console.log(`  Current version: ${siVer}, current kid: "${siFull.data?.value?.kidOrReceiverReference}"`);

    // Try PUT
    const putRes = await api("PUT", `/supplierInvoice/${recentSi.id}`, JSON.stringify({
      id: recentSi.id,
      version: siVer,
      kidOrReceiverReference: recentSi.invoiceNumber,
    }));
    console.log(`  PUT result: ${putRes.status}`);
    if (putRes.status < 400) {
      console.log(`  New kid: "${putRes.data?.value?.kidOrReceiverReference}"`);
    }
  }

  // Test: Create a new import with PaymentID and check kid
  // Use a completely different org number from buyer
  console.log("\n=== TEST: New import with PaymentID (different org number) ===");
  const INV_NUM = `INV-KID-TEST-${TS}`;
  const SUPP_ORG = "913175212"; // different from buyer 987654325

  // Create supplier
  const supRes = await api("POST", "/supplier", JSON.stringify({
    name: `KID Test Supplier ${TS}`,
    organizationNumber: SUPP_ORG,
    postalAddress: { addressLine1: "Test 1", postalCode: "0155", city: "Oslo", country: { id: 161 } },
    physicalAddress: { addressLine1: "Test 1", postalCode: "0155", city: "Oslo", country: { id: 161 } },
  }));
  const suppId = supRes.data?.value?.id;

  // Create XML with PaymentID
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${INV_NUM}</cbc:ID>
  <cbc:IssueDate>2026-03-22</cbc:IssueDate>
  <cbc:DueDate>2026-04-21</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>NOK</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty><cac:Party>
    <cbc:EndpointID schemeID="0192">${SUPP_ORG}</cbc:EndpointID>
    <cac:PartyIdentification><cbc:ID schemeID="0192">${SUPP_ORG}</cbc:ID></cac:PartyIdentification>
    <cac:PartyName><cbc:Name>KID Test Supplier ${TS}</cbc:Name></cac:PartyName>
    <cac:PostalAddress><cbc:StreetName>Test 1</cbc:StreetName><cbc:CityName>Oslo</cbc:CityName><cbc:PostalZone>0155</cbc:PostalZone><cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
    <cac:PartyTaxScheme><cbc:CompanyID>NO${SUPP_ORG}MVA</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>
    <cac:PartyLegalEntity><cbc:RegistrationName>KID Test Supplier ${TS}</cbc:RegistrationName><cbc:CompanyID schemeID="0192">${SUPP_ORG}</cbc:CompanyID></cac:PartyLegalEntity>
  </cac:Party></cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty><cac:Party>
    <cbc:EndpointID schemeID="0192">987654325</cbc:EndpointID>
    <cac:PartyIdentification><cbc:ID schemeID="0192">987654325</cbc:ID></cac:PartyIdentification>
    <cac:PartyName><cbc:Name>Buyer AS</cbc:Name></cac:PartyName>
    <cac:PostalAddress><cbc:StreetName>Gate 1</cbc:StreetName><cbc:CityName>Oslo</cbc:CityName><cbc:PostalZone>0001</cbc:PostalZone><cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
    <cac:PartyLegalEntity><cbc:RegistrationName>Buyer AS</cbc:RegistrationName><cbc:CompanyID schemeID="0192">987654325</cbc:CompanyID></cac:PartyLegalEntity>
  </cac:Party></cac:AccountingCustomerParty>
  <cac:PaymentMeans>
    <cbc:PaymentMeansCode>30</cbc:PaymentMeansCode>
    <cbc:PaymentID>${INV_NUM}</cbc:PaymentID>
    <cac:PayeeFinancialAccount><cbc:ID>NO0000000000000</cbc:ID></cac:PayeeFinancialAccount>
  </cac:PaymentMeans>
  <cac:TaxTotal><cbc:TaxAmount currencyID="NOK">1000.00</cbc:TaxAmount>
    <cac:TaxSubtotal><cbc:TaxableAmount currencyID="NOK">4000.00</cbc:TaxableAmount><cbc:TaxAmount currencyID="NOK">1000.00</cbc:TaxAmount><cac:TaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>25</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory></cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="NOK">4000.00</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="NOK">4000.00</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="NOK">5000.00</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="NOK">5000.00</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  <cac:InvoiceLine><cbc:ID>1</cbc:ID><cbc:InvoicedQuantity unitCode="EA">1</cbc:InvoicedQuantity><cbc:LineExtensionAmount currencyID="NOK">4000.00</cbc:LineExtensionAmount>
    <cac:Item><cbc:Name>test service</cbc:Name><cac:ClassifiedTaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>25</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory></cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="NOK">4000.00</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>
</Invoice>`;

  const form = new FormData();
  form.append("file", new Blob([xml], { type: "application/xml" }), `${INV_NUM}.xml`);
  const importRes = await api("POST", "/ledger/voucher/importDocument", form);
  const voucherId = importRes.data?.values?.[0]?.id;
  console.log(`  Voucher ID: ${voucherId}`);

  if (voucherId) {
    // Check SI immediately (before any PUT)
    const siCheck = await api("GET", `/supplierInvoice?voucherId=${voucherId}&invoiceDateFrom=2026-01-01&invoiceDateTo=2026-12-31&fields=*`);
    const si = siCheck.data?.values?.[0];
    console.log(`  SI kidOrReceiverReference BEFORE put: "${si?.kidOrReceiverReference}"`);
    console.log(`  SI invoiceNumber: "${si?.invoiceNumber}"`);
    console.log(`  SI invoiceDueDate: "${si?.invoiceDueDate}"`);

    // Try to PUT kidOrReceiverReference on this SI
    if (si) {
      const putKid = await api("PUT", `/supplierInvoice/${si.id}`, JSON.stringify({
        id: si.id,
        version: si.version,
        kidOrReceiverReference: INV_NUM,
      }));
      console.log(`  PUT kidOrReceiverReference: ${putKid.status}`);
      if (putKid.status < 400) {
        console.log(`  New kid: "${putKid.data?.value?.kidOrReceiverReference}"`);
      }
    }
  }

  // Check: does supplier have a real bank account? maybe KID only populates with valid BBAN
  console.log("\n=== TEST: Import with real-looking BBAN in PaymentMeans ===");
  const INV_NUM2 = `INV-KID2-${TS}`;
  const xml2 = xml.replace(INV_NUM, INV_NUM2).replace("NO0000000000000", "12345678903"); // real BBAN
  const form2 = new FormData();
  form2.append("file", new Blob([xml2], { type: "application/xml" }), `${INV_NUM2}.xml`);
  const importRes2 = await api("POST", "/ledger/voucher/importDocument", form2);
  const voucherId2 = importRes2.data?.values?.[0]?.id;
  if (voucherId2) {
    const siCheck2 = await api("GET", `/supplierInvoice?voucherId=${voucherId2}&invoiceDateFrom=2026-01-01&invoiceDateTo=2026-12-31&fields=*`);
    const si2 = siCheck2.data?.values?.[0];
    console.log(`  SI kid with BBAN: "${si2?.kidOrReceiverReference}"`);
  }

  // Check: use PaymentMeansCode=31 (credit transfer) instead of 30
  console.log("\n=== TEST: PaymentMeansCode=31 instead of 30 ===");
  const INV_NUM3 = `INV-KID3-${TS}`;
  const xml3 = xml.replace(INV_NUM, INV_NUM3).replace("PaymentMeansCode>30<", "PaymentMeansCode>31<");
  const form3 = new FormData();
  form3.append("file", new Blob([xml3], { type: "application/xml" }), `${INV_NUM3}.xml`);
  const importRes3 = await api("POST", "/ledger/voucher/importDocument", form3);
  const voucherId3 = importRes3.data?.values?.[0]?.id;
  if (voucherId3) {
    const siCheck3 = await api("GET", `/supplierInvoice?voucherId=${voucherId3}&invoiceDateFrom=2026-01-01&invoiceDateTo=2026-12-31&fields=*`);
    const si3 = siCheck3.data?.values?.[0];
    console.log(`  SI kid with PMC=31: "${si3?.kidOrReceiverReference}"`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
