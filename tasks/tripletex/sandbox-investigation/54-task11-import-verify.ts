// Full end-to-end test of importDocument flow with supplierInvoice verification
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
  const ts = Date.now();
  const SUPPLIER_NAME = `TestSupp ${ts}`;
  const ORG_NR = "910079457";
  const INV_NR = `INV-${ts}`;
  const GROSS = 42100;
  const NET = 33680;
  const VAT = 8420;

  // Step 1: Create supplier
  console.log("=== Step 1: POST /supplier ===");
  const suppRes = await api("POST", "/supplier", {
    name: SUPPLIER_NAME,
    organizationNumber: ORG_NR
  });
  const suppId = suppRes.data?.value?.id;
  const suppLedgerId = suppRes.data?.value?.ledgerAccount?.id;
  console.log(`  suppId=${suppId}, ledger=${suppLedgerId}`);

  // Step 2: Get account
  const acctRes = await api("GET", "/ledger/account?number=6540&isApplicableForSupplierInvoice=true&fields=id,number");
  const acctId = acctRes.data?.values?.[0]?.id;

  // Step 3: Import document
  console.log("\n=== Step 3: POST /ledger/voucher/importDocument ===");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${INV_NR}</cbc:ID>
  <cbc:IssueDate>2026-03-21</cbc:IssueDate>
  <cbc:DueDate>2026-04-20</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>NOK</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0192">${ORG_NR}</cbc:EndpointID>
      <cac:PartyName><cbc:Name>${SUPPLIER_NAME}</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>Hovedgata 1</cbc:StreetName>
        <cbc:CityName>Oslo</cbc:CityName>
        <cbc:PostalZone>0001</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>NO${ORG_NR}MVA</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${SUPPLIER_NAME}</cbc:RegistrationName>
        <cbc:CompanyID schemeID="0192">${ORG_NR}</cbc:CompanyID>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0192">999999999</cbc:EndpointID>
      <cac:PartyName><cbc:Name>My Company</cbc:Name></cac:PartyName>
      <cac:PostalAddress><cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>My Company</cbc:RegistrationName>
        <cbc:CompanyID schemeID="0192">999999999</cbc:CompanyID>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="NOK">${VAT}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="NOK">${NET}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="NOK">${VAT}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>25</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="NOK">${NET}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="NOK">${NET}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="NOK">${GROSS}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="NOK">${GROSS}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  <cac:InvoiceLine>
    <cbc:ID>1</cbc:ID>
    <cbc:InvoicedQuantity unitCode="EA">1</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="NOK">${NET}</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Name>kontortjenester</cbc:Name>
      <cac:ClassifiedTaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>25</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="NOK">${NET}</cbc:PriceAmount></cac:Price>
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
  console.log(`Status: ${importRes.status}`);
  if (!importRes.ok) { console.log("FAILED:", JSON.stringify(importData)); return; }
  const vId = importData.values[0].id;
  const vVer = importData.values[0].version;
  console.log(`  Voucher: id=${vId}, version=${vVer}`);

  // Step 4: PUT postings
  console.log("\n=== Step 4: PUT postings (sendToLedger=false) ===");
  const putRes = await api("PUT", `/ledger/voucher/${vId}?sendToLedger=false`, {
    version: vVer,
    postings: [
      { row: 1, account: { id: acctId }, description: "kontortjenester", vatType: { id: 1 }, amount: NET, amountCurrency: NET, amountGross: GROSS, amountGrossCurrency: GROSS },
      { row: 2, account: { id: suppLedgerId }, supplier: { id: suppId }, description: "kontortjenester", amount: -GROSS, amountCurrency: -GROSS, amountGross: -GROSS, amountGrossCurrency: -GROSS, invoiceNumber: INV_NR, termOfPayment: "2026-04-20" }
    ]
  });
  const newVer = putRes.data?.value?.version;

  // Step 5: Book
  console.log("\n=== Step 5: PUT book (sendToLedger=true) ===");
  const bookRes = await api("PUT", `/ledger/voucher/${vId}?sendToLedger=true`, { version: newVer });
  console.log(`  Booked: number=${bookRes.data?.value?.number}`);

  // Now verify EVERYTHING the scorer might check
  console.log("\n=== VERIFICATION ===");

  // Check supplierInvoice
  console.log("\n--- SupplierInvoice ---");
  const siRes = await api("GET", `/supplierInvoice?invoiceDateFrom=2026-01-01&invoiceDateTo=2026-12-31&supplierId=${suppId}&fields=*`);
  if (siRes.data?.values?.length) {
    const si = siRes.data.values[0];
    console.log(`  id=${si.id}`);
    console.log(`  invoiceNumber=${si.invoiceNumber}`);
    console.log(`  invoiceDate=${si.invoiceDate}`);
    console.log(`  invoiceDueDate=${si.invoiceDueDate}`);
    console.log(`  amount=${si.amount}`);
    console.log(`  amountCurrency=${si.amountCurrency}`);
    console.log(`  outstandingAmount=${si.outstandingAmount}`);
    console.log(`  supplier.id=${si.supplier?.id}`);
    console.log(`  voucher.id=${si.voucher?.id}`);
    console.log(`  ALL KEYS: ${Object.keys(si).join(', ')}`);
  } else {
    console.log("  NO supplierInvoice found!");
  }

  // Check voucher
  console.log("\n--- Voucher ---");
  const vRes = await api("GET", `/ledger/voucher/${vId}?fields=id,number,date,description,voucherType(id,name),postings(id,row,account(id,number,name),amount,amountGross,amountGrossCurrency,vatType(id,name,percentage),supplier(id,name),description,invoiceNumber,termOfPayment)`);
  const v = vRes.data?.value;
  if (v) {
    console.log(`  id=${v.id}, number=${v.number}, date=${v.date}, desc="${v.description}"`);
    console.log(`  voucherType: ${v.voucherType?.name} (id=${v.voucherType?.id})`);
    for (const p of (v.postings || [])) {
      console.log(`    row=${p.row}: acct=${p.account?.number} (${p.account?.name}) | amt=${p.amount} gross=${p.amountGross} | vat=${p.vatType?.id} (${p.vatType?.name}) | supplier=${p.supplier?.id} | inv=${p.invoiceNumber} | term=${p.termOfPayment}`);
    }
  }

  // Check supplier
  console.log("\n--- Supplier ---");
  const sRes = await api("GET", `/supplier/${suppId}?fields=*`);
  const s = sRes.data?.value;
  if (s) {
    console.log(`  id=${s.id}, name=${s.name}, orgNr=${s.organizationNumber}`);
    console.log(`  ledgerAccount.id=${s.ledgerAccount?.id}`);
  }
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
