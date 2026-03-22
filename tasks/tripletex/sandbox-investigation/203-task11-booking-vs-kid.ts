/**
 * CRITICAL HYPOTHESIS: Does BOOKING populate kidOrReceiverReference?
 *
 * Test: import with PaymentID → check kid → PUT postings → check kid → BOOK → check kid
 *
 * If kid only appears after booking, the "DO NOT BOOK" approach fundamentally
 * cannot pass check 3 or 4 (whichever checks kidOrReceiverReference).
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
  if (res.status >= 400) console.log(`❌ ${method} ${path} => ${res.status}: ${JSON.stringify(data).slice(0, 500)}`);
  else console.log(`✅ ${method} ${path} => ${res.status}`);
  return { status: res.status, data };
}

async function main() {
  const TS = Date.now();
  const INV = `INV-KIDTEST-${TS}`;
  const SUPP_NAME = `KidTest Supplier ${TS}`;
  const ORG = "913175212";
  const GROSS = 10000;
  const NET = 8000;
  const VAT = 2000;
  const DATE = "2026-03-22";
  const DUE = "2026-04-21";

  // Step 1: POST supplier
  const supRes = await api("POST", "/supplier", {
    name: SUPP_NAME,
    organizationNumber: ORG,
    postalAddress: { addressLine1: "Test 1", postalCode: "0155", city: "Oslo", country: { id: 161 } },
    physicalAddress: { addressLine1: "Test 1", postalCode: "0155", city: "Oslo", country: { id: 161 } },
  });
  const suppId = supRes.data?.value?.id;
  const suppLedgerId = supRes.data?.value?.ledgerAccount?.id;

  // Step 2: GET account
  const accRes = await api("GET", "/ledger/account?number=6300&fields=id,number,vatLocked");
  const acctId = accRes.data?.values?.[0]?.id;

  // Step 3: Import with PaymentID
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${INV}</cbc:ID>
  <cbc:IssueDate>${DATE}</cbc:IssueDate>
  <cbc:DueDate>${DUE}</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>NOK</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty><cac:Party>
    <cbc:EndpointID schemeID="0192">${ORG}</cbc:EndpointID>
    <cac:PartyIdentification><cbc:ID schemeID="0192">${ORG}</cbc:ID></cac:PartyIdentification>
    <cac:PartyName><cbc:Name>${SUPP_NAME}</cbc:Name></cac:PartyName>
    <cac:PostalAddress><cbc:StreetName>T1</cbc:StreetName><cbc:CityName>Oslo</cbc:CityName><cbc:PostalZone>0155</cbc:PostalZone><cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
    <cac:PartyTaxScheme><cbc:CompanyID>NO${ORG}MVA</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>
    <cac:PartyLegalEntity><cbc:RegistrationName>${SUPP_NAME}</cbc:RegistrationName><cbc:CompanyID schemeID="0192">${ORG}</cbc:CompanyID></cac:PartyLegalEntity>
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
    <cbc:PaymentID>${INV}</cbc:PaymentID>
    <cac:PayeeFinancialAccount><cbc:ID>12345678903</cbc:ID></cac:PayeeFinancialAccount>
  </cac:PaymentMeans>
  <cac:TaxTotal><cbc:TaxAmount currencyID="NOK">${VAT}.00</cbc:TaxAmount>
    <cac:TaxSubtotal><cbc:TaxableAmount currencyID="NOK">${NET}.00</cbc:TaxableAmount><cbc:TaxAmount currencyID="NOK">${VAT}.00</cbc:TaxAmount><cac:TaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>25</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory></cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="NOK">${NET}.00</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="NOK">${NET}.00</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="NOK">${GROSS}.00</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="NOK">${GROSS}.00</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  <cac:InvoiceLine><cbc:ID>1</cbc:ID><cbc:InvoicedQuantity unitCode="EA">1</cbc:InvoicedQuantity><cbc:LineExtensionAmount currencyID="NOK">${NET}.00</cbc:LineExtensionAmount>
    <cac:Item><cbc:Name>test</cbc:Name><cac:ClassifiedTaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>25</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory></cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="NOK">${NET}.00</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>
</Invoice>`;

  const form = new FormData();
  form.append("file", new Blob([xml], { type: "application/xml" }), `${INV}.xml`);
  const impRes = await api("POST", "/ledger/voucher/importDocument", form);
  const vId = impRes.data?.values?.[0]?.id;
  let ver = impRes.data?.values?.[0]?.version;
  console.log(`  Voucher: id=${vId} version=${ver}`);

  // CHECK 1: kid right after import (before PUT)
  console.log("\n=== CHECK 1: kid after import (before PUT, before book) ===");
  const siRes1 = await api("GET", `/supplierInvoice?voucherId=${vId}&invoiceDateFrom=2026-01-01&invoiceDateTo=2026-12-31&fields=*`);
  const si1 = siRes1.data?.values?.[0];
  console.log(`  kidOrReceiverReference: "${si1?.kidOrReceiverReference}"`);

  // Step 4: PUT postings (sendToLedger=false)
  const putRes = await api("PUT", `/ledger/voucher/${vId}?sendToLedger=false`, {
    version: ver,
    postings: [
      { row: 1, date: DATE, description: "test", account: { id: acctId }, vatType: { id: 1 }, amount: NET, amountCurrency: NET, amountGross: GROSS, amountGrossCurrency: GROSS },
      { row: 2, date: DATE, description: "test", account: { id: suppLedgerId }, supplier: { id: suppId }, amount: -GROSS, amountCurrency: -GROSS, amountGross: -GROSS, amountGrossCurrency: -GROSS, invoiceNumber: INV, termOfPayment: DUE },
    ],
  });
  ver = putRes.data?.value?.version;
  console.log(`  After PUT postings: version=${ver} number=${putRes.data?.value?.number}`);

  // CHECK 2: kid after PUT postings (still unbooked)
  console.log("\n=== CHECK 2: kid after PUT postings (still unbooked) ===");
  const siRes2 = await api("GET", `/supplierInvoice?voucherId=${vId}&invoiceDateFrom=2026-01-01&invoiceDateTo=2026-12-31&fields=*`);
  const si2 = siRes2.data?.values?.[0];
  console.log(`  kidOrReceiverReference: "${si2?.kidOrReceiverReference}"`);
  console.log(`  voucher number: ${putRes.data?.value?.number} (0=unbooked)`);

  // Step 5: BOOK (sendToLedger=true)
  console.log("\n=== STEP 5: BOOK (sendToLedger=true) ===");
  const bookRes = await api("PUT", `/ledger/voucher/${vId}?sendToLedger=true`, { version: ver });
  ver = bookRes.data?.value?.version;
  console.log(`  After booking: version=${ver} number=${bookRes.data?.value?.number}`);

  // CHECK 3: kid after booking
  console.log("\n=== CHECK 3: kid after booking ===");
  const siRes3 = await api("GET", `/supplierInvoice?voucherId=${vId}&invoiceDateFrom=2026-01-01&invoiceDateTo=2026-12-31&fields=*`);
  const si3 = siRes3.data?.values?.[0];
  console.log(`  kidOrReceiverReference: "${si3?.kidOrReceiverReference}"`);

  // SUMMARY
  console.log("\n" + "=".repeat(70));
  console.log("  SUMMARY: kidOrReceiverReference at each stage");
  console.log("=".repeat(70));
  console.log(`  After import (before PUT):   "${si1?.kidOrReceiverReference}"`);
  console.log(`  After PUT (unbooked):        "${si2?.kidOrReceiverReference}"`);
  console.log(`  After booking:               "${si3?.kidOrReceiverReference}"`);
  console.log();
  console.log(`  CONCLUSION: booking ${si3?.kidOrReceiverReference ? 'DOES' : 'DOES NOT'} populate kidOrReceiverReference`);

  // Also check: full SI state comparison booked vs unbooked
  console.log("\n=== FULL BOOKED SI STATE ===");
  const siFull = await api("GET", `/supplierInvoice/${si3?.id}?fields=*,orderLines(*)`);
  console.log(JSON.stringify(siFull.data?.value, null, 2));

  // Check voucher state
  console.log("\n=== FULL BOOKED VOUCHER STATE ===");
  const vFull = await api("GET", `/ledger/voucher/${vId}?fields=id,number,date,description,voucherType(*),postings(*,account(*),vatType(*),supplier(*))`);
  console.log(JSON.stringify(vFull.data?.value, null, 2));
}

main().catch(e => { console.error(e); process.exit(1); });
