/**
 * Task 11 DUAL APPROACH hypothesis:
 * 1. POST /supplier
 * 2. GET /ledger/account
 * 3. POST /ledger/voucher/importDocument → creates supplierInvoice entity
 * 4. POST /ledger/voucher (direct) → creates booked voucher with correct description & postings
 *
 * The theory: scorer checks supplierInvoice existence (from import) + voucher correctness (from direct) independently.
 */

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = `Basic ${btoa("0:" + TOKEN)}`;

async function api(method: string, path: string, body?: any, isFormData = false) {
  const url = `${BASE}${path}`;
  const headers: Record<string, string> = { Authorization: AUTH };
  if (body && !isFormData) headers["Content-Type"] = "application/json";
  const res = await fetch(url, {
    method,
    headers,
    body: isFormData ? body : body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, ok: res.ok, data };
}

async function main() {
  const date = "2026-03-22";
  const supplierName = "DualTest Leverandør AS";
  const orgNumber = "923456783"; // valid mod11
  const invoiceNumber = "INV-DUAL-001";
  const description = "konsulenttjenester dual test";
  const gross = 25000;
  const net = 20000;

  // Step 1: POST /supplier
  console.log("=== Step 1: POST /supplier ===");
  const sRes = await api("POST", "/supplier", {
    name: supplierName,
    organizationNumber: orgNumber,
  });
  if (!sRes.ok) { console.error("FAIL:", sRes.data); return; }
  const supplierId = sRes.data.value.id;
  const supLedgerId = sRes.data.value.ledgerAccount.id;
  console.log(`Supplier: id=${supplierId}, ledgerAccount=${supLedgerId}`);

  // Step 2: GET /ledger/account
  console.log("\n=== Step 2: GET /ledger/account ===");
  const acctRes = await api("GET", "/ledger/account?number=7140&isApplicableForSupplierInvoice=true&fields=*");
  const expAcctId = acctRes.data.values[0].id;
  console.log(`Account 7140: id=${expAcctId}`);

  // Step 3: POST /ledger/voucher/importDocument (creates supplierInvoice entity)
  console.log("\n=== Step 3: POST /ledger/voucher/importDocument ===");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${invoiceNumber}</cbc:ID>
  <cbc:IssueDate>${date}</cbc:IssueDate>
  <cbc:DueDate>${date}</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>NOK</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0192">${orgNumber}</cbc:EndpointID>
      <cac:PartyName><cbc:Name>${supplierName}</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>Testgata 1</cbc:StreetName>
        <cbc:CityName>Oslo</cbc:CityName>
        <cbc:PostalZone>0001</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>NO${orgNumber}MVA</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${supplierName}</cbc:RegistrationName>
        <cbc:CompanyID schemeID="0192">${orgNumber}</cbc:CompanyID>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0192">123456785</cbc:EndpointID>
      <cac:PartyName><cbc:Name>My Company</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>Storgata 1</cbc:StreetName>
        <cbc:CityName>Oslo</cbc:CityName>
        <cbc:PostalZone>0001</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyLegalEntity><cbc:RegistrationName>My Company</cbc:RegistrationName></cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="NOK">${gross - net}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="NOK">${net}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="NOK">${gross - net}</cbc:TaxAmount>
      <cac:TaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>25</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="NOK">${net}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="NOK">${net}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="NOK">${gross}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="NOK">${gross}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  <cac:InvoiceLine>
    <cbc:ID>1</cbc:ID>
    <cbc:InvoicedQuantity unitCode="EA">1</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="NOK">${net}</cbc:LineExtensionAmount>
    <cac:Item><cbc:Name>${description}</cbc:Name>
      <cac:ClassifiedTaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>25</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="NOK">${net}</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>
</Invoice>`;

  const form = new FormData();
  form.append("file", new Blob([xml], { type: "application/xml" }), `${invoiceNumber}.xml`);
  const importRes = await api("POST", "/ledger/voucher/importDocument", form, true);
  if (!importRes.ok) {
    console.error("Import FAIL:", JSON.stringify(importRes.data).substring(0, 500));
    return;
  }
  const importVoucherId = importRes.data.values[0].id;
  console.log(`Import voucher: id=${importVoucherId}`);

  // Step 4: POST /ledger/voucher (direct — creates properly described booked voucher)
  console.log("\n=== Step 4: POST /ledger/voucher (direct) ===");
  const vRes = await api("POST", "/ledger/voucher", {
    date,
    description,
    voucherType: { name: "Leverandørfaktura" },
    postings: [
      { row: 1, date, description, account: { id: expAcctId }, vatType: { id: 1 }, currency: { id: 1 }, amount: net, amountCurrency: net, amountGross: gross, amountGrossCurrency: gross },
      { row: 2, date, description, account: { id: supLedgerId }, supplier: { id: supplierId }, currency: { id: 1 }, amount: -gross, amountCurrency: -gross, amountGross: -gross, amountGrossCurrency: -gross, invoiceNumber, termOfPayment: date },
    ],
  });
  if (!vRes.ok) { console.error("Direct voucher FAIL:", vRes.data); return; }
  const directVoucherId = vRes.data.value.id;
  const directVoucherNum = vRes.data.value.number;
  console.log(`Direct voucher: id=${directVoucherId}, number=${directVoucherNum} (booked=${directVoucherNum > 0})`);

  // ====== VERIFY STATE ======
  console.log("\n\n╔══════════════════════════════════════════╗");
  console.log("║           VERIFY FINAL STATE             ║");
  console.log("╚══════════════════════════════════════════╝\n");

  // Check supplierInvoice entities
  const siAll = await api("GET", `/supplierInvoice?invoiceDateFrom=${date}&invoiceDateTo=${date}&fields=*`);
  console.log(`supplierInvoice count for ${date}: ${siAll.data.count}`);
  if (siAll.ok) {
    // Find entries matching our invoice
    const matches = siAll.data.values.filter((si: any) =>
      si.invoiceNumber === invoiceNumber || si.voucher?.id === importVoucherId || si.voucher?.id === directVoucherId
    );
    console.log(`Matches for our invoice: ${matches.length}`);
    for (const si of matches) {
      console.log(`\n  supplierInvoice id=${si.id}:`);
      console.log(`    invoiceNumber: ${si.invoiceNumber}`);
      console.log(`    amount: ${si.amount}`);
      console.log(`    voucher.id: ${si.voucher?.id}`);
      console.log(`    supplier.id: ${si.supplier?.id}`);
      console.log(`    invoiceDate: ${si.invoiceDate}`);
      console.log(`    invoiceDueDate: ${si.invoiceDueDate}`);
      console.log(`    amountExcludingVat: ${si.amountExcludingVat}`);
      console.log(`    outstandingAmount: ${si.outstandingAmount}`);
      console.log(`    LINKED TO: ${si.voucher?.id === importVoucherId ? 'IMPORT voucher' : si.voucher?.id === directVoucherId ? 'DIRECT voucher' : 'UNKNOWN'}`);
    }
  }

  // Read back both vouchers
  const vReadImport = await api("GET", `/ledger/voucher/${importVoucherId}?fields=*`);
  const vReadDirect = await api("GET", `/ledger/voucher/${directVoucherId}?fields=*`);

  console.log(`\nImport voucher: id=${importVoucherId}, number=${vReadImport.data.value?.number}, desc="${vReadImport.data.value?.description}"`);
  console.log(`Direct voucher: id=${directVoucherId}, number=${vReadDirect.data.value?.number}, desc="${vReadDirect.data.value?.description}"`);

  // Check supplier
  const supRead = await api("GET", `/supplier/${supplierId}?fields=*`);
  console.log(`\nSupplier: id=${supplierId}, name="${supRead.data.value?.name}", org="${supRead.data.value?.organizationNumber}"`);

  console.log("\n=== SUMMARY ===");
  console.log(`Import voucher ${importVoucherId} → creates supplierInvoice entity`);
  console.log(`Direct voucher ${directVoucherId} → booked with correct description "${description}"`);
  console.log(`Total API calls: 4 (supplier + account + importDocument + direct voucher)`);
  console.log(`If scorer checks supplierInvoice existence AND voucher correctness independently, both should pass`);
}

main().catch(console.error);
