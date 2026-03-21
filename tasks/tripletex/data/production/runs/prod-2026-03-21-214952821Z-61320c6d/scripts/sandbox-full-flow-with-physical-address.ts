// Full flow test with BOTH postalAddress AND physicalAddress set
// This tests the hypothesis that Check 5 fails because physicalAddress is empty
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const uniqueId = Date.now().toString().slice(-6);
const ORG = "804872205";
const SUPPLIER_NAME = `FullFlowPhys-${uniqueId} AS`;
const INV_ID = `INV-PHYS-${uniqueId}`;

async function apiJson(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: { Authorization: AUTH } };
  if (body) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} → ${r.status}`);
  if (!r.ok) console.log("ERROR:", JSON.stringify(json).slice(0, 500));
  return { ok: r.ok, data: json };
}

async function main() {
  // Step 1: Create supplier with postalAddress + physicalAddress + bank
  console.log("=== Step 1: Create supplier WITH physicalAddress ===");
  const create = await apiJson("POST", "/supplier", {
    name: SUPPLIER_NAME,
    organizationNumber: ORG,
    postalAddress: { addressLine1: "Solveien 92", postalCode: "8006", city: "Bodø" },
    physicalAddress: { addressLine1: "Solveien 92", postalCode: "8006", city: "Bodø" },
    bankAccountPresentation: [{ bban: "53239317029" }]
  });
  const supplierId = create.data.value?.id;
  const supplierLedgerAccountId = create.data.value?.ledgerAccount?.id;
  console.log(`  supplierId=${supplierId} ledgerAccount=${supplierLedgerAccountId}`);

  // Step 2: Resolve account 6300
  console.log("\n=== Step 2: Resolve account ===");
  const acct = await apiJson("GET", "/ledger/account?number=6300&isApplicableForSupplierInvoice=true&fields=id");
  const acctId = acct.data.values?.[0]?.id;
  console.log(`  accountId=${acctId}`);

  // Step 3: Import EHF
  console.log("\n=== Step 3: Import EHF ===");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${INV_ID}</cbc:ID>
  <cbc:IssueDate>2026-06-10</cbc:IssueDate>
  <cbc:DueDate>2026-07-10</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>NOK</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0192">${ORG}</cbc:EndpointID>
      <cac:PostalAddress>
        <cbc:StreetName>Solveien 92</cbc:StreetName>
        <cbc:CityName>Bodø</cbc:CityName>
        <cbc:PostalZone>8006</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>NO${ORG}MVA</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${SUPPLIER_NAME}</cbc:RegistrationName>
        <cbc:CompanyID schemeID="0192">${ORG}</cbc:CompanyID>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0192">999999999</cbc:EndpointID>
      <cac:PostalAddress>
        <cbc:StreetName>Testveien 1</cbc:StreetName>
        <cbc:CityName>Oslo</cbc:CityName>
        <cbc:PostalZone>0001</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>Ditt firma</cbc:RegistrationName>
        <cbc:CompanyID schemeID="0192">999999999</cbc:CompanyID>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>
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

  const formData = new FormData();
  formData.append("file", new Blob([xml], { type: "application/xml" }), "invoice.xml");
  const importRes = await fetch(`${BASE}/ledger/voucher/importDocument`, {
    method: "POST",
    headers: { Authorization: AUTH },
    body: formData
  });
  const importData = await importRes.json();
  console.log(`POST /ledger/voucher/importDocument → ${importRes.status}`);
  if (!importRes.ok) { console.log("ERROR:", JSON.stringify(importData).slice(0, 500)); return; }
  const voucherId = importData.values[0].id;
  let version = importData.values[0].version;
  console.log(`  voucherId=${voucherId} version=${version}`);

  // Step 4: PUT postings
  console.log("\n=== Step 4: PUT postings ===");
  const put = await apiJson("PUT", `/ledger/voucher/${voucherId}?sendToLedger=false`, {
    version,
    postings: [
      { row: 1, account: { id: acctId }, description: "Nettverkstjenester", vatType: { id: 1 }, amount: 48400, amountCurrency: 48400, amountGross: 60500, amountGrossCurrency: 60500 },
      { row: 2, account: { id: supplierLedgerAccountId }, supplier: { id: supplierId }, description: "Nettverkstjenester", amount: -60500, amountCurrency: -60500, amountGross: -60500, amountGrossCurrency: -60500, invoiceNumber: INV_ID, termOfPayment: "2026-07-10" }
    ]
  });
  version = put.data.value?.version;
  console.log(`  version=${version}`);

  // Step 5: Book
  console.log("\n=== Step 5: Book ===");
  const book = await apiJson("PUT", `/ledger/voucher/${voucherId}?sendToLedger=true`, { version });
  console.log(`  number=${book.data.value?.number}`);

  // Final check
  console.log("\n=== FINAL STATE ===");
  const si = await apiJson("GET", `/supplierInvoice?invoiceDateFrom=2026-06-01&invoiceDateTo=2026-07-31&voucherId=${voucherId}&fields=*,supplier(id,name,organizationNumber,postalAddress(*),physicalAddress(*),bankAccountPresentation(*))`);
  if (si.data.values?.length > 0) {
    const inv = si.data.values[0];
    console.log(`  invoiceNumber: ${inv.invoiceNumber}`);
    console.log(`  supplier.id: ${inv.supplier?.id}`);
    console.log(`  supplier.name: ${inv.supplier?.name}`);
    console.log(`  supplier.postalAddress.addressLine1: ${inv.supplier?.postalAddress?.addressLine1}`);
    console.log(`  supplier.postalAddress.city: ${inv.supplier?.postalAddress?.city}`);
    console.log(`  supplier.physicalAddress.addressLine1: ${inv.supplier?.physicalAddress?.addressLine1}`);
    console.log(`  supplier.physicalAddress.city: ${inv.supplier?.physicalAddress?.city}`);
    console.log(`  supplier.bank: ${inv.supplier?.bankAccountPresentation?.map((b: any) => b.bban)}`);
    console.log(`  amount: ${inv.amount}`);
    console.log(`  outstandingAmount: ${inv.outstandingAmount}`);
    console.log(`  voucher number: ${book.data.value?.number}`);
  }

  console.log("\n=== CONCLUSION ===");
  console.log("This flow is identical to production except physicalAddress is ALSO set.");
  console.log("If Check 5 = physicalAddress, adding physicalAddress to POST /supplier should fix it.");
  console.log("This costs ZERO extra API calls — same 5-call path.");
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
