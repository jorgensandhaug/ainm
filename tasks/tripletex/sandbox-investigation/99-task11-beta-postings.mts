/**
 * Task 11: Test the BETA PUT /supplierInvoice/voucher/{id}/postings endpoint
 *
 * This is the endpoint specifically designed for supplier invoice postings.
 * It's BETA and might return 403, but it's worth testing.
 *
 * Also test: What if we skip postings entirely and just let the import handle everything?
 */

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + Buffer.from("0:" + TOKEN).toString("base64");

async function api(method: string, path: string, body?: any, isFormData = false): Promise<{ok: boolean, status: number, data: any}> {
  const url = `${BASE}${path}`;
  const headers: Record<string, string> = { Authorization: AUTH, Accept: "application/json" };
  if (!isFormData && body) headers["Content-Type"] = "application/json";
  const res = await fetch(url, {
    method,
    headers,
    body: isFormData ? body : body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  console.log(`${method} ${path} => ${res.status}`);
  if (!res.ok) {
    console.log(`  ERROR: ${text.substring(0, 400)}`);
  }
  return { ok: res.ok, status: res.status, data };
}

const uid = Date.now().toString(36);
const orgNumber = "848657514";
const date = "2026-03-22";
const dueDate = "2026-04-22";
const gross = 50000;
const net = 40000;

function buildXml(invoiceNumber: string, supplierName: string) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${invoiceNumber}</cbc:ID>
  <cbc:IssueDate>${date}</cbc:IssueDate>
  <cbc:DueDate>${dueDate}</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>NOK</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0192">${orgNumber}</cbc:EndpointID>
      <cac:PartyName><cbc:Name>${supplierName}</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>Storgata 1</cbc:StreetName>
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
      <cbc:EndpointID schemeID="0192">999999999</cbc:EndpointID>
      <cac:PartyName><cbc:Name>My Company</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>Testveien 1</cbc:StreetName>
        <cbc:CityName>Oslo</cbc:CityName>
        <cbc:PostalZone>0001</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>My Company</cbc:RegistrationName>
        <cbc:CompanyID schemeID="0192">999999999</cbc:CompanyID>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="NOK">10000</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="NOK">40000</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="NOK">10000</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>25</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="NOK">40000</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="NOK">40000</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="NOK">50000</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="NOK">50000</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  <cac:InvoiceLine>
    <cbc:ID>1</cbc:ID>
    <cbc:InvoicedQuantity unitCode="EA">1</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="NOK">40000</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Name>kontortjenester</cbc:Name>
      <cac:ClassifiedTaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>25</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="NOK">40000</cbc:PriceAmount>
    </cac:Price>
  </cac:InvoiceLine>
</Invoice>`;
}

async function main() {
  // Setup
  const supplierName = `BetaTest-${uid}`;
  const invoiceNumber = `INV-BETA-${uid}`;

  const supplierRes = await api("POST", "/supplier", {
    name: supplierName,
    organizationNumber: orgNumber,
  });
  const supplierId = supplierRes.data.value.id;
  const supplierLedgerAccountId = supplierRes.data.value.ledgerAccount.id;
  console.log(`Supplier: id=${supplierId}, ledger=${supplierLedgerAccountId}`);

  const acctRes = await api("GET", "/ledger/account?number=6300&isApplicableForSupplierInvoice=true&fields=*");
  const expenseAccountId = acctRes.data.values[0].id;
  console.log(`Expense account id=${expenseAccountId}`);

  // Import EHF
  const xml = buildXml(invoiceNumber, supplierName);
  const form = new FormData();
  form.append("file", new Blob([xml], { type: "application/xml" }), `${invoiceNumber}.xml`);
  const importRes = await api("POST", "/ledger/voucher/importDocument", form, true);
  const voucherId = importRes.data.values[0].id;
  console.log(`Voucher: id=${voucherId}`);

  // Find the supplier invoice
  const siSearch = await api("GET", `/supplierInvoice?supplierId=${supplierId}&invoiceDateFrom=2026-01-01&invoiceDateTo=2026-12-31&fields=*,orderLines(*)`);
  const siId = siSearch.data.values?.[0]?.id;
  console.log(`SupplierInvoice: id=${siId}`);
  console.log(`  orderLines: ${JSON.stringify(siSearch.data.values?.[0]?.orderLines)}`);

  // Get the orderLine id
  const orderLineId = siSearch.data.values?.[0]?.orderLines?.[0]?.id;
  console.log(`  orderLine id: ${orderLineId}`);

  // TEST 1: Try the BETA PUT /supplierInvoice/voucher/{id}/postings
  console.log("\n=== TEST 1: BETA PUT /supplierInvoice/voucher/{id}/postings ===\n");

  const betaRes = await api("PUT", `/supplierInvoice/voucher/${voucherId}/postings?sendToLedger=false`, [
    {
      orderLine: { id: orderLineId },
      posting: {
        row: 1,
        account: { id: expenseAccountId },
        vatType: { id: 1 },
        amount: net,
        amountCurrency: net,
        amountGross: gross,
        amountGrossCurrency: gross,
      }
    }
  ]);

  if (betaRes.ok) {
    console.log("  BETA endpoint worked!");
    const si = betaRes.data.value;
    console.log(`  SI amount: ${si.amount}`);
    console.log(`  SI voucher.number: ${si.voucher?.number}`);
  }

  // TEST 2: Try the BETA with sendToLedger=true
  if (betaRes.ok) {
    console.log("\n=== TEST 2: BETA with sendToLedger=true ===\n");
    const betaBookRes = await api("PUT", `/supplierInvoice/voucher/${voucherId}/postings?sendToLedger=true`, [
      {
        orderLine: { id: orderLineId },
        posting: {
          row: 1,
          account: { id: expenseAccountId },
          vatType: { id: 1 },
          amount: net,
          amountCurrency: net,
          amountGross: gross,
          amountGrossCurrency: gross,
        }
      }
    ]);

    if (betaBookRes.ok) {
      console.log("  BETA booking worked!");
      const si = betaBookRes.data.value;
      console.log(`  SI amount: ${si.amount}`);
      console.log(`  SI voucher.number: ${si.voucher?.number}`);
    }
  }

  // TEST 3: Import-only (no postings at all) — what does the scorer see?
  console.log("\n=== TEST 3: Import-only (no postings manipulation) ===\n");
  const invImportOnly = `INV-IMPORTONLY-${uid}`;
  const supplierName2 = `ImportOnly-${uid}`;
  const supplier2Res = await api("POST", "/supplier", {
    name: supplierName2,
    organizationNumber: orgNumber,
  });
  const supplier2Id = supplier2Res.data.value.id;

  const xml2 = buildXml(invImportOnly, supplierName2);
  const form2 = new FormData();
  form2.append("file", new Blob([xml2], { type: "application/xml" }), `${invImportOnly}.xml`);
  const importRes2 = await api("POST", "/ledger/voucher/importDocument", form2, true);
  const voucher2Id = importRes2.data.values[0].id;
  console.log(`Voucher2: id=${voucher2Id}`);

  // Read the SI state WITHOUT any postings manipulation
  const si2Search = await api("GET", `/supplierInvoice?supplierId=${supplier2Id}&invoiceDateFrom=2026-01-01&invoiceDateTo=2026-12-31&fields=*,voucher(*,postings(*)),orderLines(*)`);
  if (si2Search.data.values?.length > 0) {
    const si2 = si2Search.data.values[0];
    console.log(`  SI id: ${si2.id}`);
    console.log(`  SI invoiceNumber: ${si2.invoiceNumber}`);
    console.log(`  SI amount: ${si2.amount}`);
    console.log(`  SI amountExcludingVat: ${si2.amountExcludingVat}`);
    console.log(`  SI voucher.number: ${si2.voucher?.number}`);
    console.log(`  SI voucher postings: ${si2.voucher?.postings?.length}`);
    if (si2.voucher?.postings) {
      for (const p of si2.voucher.postings) {
        console.log(`    posting: row=${p.row}, account=${p.account?.number}, amount=${p.amount}, amountGross=${p.amountGross}, vatType=${p.vatType?.id}`);
      }
    }
    console.log(`  SI orderLines: ${si2.orderLines?.length}`);
    if (si2.orderLines) {
      for (const ol of si2.orderLines) {
        console.log(`    orderLine: ${ol.description}, unitCostCurrency=${ol.unitCostCurrency}, amountExcVat=${ol.amountExcludingVatCurrency}, amountIncVat=${ol.amountIncludingVatCurrency}, account=${ol.account?.id}`);
      }
    }
  }

  console.log("\n=== DONE ===");
}

main().catch(e => { console.error(e); process.exit(1); });
