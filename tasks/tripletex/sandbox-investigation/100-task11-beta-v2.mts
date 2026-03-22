/**
 * Try the BETA PUT /supplierInvoice/voucher/{id}/postings with different formats
 */

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + Buffer.from("0:" + TOKEN).toString("base64");

async function api(method: string, path: string, body?: any, isFormData = false): Promise<{ok: boolean, status: number, data: any}> {
  const url = `${BASE}${path}`;
  const headers: Record<string, string> = { Authorization: AUTH, Accept: "application/json" };
  if (!isFormData && body) headers["Content-Type"] = "application/json; charset=utf-8";
  const res = await fetch(url, {
    method,
    headers,
    body: isFormData ? body : body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  console.log(`${method} ${path} => ${res.status}`);
  if (!res.ok) console.log(`  ERROR: ${text.substring(0, 500)}`);
  return { ok: res.ok, status: res.status, data };
}

const uid = Date.now().toString(36);
const orgNumber = "848657514";
const date = "2026-03-22";

async function main() {
  // Setup
  const supplierRes = await api("POST", "/supplier", {
    name: `BetaV2-${uid}`,
    organizationNumber: orgNumber,
  });
  const supplierId = supplierRes.data.value.id;
  const supplierLedgerAccountId = supplierRes.data.value.ledgerAccount.id;

  const acctRes = await api("GET", "/ledger/account?number=6300&isApplicableForSupplierInvoice=true&fields=*");
  const expenseAccountId = acctRes.data.values[0].id;

  // Get vatType id=1 details
  const vatRes = await api("GET", "/ledger/vatType/1?fields=*");
  console.log(`VatType 1: ${JSON.stringify(vatRes.data.value, null, 2)}`);

  // Get incoming vatTypes
  const vatListRes = await api("GET", "/ledger/vatType?typeOfVat=INCOMING&vatDate=2026-03-22&fields=*");
  if (vatListRes.ok) {
    for (const vt of (vatListRes.data.values || []).slice(0, 5)) {
      console.log(`  vatType: id=${vt.id}, number=${vt.number}, percentage=${vt.percentage}, name=${vt.name || vt.displayName}`);
    }
  }

  // Import EHF
  const invoiceNumber = `INV-BV2-${uid}`;
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
      <cac:PartyName><cbc:Name>BetaV2-${uid}</cbc:Name></cac:PartyName>
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
        <cbc:RegistrationName>BetaV2-${uid}</cbc:RegistrationName>
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

  const form = new FormData();
  form.append("file", new Blob([xml], { type: "application/xml" }), `${invoiceNumber}.xml`);
  const importRes = await api("POST", "/ledger/voucher/importDocument", form, true);
  const voucherId = importRes.data.values[0].id;
  console.log(`Voucher: id=${voucherId}`);

  // Get SI and orderLine
  const siSearch = await api("GET", `/supplierInvoice?supplierId=${supplierId}&invoiceDateFrom=2026-01-01&invoiceDateTo=2026-12-31&fields=*,orderLines(*)`);
  const orderLineId = siSearch.data.values?.[0]?.orderLines?.[0]?.id;
  const orderLineVatType = siSearch.data.values?.[0]?.orderLines?.[0]?.vatType;
  console.log(`OrderLine: id=${orderLineId}, vatType=${JSON.stringify(orderLineVatType)}`);

  // Try different vatType approaches
  const attempts = [
    { label: "No vatType at all", posting: { row: 1, account: { id: expenseAccountId }, amount: 40000, amountGross: 50000 } },
    { label: "vatType from orderLine (id:1)", posting: { row: 1, account: { id: expenseAccountId }, vatType: orderLineVatType, amount: 40000, amountGross: 50000 } },
    { label: "Minimal posting", posting: { account: { id: expenseAccountId }, amount: 40000 } },
  ];

  for (const attempt of attempts) {
    console.log(`\n--- Attempt: ${attempt.label} ---`);
    const r = await api("PUT", `/supplierInvoice/voucher/${voucherId}/postings?sendToLedger=false`, [
      {
        orderLine: { id: orderLineId },
        posting: attempt.posting,
      }
    ]);
    if (r.ok) {
      console.log(`  SUCCESS! SI: ${JSON.stringify(r.data.value, null, 2).substring(0, 500)}`);
      break;
    }
  }

  // Also try without orderLine
  console.log("\n--- Attempt: No orderLine, just posting ---");
  const r2 = await api("PUT", `/supplierInvoice/voucher/${voucherId}/postings?sendToLedger=false`, [
    {
      posting: { row: 1, account: { id: expenseAccountId }, amount: 40000 },
    }
  ]);
  if (r2.ok) {
    console.log(`  SUCCESS!`);
  }

  console.log("\n=== DONE ===");
}

main().catch(e => { console.error(e); process.exit(1); });
