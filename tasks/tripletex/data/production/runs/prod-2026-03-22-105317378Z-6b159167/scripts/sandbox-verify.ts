/**
 * Sandbox verification:
 * 1. Confirm 987654325 works as buyer org number in importDocument XML
 * 2. Confirm supplierInvoice GET requires invoiceDateFrom/invoiceDateTo
 * 3. Test the full clean flow with zero errors
 */
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);

const headers = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} → ${r.status}`);
  if (!r.ok) console.log(JSON.stringify(json, null, 2));
  else console.log(JSON.stringify(json, null, 2).slice(0, 500));
  return { status: r.status, ok: r.ok, data: json };
}

async function apiForm(path: string, formData: FormData) {
  const url = `${BASE}${path}`;
  const r = await fetch(url, {
    method: "POST",
    headers: { Authorization: AUTH },
    body: formData,
  });
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`POST ${path} → ${r.status}`);
  console.log(JSON.stringify(json, null, 2).slice(0, 800));
  return { status: r.status, ok: r.ok, data: json };
}

const invoiceNumber = `SBX-VERIFY-${Date.now()}`;
const gross = 12500;
const net = 10000;
const vat = 2500;
const invoiceDate = "2026-03-22";
const dueDate = "2026-04-21";

async function main() {
  // Step 1: Create supplier
  const supplierRes = await api("POST", "/supplier", {
    name: "Sandbox Verify Co",
    organizationNumber: "987654325",
    isSupplier: true,
  });
  if (!supplierRes.ok) { console.error("Supplier creation failed"); return; }
  const supplierId = supplierRes.data.value.id;
  const supplierLedgerAccountId = supplierRes.data.value.ledgerAccount.id;
  console.log(`\n=== Supplier created: id=${supplierId}, ledgerAccount=${supplierLedgerAccountId}`);

  // Step 2: GET expense account
  const acctRes = await api("GET", "/ledger/account?number=6500&isApplicableForSupplierInvoice=true&fields=id,number,name");
  if (!acctRes.ok) { console.error("Account lookup failed"); return; }
  const expenseAccountId = acctRes.data.values[0].id;
  console.log(`\n=== Expense account: id=${expenseAccountId}`);

  // Step 3: importDocument with buyer org 987654325
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${invoiceNumber}</cbc:ID>
  <cbc:IssueDate>${invoiceDate}</cbc:IssueDate>
  <cbc:DueDate>${dueDate}</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>NOK</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0192">987654325</cbc:EndpointID>
      <cac:PartyName><cbc:Name>Sandbox Verify Co</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>Ukjent</cbc:StreetName>
        <cbc:CityName>Ukjent</cbc:CityName>
        <cbc:PostalZone>0000</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>NO987654325MVA</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity><cbc:RegistrationName>Sandbox Verify Co</cbc:RegistrationName></cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0192">987654325</cbc:EndpointID>
      <cac:PartyName><cbc:Name>My Company</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>Street</cbc:StreetName>
        <cbc:CityName>Oslo</cbc:CityName>
        <cbc:PostalZone>0001</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyLegalEntity><cbc:RegistrationName>My Company</cbc:RegistrationName></cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:PaymentMeans>
    <cbc:PaymentMeansCode>30</cbc:PaymentMeansCode>
    <cbc:PaymentID>${invoiceNumber}</cbc:PaymentID>
    <cac:PayeeFinancialAccount>
      <cbc:ID>00000000000</cbc:ID>
    </cac:PayeeFinancialAccount>
  </cac:PaymentMeans>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="NOK">${vat}.00</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="NOK">${net}.00</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="NOK">${vat}.00</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>25</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="NOK">${net}.00</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="NOK">${net}.00</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="NOK">${gross}.00</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="NOK">${gross}.00</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  <cac:InvoiceLine>
    <cbc:ID>1</cbc:ID>
    <cbc:InvoicedQuantity unitCode="EA">1</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="NOK">${net}.00</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Name>Test service</cbc:Name>
      <cac:ClassifiedTaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>25</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="NOK">${net}.00</cbc:PriceAmount>
    </cac:Price>
  </cac:InvoiceLine>
</Invoice>`;

  const formData = new FormData();
  const xmlBlob = new Blob([xml], { type: "application/xml" });
  formData.append("file", xmlBlob, `${invoiceNumber}.xml`);
  formData.append("split", "false");

  const importRes = await apiForm("/ledger/voucher/importDocument", formData);
  if (!importRes.ok) { console.error("importDocument FAILED"); return; }
  const voucherId = importRes.data.values[0].id;
  const voucherVersion = importRes.data.values[0].version;
  console.log(`\n=== Voucher created: id=${voucherId}, version=${voucherVersion}`);

  // Step 4a: Test supplierInvoice GET WITHOUT date params (should fail)
  console.log("\n--- TEST: supplierInvoice GET without date params ---");
  const siNoDate = await api("GET", `/supplierInvoice?voucherId=${voucherId}&fields=id,invoiceNumber,amount`);
  console.log(`Without dates: status=${siNoDate.status}, ok=${siNoDate.ok}`);

  // Step 4b: Test supplierInvoice GET WITH date params (should work)
  console.log("\n--- TEST: supplierInvoice GET with date params ---");
  const siWithDate = await api("GET", `/supplierInvoice?voucherId=${voucherId}&invoiceDateFrom=2026-01-01&invoiceDateTo=2026-12-31&fields=id,invoiceNumber,amount,amountExcludingVat,kidOrReceiverReference`);
  console.log(`With dates: status=${siWithDate.status}, ok=${siWithDate.ok}`);

  // Step 5: PUT postings
  const putPostingsRes = await api("PUT", `/ledger/voucher/${voucherId}?sendToLedger=false`, {
    version: voucherVersion,
    postings: [
      {
        row: 1,
        date: invoiceDate,
        description: "Test service",
        account: { id: expenseAccountId },
        vatType: { id: 1 },
        amount: net,
        amountCurrency: net,
        amountGross: gross,
        amountGrossCurrency: gross,
      },
      {
        row: 2,
        date: invoiceDate,
        description: "Test service",
        account: { id: supplierLedgerAccountId },
        supplier: { id: supplierId },
        amount: -gross,
        amountCurrency: -gross,
        amountGross: -gross,
        amountGrossCurrency: -gross,
        invoiceNumber: invoiceNumber,
        termOfPayment: dueDate,
      },
    ],
  });
  if (!putPostingsRes.ok) { console.error("PUT postings FAILED"); return; }
  const version2 = putPostingsRes.data.value.version;
  console.log(`\n=== Postings set, version=${version2}`);

  // Step 6: PUT book
  const bookRes = await api("PUT", `/ledger/voucher/${voucherId}?sendToLedger=true`, {
    version: version2,
    voucherType: { name: "Leverandørfaktura" },
  });
  if (!bookRes.ok) { console.error("PUT book FAILED"); return; }
  console.log(`\n=== Booked: number=${bookRes.data.value.number}`);

  // Step 7: Verify voucher
  await api("GET", `/ledger/voucher/${voucherId}?fields=id,number,description,voucherType`);

  // Step 8: Verify supplier
  await api("GET", `/supplier/${supplierId}?fields=id,name,organizationNumber,postalAddress,physicalAddress`);

  console.log("\n=== SANDBOX VERIFICATION COMPLETE ===");
  console.log("Results:");
  console.log(`- Buyer org 987654325 in XML: ${importRes.ok ? "WORKS" : "FAILED"}`);
  console.log(`- supplierInvoice GET without dates: ${siNoDate.ok ? "WORKS (unexpected!)" : "FAILS (422 as expected)"}`);
  console.log(`- supplierInvoice GET with dates: ${siWithDate.ok ? "WORKS" : "FAILS"}`);
  console.log(`- Full flow zero errors: ${bookRes.ok ? "YES" : "NO"}`);
  console.log(`- Total calls: 8 (POST supplier, GET account, POST importDocument, GET SI, PUT postings, PUT book, GET voucher, GET supplier)`);
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
