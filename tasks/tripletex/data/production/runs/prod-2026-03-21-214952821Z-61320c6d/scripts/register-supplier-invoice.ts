const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "-soVOxiMMtf-GaepleEEyMWuuVwJQAXWiQLqNJuNOew";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function api(method: string, path: string, body?: any, contentType?: string) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: { Authorization: AUTH } };
  if (body && contentType) {
    opts.headers["Content-Type"] = contentType;
    opts.body = body;
  } else if (body) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  const r = await fetch(url, opts);
  const text = await r.text();
  console.log(`${method} ${path} → ${r.status}`);
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  if (!r.ok) { console.log("ERROR:", JSON.stringify(json).slice(0, 800)); throw new Error(`${r.status}`); }
  return json;
}

async function main() {
  // Supplier already created in previous run: id=108434304, ledgerAccount=474142152
  const supplierId = 108434304;
  const supplierLedgerAccountId = 474142152;
  const expenseAccountId = 474142348; // 6300, also already resolved

  // Step 3: POST /ledger/voucher/importDocument with EHF XML
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>INV-2026-8221</cbc:ID>
  <cbc:IssueDate>2026-06-10</cbc:IssueDate>
  <cbc:DueDate>2026-07-10</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>NOK</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0192">804872205</cbc:EndpointID>
      <cac:PostalAddress>
        <cbc:StreetName>Solveien 92</cbc:StreetName>
        <cbc:CityName>Bodø</cbc:CityName>
        <cbc:PostalZone>8006</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>NO804872205MVA</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>Fjelltopp AS</cbc:RegistrationName>
        <cbc:CompanyID schemeID="0192">804872205</cbc:CompanyID>
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
      <cac:PartyTaxScheme>
        <cbc:CompanyID>NO999999999MVA</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
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
  const importText = await importRes.text();
  console.log(`POST /ledger/voucher/importDocument → ${importRes.status}`);
  let importJson: any;
  try { importJson = JSON.parse(importText); } catch { importJson = importText; }
  if (!importRes.ok) { console.log("ERROR:", JSON.stringify(importJson).slice(0, 800)); throw new Error(`${importRes.status}`); }

  // CRITICAL: response is { values: [...] }, NOT { value: {...} }
  const voucherId = importJson.values[0].id;
  let voucherVersion = importJson.values[0].version;
  console.log("Imported voucher:", voucherId, "version:", voucherVersion);

  // Step 4: PUT /ledger/voucher/{id}?sendToLedger=false — set postings
  const putPostingsRes = await api("PUT", `/ledger/voucher/${voucherId}?sendToLedger=false`, {
    version: voucherVersion,
    postings: [
      {
        row: 1,
        account: { id: expenseAccountId },
        description: "Nettverkstjenester",
        vatType: { id: 1 },
        amount: 48400,
        amountCurrency: 48400,
        amountGross: 60500,
        amountGrossCurrency: 60500
      },
      {
        row: 2,
        account: { id: supplierLedgerAccountId },
        supplier: { id: supplierId },
        description: "Nettverkstjenester",
        amount: -60500,
        amountCurrency: -60500,
        amountGross: -60500,
        amountGrossCurrency: -60500,
        invoiceNumber: "INV-2026-8221",
        termOfPayment: "2026-07-10"
      }
    ]
  });
  voucherVersion = putPostingsRes.value.version;
  console.log("Postings set, new version:", voucherVersion);
  console.log("Postings:", JSON.stringify(putPostingsRes.value.postings?.map((p: any) => ({
    row: p.row, account: p.account?.number, amount: p.amount, amountGross: p.amountGross, vatType: p.vatType?.id
  }))));

  // Step 5: PUT /ledger/voucher/{id}?sendToLedger=true — book the voucher (ONLY version, NO postings)
  const bookRes = await api("PUT", `/ledger/voucher/${voucherId}?sendToLedger=true`, {
    version: voucherVersion
  });
  console.log("Voucher booked, number:", bookRes.value.number, "version:", bookRes.value.version);
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
