// Sandbox test: can we skip GET /ledger/account by passing account number+name in PUT postings?
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const headers = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: { ...headers } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  console.log(`\n>>> ${method} ${path}`);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`<<< ${r.status}`);
  console.log(JSON.stringify(json, null, 2));
  return { status: r.status, ok: r.ok, json };
}

async function main() {
  const ts = Date.now();
  const orgNumber = "889157917"; // Known valid mod11

  // Step 1: Create a fresh supplier
  const supResp = await api("POST", "/supplier", {
    name: `SandboxAcctTest ${ts}`,
    organizationNumber: orgNumber,
  });
  if (!supResp.ok) throw new Error("Supplier create failed");
  const supplierId = supResp.json.value.id;
  const supplierLedgerAccountId = supResp.json.value.ledgerAccount.id;
  console.log(`\nSupplier: ${supplierId}, Ledger Account: ${supplierLedgerAccountId}`);

  // Step 2: Import EHF
  const invoiceDate = "2026-03-21";
  const dueDate = "2026-04-20";
  const invNumber = `INV-SBX-ACCTNAME-${ts}`;
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${invNumber}</cbc:ID>
  <cbc:IssueDate>${invoiceDate}</cbc:IssueDate>
  <cbc:DueDate>${dueDate}</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>NOK</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0192">${orgNumber}</cbc:EndpointID>
      <cac:PartyName><cbc:Name>SandboxAcctTest ${ts}</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>Testveien 1</cbc:StreetName>
        <cbc:CityName>Oslo</cbc:CityName>
        <cbc:PostalZone>0001</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>NO${orgNumber}MVA</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>SandboxAcctTest ${ts}</cbc:RegistrationName>
        <cbc:CompanyID schemeID="0192">${orgNumber}</cbc:CompanyID>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0192">999999999</cbc:EndpointID>
      <cac:PartyName><cbc:Name>Buyer</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>Testveien 1</cbc:StreetName>
        <cbc:CityName>Oslo</cbc:CityName>
        <cbc:PostalZone>0001</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>NO999999999MVA</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>Buyer</cbc:RegistrationName>
        <cbc:CompanyID schemeID="0192">999999999</cbc:CompanyID>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="NOK">5000</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="NOK">20000</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="NOK">5000</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>25</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="NOK">20000</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="NOK">20000</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="NOK">25000</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="NOK">25000</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  <cac:InvoiceLine>
    <cbc:ID>1</cbc:ID>
    <cbc:InvoicedQuantity unitCode="EA">1</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="NOK">20000</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Name>Test item</cbc:Name>
      <cac:ClassifiedTaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>25</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="NOK">20000</cbc:PriceAmount>
    </cac:Price>
  </cac:InvoiceLine>
</Invoice>`;

  const formData = new FormData();
  formData.append("file", new Blob([xml], { type: "application/xml" }), `${invNumber}.xml`);
  formData.append("split", "false");
  const importResp = await fetch(`${BASE}/ledger/voucher/importDocument`, {
    method: "POST",
    headers: { Authorization: AUTH },
    body: formData,
  });
  const importText = await importResp.text();
  const importJson = JSON.parse(importText);
  console.log(`\n>>> POST /ledger/voucher/importDocument`);
  console.log(`<<< ${importResp.status}`);
  if (!importResp.ok) { console.log(JSON.stringify(importJson, null, 2)); throw new Error("Import failed"); }

  const voucherId = importJson.values[0].id;
  let voucherVersion = importJson.values[0].version;
  console.log(`Voucher: ${voucherId}, Version: ${voucherVersion}`);

  // TEST A: PUT with account by { number, name }
  console.log("\n========= TEST A: account { number: 6500, name: 'Motordrevet verktøy' } =========");
  const putA = await api("PUT", `/ledger/voucher/${voucherId}?sendToLedger=false`, {
    version: voucherVersion,
    postings: [
      {
        row: 1,
        account: { number: 6500, name: "Motordrevet verktøy" },
        description: "Test item",
        vatType: { id: 1 },
        amount: 20000,
        amountCurrency: 20000,
        amountGross: 25000,
        amountGrossCurrency: 25000,
      },
      {
        row: 2,
        account: { id: supplierLedgerAccountId },
        supplier: { id: supplierId },
        description: "Test item",
        amount: -25000,
        amountCurrency: -25000,
        amountGross: -25000,
        amountGrossCurrency: -25000,
        invoiceNumber: invNumber,
        termOfPayment: dueDate,
      },
    ],
  });

  if (putA.ok) {
    console.log("\n*** SUCCESS: account { number, name } works! GET /ledger/account can be skipped! ***");
    voucherVersion = putA.json.value.version;
    // Book it to confirm full flow works
    const bookResp = await api("PUT", `/ledger/voucher/${voucherId}?sendToLedger=true`, { version: voucherVersion });
    console.log(`Booking: ${bookResp.ok ? 'OK' : 'FAILED'}, number: ${bookResp.ok ? bookResp.json.value.number : 'N/A'}`);
  } else {
    console.log("\n*** FAILED: account { number, name } does not work. ***");
    console.log("GET /ledger/account remains required. 5-call path is the true minimum.");
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
