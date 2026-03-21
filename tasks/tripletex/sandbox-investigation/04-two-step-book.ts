// Test: Import -> PUT postings (sendToLedger=false) -> PUT again (sendToLedger=true)
// Also test: POST /supplierInvoice with correct fields
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: RequestInit = { method, headers: H };
  if (body && !(body instanceof FormData)) opts.body = JSON.stringify(body);
  if (body instanceof FormData) { opts.body = body; opts.headers = { Authorization: AUTH }; }
  const res = await fetch(url, opts);
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} => ${res.status}`);
  if (res.status >= 400) console.log("ERROR:", JSON.stringify(json, null, 2).slice(0, 800));
  return { status: res.status, data: json };
}

async function main() {
  const TS = Date.now();
  const SUPPLIER_NAME = `TwoStep_${TS}`;
  const ORG = "890932991";
  const INVOICE_NUM = `INV-2S-${TS}`;
  const GROSS = 59800;
  const NET = 47840;
  const VAT = 11960;
  const DATE = "2026-03-21";

  // Create supplier
  const supRes = await api("POST", "/supplier", { name: SUPPLIER_NAME, organizationNumber: ORG });
  const supplierId = supRes.data?.value?.id;
  const supplierLedgerAccountId = supRes.data?.value?.ledgerAccount?.id;

  // Get expense account 6300
  const accRes = await api("GET", "/ledger/account?number=6300&isApplicableForSupplierInvoice=true&fields=*");
  const expenseAccountId = accRes.data?.values?.[0]?.id;

  // ========== Approach A: Two-step booking ==========
  console.log("\n=== APPROACH A: Two-step import -> postings -> book ===");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${INVOICE_NUM}</cbc:ID>
  <cbc:IssueDate>${DATE}</cbc:IssueDate>
  <cbc:DueDate>${DATE}</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>NOK</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0192">${ORG}</cbc:EndpointID>
      <cac:PartyName><cbc:Name>${SUPPLIER_NAME}</cbc:Name></cac:PartyName>
      <cac:PostalAddress><cbc:StreetName>Test</cbc:StreetName><cbc:CityName>Oslo</cbc:CityName><cbc:PostalZone>0001</cbc:PostalZone><cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
      <cac:PartyTaxScheme><cbc:CompanyID>NO${ORG}MVA</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>
      <cac:PartyLegalEntity><cbc:RegistrationName>${SUPPLIER_NAME}</cbc:RegistrationName><cbc:CompanyID schemeID="0192">${ORG}</cbc:CompanyID></cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0192">999999999</cbc:EndpointID>
      <cac:PartyName><cbc:Name>My Company</cbc:Name></cac:PartyName>
      <cac:PostalAddress><cbc:StreetName>Gate 1</cbc:StreetName><cbc:CityName>Oslo</cbc:CityName><cbc:PostalZone>0001</cbc:PostalZone><cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
      <cac:PartyLegalEntity><cbc:RegistrationName>My Company</cbc:RegistrationName><cbc:CompanyID schemeID="0192">999999999</cbc:CompanyID></cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="NOK">${VAT}</cbc:TaxAmount>
    <cac:TaxSubtotal><cbc:TaxableAmount currencyID="NOK">${NET}</cbc:TaxableAmount><cbc:TaxAmount currencyID="NOK">${VAT}</cbc:TaxAmount><cac:TaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>25</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory></cac:TaxSubtotal>
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
    <cac:Item><cbc:Name>Office services</cbc:Name><cac:ClassifiedTaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>25</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory></cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="NOK">${NET}</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>
</Invoice>`;

  const formData = new FormData();
  formData.append("file", new Blob([xml], { type: "application/xml" }), `${INVOICE_NUM}.xml`);
  const importRes = await api("POST", "/ledger/voucher/importDocument", formData);
  const voucherId = importRes.data?.values?.[0]?.id;
  let voucherVersion = importRes.data?.values?.[0]?.version;
  console.log("Voucher:", voucherId, "v:", voucherVersion);

  // Step 1: PUT postings with sendToLedger=false
  const putRes1 = await api("PUT", `/ledger/voucher/${voucherId}?sendToLedger=false`, {
    version: voucherVersion,
    postings: [
      { row: 1, account: { id: expenseAccountId }, description: "Office services", vatType: { id: 1 }, amount: NET, amountCurrency: NET, amountGross: GROSS, amountGrossCurrency: GROSS },
      { row: 2, account: { id: supplierLedgerAccountId }, supplier: { id: supplierId }, description: "Office services", amount: -GROSS, amountCurrency: -GROSS, amountGross: -GROSS, amountGrossCurrency: -GROSS, invoiceNumber: INVOICE_NUM, termOfPayment: DATE },
    ],
  });
  console.log("PUT postings:", putRes1.status);
  voucherVersion = putRes1.data?.value?.version;

  // Step 2: PUT again with sendToLedger=true (no postings change, just book)
  const putRes2 = await api("PUT", `/ledger/voucher/${voucherId}?sendToLedger=true`, {
    version: voucherVersion,
    postings: [
      { row: 1, account: { id: expenseAccountId }, description: "Office services", vatType: { id: 1 }, amount: NET, amountCurrency: NET, amountGross: GROSS, amountGrossCurrency: GROSS },
      { row: 2, account: { id: supplierLedgerAccountId }, supplier: { id: supplierId }, description: "Office services", amount: -GROSS, amountCurrency: -GROSS, amountGross: -GROSS, amountGrossCurrency: -GROSS, invoiceNumber: INVOICE_NUM, termOfPayment: DATE },
    ],
  });
  console.log("PUT book:", putRes2.status);
  if (putRes2.status >= 400) {
    console.log("Book error:", JSON.stringify(putRes2.data, null, 2).slice(0, 800));
  }

  // Check voucher state
  const vCheck = await api("GET", `/ledger/voucher/${voucherId}?fields=*,postings(*)`);
  console.log("\nVoucher number:", vCheck.data?.value?.number);
  console.log("Voucher numberAsString:", vCheck.data?.value?.numberAsString);
  console.log("Postings:", vCheck.data?.value?.postings?.length);

  // Check supplierInvoice
  const siRes = await api("GET", `/supplierInvoice?invoiceDateFrom=2026-03-21&invoiceDateTo=2026-03-22&supplierId=${supplierId}&fields=*`);
  console.log("\nSupplierInvoices:", siRes.data?.values?.length);
  if (siRes.data?.values?.length > 0) {
    for (const si of siRes.data.values) {
      console.log(JSON.stringify(si, null, 2).slice(0, 2000));
    }
  }

  // ========== Approach B: POST /supplierInvoice with correct fields ==========
  console.log("\n=== APPROACH B: POST /supplierInvoice directly ===");
  // Try without the 'orders' field (which doesn't exist)
  const directRes = await api("POST", "/supplierInvoice", {
    invoiceNumber: INVOICE_NUM + "-B",
    invoiceDate: DATE,
    invoiceDueDate: DATE,
    supplier: { id: supplierId },
  });
  console.log("Direct POST:", directRes.status);
  if (directRes.status < 400) {
    console.log("Created SI:", JSON.stringify(directRes.data?.value, null, 2).slice(0, 1000));
  }
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
