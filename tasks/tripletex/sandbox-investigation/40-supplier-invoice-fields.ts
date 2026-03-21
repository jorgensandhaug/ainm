// Investigate what fields are on the supplierInvoice object after import+booking
// Looking for what Check 5 might validate (task 20)
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: RequestInit = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const json = await res.json();
  console.log(`${method} ${path} => ${res.status}`);
  if (res.status >= 400) console.log("  ERR:", JSON.stringify(json, null, 2).slice(0, 500));
  return { status: res.status, data: json };
}

async function main() {
  // Check existing supplier invoices in sandbox
  console.log("=== 1. Existing supplier invoices ===");
  const invoices = await api("GET", "/supplierInvoice?count=5&fields=*&sorting=id,-1");
  for (const inv of (invoices.data?.values || []).slice(0, 3)) {
    console.log(`\n--- Invoice ${inv.id} ---`);
    console.log(`  invoiceNumber: ${inv.invoiceNumber}`);
    console.log(`  invoiceDate: ${inv.invoiceDate}`);
    console.log(`  invoiceDueDate: ${inv.invoiceDueDate}`);
    console.log(`  amount: ${inv.amount}`);
    console.log(`  amountCurrency: ${inv.amountCurrency}`);
    console.log(`  outstandingAmount: ${inv.outstandingAmount}`);
    console.log(`  supplier.id: ${inv.supplier?.id}`);
    console.log(`  supplier.name: ${inv.supplier?.name}`);
    console.log(`  voucher.id: ${inv.voucher?.id}`);
    console.log(`  voucher.number: ${inv.voucher?.number}`);
    // Print ALL fields to find what we might be missing
    const keys = Object.keys(inv);
    console.log(`  ALL FIELDS: ${keys.join(', ')}`);
    // Print values for fields we might not know about
    for (const k of keys) {
      if (!['id','version','url','invoiceNumber','invoiceDate','invoiceDueDate','amount','amountCurrency','outstandingAmount','supplier','voucher','postings'].includes(k)) {
        const v = inv[k];
        if (v !== null && v !== undefined && v !== '' && v !== 0 && v !== false) {
          console.log(`  ${k}: ${JSON.stringify(v)}`);
        }
      }
    }
  }

  // Now create a test supplier invoice with PaymentMeans in XML and see if it differs
  console.log("\n=== 2. Create test invoice WITH PaymentMeans ===");
  const ts = Date.now();
  const suppRes = await api("POST", "/supplier", {
    name: `Check5 Test ${ts}`,
    organizationNumber: "910079457",
    postalAddress: {
      addressLine1: "Testgata 1",
      postalCode: "0001",
      city: "Oslo"
    },
    bankAccountPresentation: [{ bban: "53239317029" }]
  });
  const suppId = suppRes.data?.value?.id;
  const suppLedgerId = suppRes.data?.value?.ledgerAccount?.id;

  const accRes = await api("GET", "/ledger/account?number=6340&isApplicableForSupplierInvoice=true&fields=*");
  const accId = accRes.data?.values?.[0]?.id;

  // XML WITH PaymentMeans
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>INV-TEST-${ts}</cbc:ID>
  <cbc:IssueDate>2026-06-27</cbc:IssueDate>
  <cbc:DueDate>2026-07-27</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>NOK</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0192">910079457</cbc:EndpointID>
      <cac:PartyName><cbc:Name>Check5 Test ${ts}</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>Testgata 1</cbc:StreetName>
        <cbc:CityName>Oslo</cbc:CityName>
        <cbc:PostalZone>0001</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>NO910079457MVA</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>Check5 Test ${ts}</cbc:RegistrationName>
        <cbc:CompanyID schemeID="0192">910079457</cbc:CompanyID>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0192">999999999</cbc:EndpointID>
      <cac:PartyName><cbc:Name>Ditt firma</cbc:Name></cac:PartyName>
      <cac:PostalAddress><cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>Ditt firma</cbc:RegistrationName>
        <cbc:CompanyID schemeID="0192">999999999</cbc:CompanyID>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:PaymentMeans>
    <cbc:PaymentMeansCode>30</cbc:PaymentMeansCode>
    <cbc:PaymentDueDate>2026-07-27</cbc:PaymentDueDate>
    <cbc:PaymentID>INV-TEST-${ts}</cbc:PaymentID>
    <cac:PayeeFinancialAccount>
      <cbc:ID>53239317029</cbc:ID>
    </cac:PayeeFinancialAccount>
  </cac:PaymentMeans>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="NOK">15062</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="NOK">60250</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="NOK">15062</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>25</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="NOK">60250</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="NOK">60250</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="NOK">75312</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="NOK">75312</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  <cac:InvoiceLine>
    <cbc:ID>1</cbc:ID>
    <cbc:InvoicedQuantity unitCode="EA">1</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="NOK">60250</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Name>Skylagring</cbc:Name>
      <cac:ClassifiedTaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>25</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="NOK">60250</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>
</Invoice>`;

  const formData = new FormData();
  formData.append("file", new Blob([xml], { type: "text/xml" }), `INV-TEST-${ts}.xml`);
  const importRes = await fetch(`${BASE}/ledger/voucher/importDocument`, {
    method: "POST",
    headers: { Authorization: AUTH },
    body: formData
  });
  const importJson = await importRes.json();
  console.log(`POST /ledger/voucher/importDocument => ${importRes.status}`);

  if (importRes.ok) {
    const vId = importJson.values[0].id;
    const vVer = importJson.values[0].version;
    console.log(`Voucher: id=${vId} version=${vVer}`);

    // Set postings
    const putRes = await api("PUT", `/ledger/voucher/${vId}?sendToLedger=false`, {
      version: vVer,
      postings: [
        { row: 1, account: { id: accId }, description: "Skylagring", vatType: { id: 1 }, amount: 60250, amountCurrency: 60250, amountGross: 75312, amountGrossCurrency: 75312 },
        { row: 2, account: { id: suppLedgerId }, supplier: { id: suppId }, description: "Skylagring", amount: -75312, amountCurrency: -75312, amountGross: -75312, amountGrossCurrency: -75312, invoiceNumber: `INV-TEST-${ts}`, termOfPayment: "2026-07-27" }
      ]
    });
    const v2 = putRes.data?.value?.version;

    // Book
    const bookRes = await api("PUT", `/ledger/voucher/${vId}?sendToLedger=true`, { version: v2 });

    // Now read the supplier invoice to see ALL fields
    console.log("\n=== 3. Read supplier invoice with ALL fields ===");
    const siRes = await api("GET", `/supplierInvoice?voucherId=${vId}&fields=*`);
    if (siRes.data?.values?.length) {
      const si = siRes.data.values[0];
      console.log("Full supplierInvoice:");
      console.log(JSON.stringify(si, null, 2));
    }
  }
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
