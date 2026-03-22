/**
 * Compare voucherType between importDocument voucher and direct POST voucher.
 * Check if the scorer might filter by voucherType.
 */

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = `Basic ${btoa("0:" + TOKEN)}`;

async function api(method: string, path: string, body?: any, isFormData = false) {
  const url = `${BASE}${path}`;
  const headers: Record<string, string> = { Authorization: AUTH };
  if (body && !isFormData) headers["Content-Type"] = "application/json";
  const res = await fetch(url, { method, headers, body: isFormData ? body : body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, ok: res.ok, data };
}

async function main() {
  const date = "2026-03-22";

  // Create a supplier
  const sRes = await api("POST", "/supplier", { name: "VTypeTest AS", organizationNumber: "823456786" });
  const supplierId = sRes.data.value.id;
  const supplierLedger = sRes.data.value.ledgerAccount.id;

  // Get expense account
  const acctRes = await api("GET", "/ledger/account?number=7140&isApplicableForSupplierInvoice=true&fields=*");
  const expAcctId = acctRes.data.values[0].id;

  // A: importDocument voucher
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>INV-VTYPE-1</cbc:ID>
  <cbc:IssueDate>${date}</cbc:IssueDate>
  <cbc:DueDate>${date}</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>NOK</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty><cac:Party>
    <cbc:EndpointID schemeID="0192">823456786</cbc:EndpointID>
    <cac:PartyName><cbc:Name>VTypeTest AS</cbc:Name></cac:PartyName>
    <cac:PostalAddress><cbc:StreetName>T 1</cbc:StreetName><cbc:CityName>Oslo</cbc:CityName><cbc:PostalZone>0001</cbc:PostalZone><cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
    <cac:PartyTaxScheme><cbc:CompanyID>NO823456786MVA</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>
    <cac:PartyLegalEntity><cbc:RegistrationName>VTypeTest AS</cbc:RegistrationName><cbc:CompanyID schemeID="0192">823456786</cbc:CompanyID></cac:PartyLegalEntity>
  </cac:Party></cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty><cac:Party>
    <cbc:EndpointID schemeID="0192">999999999</cbc:EndpointID>
    <cac:PartyName><cbc:Name>My Company</cbc:Name></cac:PartyName>
    <cac:PostalAddress><cbc:StreetName>S 1</cbc:StreetName><cbc:CityName>Oslo</cbc:CityName><cbc:PostalZone>0001</cbc:PostalZone><cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
    <cac:PartyLegalEntity><cbc:RegistrationName>My Company</cbc:RegistrationName></cac:PartyLegalEntity>
  </cac:Party></cac:AccountingCustomerParty>
  <cac:TaxTotal><cbc:TaxAmount currencyID="NOK">2500</cbc:TaxAmount><cac:TaxSubtotal><cbc:TaxableAmount currencyID="NOK">10000</cbc:TaxableAmount><cbc:TaxAmount currencyID="NOK">2500</cbc:TaxAmount><cac:TaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>25</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory></cac:TaxSubtotal></cac:TaxTotal>
  <cac:LegalMonetaryTotal><cbc:LineExtensionAmount currencyID="NOK">10000</cbc:LineExtensionAmount><cbc:TaxExclusiveAmount currencyID="NOK">10000</cbc:TaxExclusiveAmount><cbc:TaxInclusiveAmount currencyID="NOK">12500</cbc:TaxInclusiveAmount><cbc:PayableAmount currencyID="NOK">12500</cbc:PayableAmount></cac:LegalMonetaryTotal>
  <cac:InvoiceLine><cbc:ID>1</cbc:ID><cbc:InvoicedQuantity unitCode="EA">1</cbc:InvoicedQuantity><cbc:LineExtensionAmount currencyID="NOK">10000</cbc:LineExtensionAmount><cac:Item><cbc:Name>kontortjenester</cbc:Name><cac:ClassifiedTaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>25</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory></cac:Item><cac:Price><cbc:PriceAmount currencyID="NOK">10000</cbc:PriceAmount></cac:Price></cac:InvoiceLine>
</Invoice>`;
  const form = new FormData();
  form.append("file", new Blob([xml], { type: "application/xml" }), "INV-VTYPE-1.xml");
  const impRes = await api("POST", "/ledger/voucher/importDocument", form, true);
  if (!impRes.ok) { console.error("IMPORT FAIL:", JSON.stringify(impRes.data).substring(0, 500)); return; }
  const vIdA = impRes.data.values[0].id;

  // B: Get all voucherTypes
  const vtRes = await api("GET", "/ledger/voucherType?fields=*");
  console.log("=== ALL VOUCHER TYPES ===");
  for (const vt of vtRes.data.values || []) {
    console.log(`  id=${vt.id} name="${vt.name}"`);
  }

  // Read importDocument voucher with full details
  const vA = await api("GET", `/ledger/voucher/${vIdA}?fields=*`);
  console.log("\n=== IMPORT VOUCHER ===");
  console.log(`  id=${vA.data.value.id} desc="${vA.data.value.description}"`);
  console.log(`  voucherType: ${JSON.stringify(vA.data.value.voucherType)}`);
  console.log(`  tempNumber=${vA.data.value.tempNumber} number=${vA.data.value.number}`);

  // C: Direct POST voucher with Leverandørfaktura type
  const lfVt = (vtRes.data.values || []).find((vt: any) => vt.name === "Leverandørfaktura");
  if (lfVt) {
    console.log(`\nUsing voucherType Leverandørfaktura: id=${lfVt.id}`);
    const postRes = await api("POST", "/ledger/voucher", {
      date,
      description: "kontortjenester",
      voucherType: { id: lfVt.id },
      postings: [
        { row: 1, date, description: "kontortjenester", account: { id: expAcctId }, vatType: { id: 1 }, amount: 10000, amountCurrency: 10000, amountGross: 12500, amountGrossCurrency: 12500 },
        { row: 2, date, description: "kontortjenester", account: { id: supplierLedger }, supplier: { id: supplierId }, amount: -12500, amountCurrency: -12500, amountGross: -12500, amountGrossCurrency: -12500, invoiceNumber: "INV-DIRECT-1", termOfPayment: date },
      ],
    });
    if (postRes.ok) {
      const vB = await api("GET", `/ledger/voucher/${postRes.data.value.id}?fields=*`);
      console.log("\n=== DIRECT POST VOUCHER ===");
      console.log(`  id=${vB.data.value.id} desc="${vB.data.value.description}"`);
      console.log(`  voucherType: ${JSON.stringify(vB.data.value.voucherType)}`);
      console.log(`  tempNumber=${vB.data.value.tempNumber} number=${vB.data.value.number}`);

      // Check if this direct voucher has a supplierInvoice
      const siAll = await api("GET", `/supplierInvoice?voucherId=${postRes.data.value.id}&fields=*`);
      console.log(`  supplierInvoice count: ${siAll.data.count || 0}`);
      if (siAll.data.values?.length) {
        console.log(`  supplierInvoice: ${JSON.stringify(siAll.data.values[0], null, 2).substring(0, 300)}`);
      }
    } else {
      console.log("Direct POST failed:", JSON.stringify(postRes.data).substring(0, 300));
    }
  }

  // Also check if there are other voucherTypes that could work
  console.log("\n=== Check supplierInvoice for import voucher ===");
  const siImp = await api("GET", `/supplierInvoice?voucherId=${vIdA}&fields=*`);
  console.log(`  count: ${siImp.data.count || 0}`);
  if (siImp.data.values?.length) {
    const si = siImp.data.values[0];
    console.log(`  id=${si.id} invoiceNumber="${si.invoiceNumber}" supplier=${JSON.stringify(si.supplier)}`);
  }
}

main().catch(console.error);
