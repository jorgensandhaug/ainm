const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = `Basic ${btoa("0:" + TOKEN)}`;

async function api(method: string, path: string, body?: any, isFormData = false) {
  const url = `${BASE}${path}`;
  const headers: Record<string, string> = { Authorization: AUTH };
  if (!isFormData) headers["Content-Type"] = "application/json";
  const res = await fetch(url, { method, headers, body: isFormData ? body : body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  console.log(`${method} ${path.substring(0, 100)} → ${res.status}`);
  return { status: res.status, ok: res.ok, data };
}

async function main() {
  const date = "2026-03-22";
  const gross = 12500;
  const net = 10000;

  const sRes = await api("POST", "/supplier", { name: "OrderLineSI AS", organizationNumber: "823456789" });
  const supplierId = sRes.data.value.id;
  const supplierLedger = sRes.data.value.ledgerAccount.id;
  const acctRes = await api("GET", "/ledger/account?number=7140&isApplicableForSupplierInvoice=true&fields=id");
  const expAcctId = acctRes.data.values[0].id;
  const vtRes = await api("GET", "/ledger/voucherType?name=Leverand%C3%B8rfaktura&fields=id");
  const vtId = vtRes.data.values[0].id;

  // First: create via importDocument to see full SI schema
  console.log("=== importDocument baseline ===");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>INV-OL-001</cbc:ID>
  <cbc:IssueDate>${date}</cbc:IssueDate>
  <cbc:DueDate>${date}</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>NOK</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty><cac:Party>
    <cbc:EndpointID schemeID="0192">823456789</cbc:EndpointID>
    <cac:PartyName><cbc:Name>OrderLineSI AS</cbc:Name></cac:PartyName>
    <cac:PostalAddress><cbc:StreetName>T 1</cbc:StreetName><cbc:CityName>Oslo</cbc:CityName><cbc:PostalZone>0001</cbc:PostalZone><cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
    <cac:PartyTaxScheme><cbc:CompanyID>NO823456789MVA</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>
    <cac:PartyLegalEntity><cbc:RegistrationName>OrderLineSI AS</cbc:RegistrationName><cbc:CompanyID schemeID="0192">823456789</cbc:CompanyID></cac:PartyLegalEntity>
  </cac:Party></cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty><cac:Party>
    <cbc:EndpointID schemeID="0192">999999999</cbc:EndpointID>
    <cac:PartyName><cbc:Name>My Co</cbc:Name></cac:PartyName>
    <cac:PostalAddress><cbc:StreetName>S 1</cbc:StreetName><cbc:CityName>Oslo</cbc:CityName><cbc:PostalZone>0001</cbc:PostalZone><cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
    <cac:PartyLegalEntity><cbc:RegistrationName>My Co</cbc:RegistrationName></cac:PartyLegalEntity>
  </cac:Party></cac:AccountingCustomerParty>
  <cac:TaxTotal><cbc:TaxAmount currencyID="NOK">2500</cbc:TaxAmount><cac:TaxSubtotal><cbc:TaxableAmount currencyID="NOK">10000</cbc:TaxableAmount><cbc:TaxAmount currencyID="NOK">2500</cbc:TaxAmount><cac:TaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>25</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory></cac:TaxSubtotal></cac:TaxTotal>
  <cac:LegalMonetaryTotal><cbc:LineExtensionAmount currencyID="NOK">10000</cbc:LineExtensionAmount><cbc:TaxExclusiveAmount currencyID="NOK">10000</cbc:TaxExclusiveAmount><cbc:TaxInclusiveAmount currencyID="NOK">12500</cbc:TaxInclusiveAmount><cbc:PayableAmount currencyID="NOK">12500</cbc:PayableAmount></cac:LegalMonetaryTotal>
  <cac:InvoiceLine><cbc:ID>1</cbc:ID><cbc:InvoicedQuantity unitCode="EA">1</cbc:InvoicedQuantity><cbc:LineExtensionAmount currencyID="NOK">10000</cbc:LineExtensionAmount><cac:Item><cbc:Name>kontortjenester</cbc:Name><cac:ClassifiedTaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>25</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory></cac:Item><cac:Price><cbc:PriceAmount currencyID="NOK">10000</cbc:PriceAmount></cac:Price></cac:InvoiceLine>
</Invoice>`;
  const form = new FormData();
  form.append("file", new Blob([xml], { type: "application/xml" }), "inv.xml");
  const imp = await api("POST", "/ledger/voucher/importDocument", form, true);
  if (!imp.ok) { console.error("Import fail:", JSON.stringify(imp.data).substring(0, 300)); return; }
  const impVoucherId = imp.data.values[0].id;

  // Find and dump the importDocument SI with ALL fields
  const siImp = await api("GET", `/supplierInvoice?invoiceDateFrom=${date}&invoiceDateTo=2026-03-23&fields=id,invoiceNumber,invoiceDate,invoiceDueDate,supplier(id,name),amount,amountCurrency,amountExcludingVat,amountExcludingVatCurrency,currency(id,code),voucher(id,number),outstandingAmount,isCreditNote,kidOrReceiverReference,orderLines(id,count,unitCostPrice,amountExcludingVatCurrency,vatType(id,number)),approvalListElements(id)`);
  for (const s of siImp.data.values || []) {
    if (s.voucher?.id === impVoucherId) {
      console.log("\nimportDocument SI:");
      console.log(JSON.stringify(s, null, 2));
      break;
    }
  }

  // Now try POST /supplierInvoice with orderLines
  console.log("\n=== POST /supplierInvoice with orderLines ===");
  
  // Discover orderLine fields by trial
  const tryFields = [
    // Try 1: minimal
    { description: "kontortjenester", count: 1, unitPrice: net, amountExcludingVatCurrency: net, vatType: { id: 1 } },
    // Try 2: with account
    { description: "kontortjenester", count: 1, unitPrice: net, amountExcludingVatCurrency: net, vatType: { id: 1 }, account: { id: expAcctId } },
  ];

  for (let i = 0; i < tryFields.length; i++) {
    const ol = tryFields[i];
    console.log(`\n  Try ${i+1}: ${JSON.stringify(Object.keys(ol))}`);
    const si = await api("POST", "/supplierInvoice", {
      invoiceDate: date,
      invoiceNumber: `INV-OLT-${i+1}`,
      supplier: { id: supplierId },
      currency: { id: 1 },
      orderLines: [ol],
      voucher: {
        date, description: "kontortjenester",
        voucherType: { id: vtId },
        postings: [
          { row: 1, date, description: "kontortjenester", account: { id: expAcctId }, vatType: { id: 1 }, amount: net, amountCurrency: net, amountGross: gross, amountGrossCurrency: gross },
          { row: 2, date, description: "kontortjenester", account: { id: supplierLedger }, supplier: { id: supplierId }, amount: -gross, amountCurrency: -gross, amountGross: -gross, amountGrossCurrency: -gross },
        ],
      },
    });
    console.log(`  Result: ${si.status} ${JSON.stringify(si.data).substring(0, 400)}`);
    if (si.ok) {
      console.log(`  amount=${si.data.value.amount} amountExVat=${si.data.value.amountExcludingVat}`);
    }
  }
}

main().catch(console.error);
