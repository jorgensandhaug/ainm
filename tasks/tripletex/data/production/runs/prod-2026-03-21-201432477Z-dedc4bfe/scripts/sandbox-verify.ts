// Sandbox verification: test if there's any way to combine postings+booking in one PUT
// or skip the GET /ledger/account lookup

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const headers = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: { ...headers } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} → ${res.status}`);
  if (!res.ok) console.log("ERROR:", typeof json === 'string' ? json : JSON.stringify(json, null, 2));
  return { ok: res.ok, status: res.status, json };
}

async function main() {
  const ts = Date.now();
  const supplierName = `SandboxVerify ${ts}`;
  const orgNumber = "955986881";
  const invoiceNumber = `INV-SBX-${ts}`;
  const invoiceDate = "2026-03-21";
  const dueDate = "2026-04-21";
  const description = "Skylagring";
  const net = 60250;
  const gross = 75312;

  // Step 1: POST /supplier
  const s = await api("POST", "/supplier", {
    name: supplierName,
    organizationNumber: orgNumber,
  });
  if (!s.ok) return;
  const supplierId = s.json.value.id;
  const supplierLedgerAccountId = s.json.value.ledgerAccount.id;
  console.log(`Supplier: id=${supplierId}, ledgerAccount=${supplierLedgerAccountId}`);

  // Step 2: GET /ledger/account
  const a = await api("GET", "/ledger/account?number=6340&isApplicableForSupplierInvoice=true&fields=*");
  if (!a.ok) return;
  const expenseAccountId = a.json.values[0].id;
  console.log(`Account 6340: id=${expenseAccountId}`);

  // Step 3: POST importDocument
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${invoiceNumber}</cbc:ID>
  <cbc:IssueDate>${invoiceDate}</cbc:IssueDate>
  <cbc:DueDate>${dueDate}</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>NOK</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0192">${orgNumber}</cbc:EndpointID>
      <cac:PartyName><cbc:Name>${supplierName}</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>Test</cbc:StreetName>
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
      <cac:PartyName><cbc:Name>Buyer</cbc:Name></cac:PartyName>
      <cac:PostalAddress><cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>Buyer</cbc:RegistrationName>
        <cbc:CompanyID schemeID="0192">999999999</cbc:CompanyID>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="NOK">${gross - net}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="NOK">${net}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="NOK">${gross - net}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>25</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:TaxCategory>
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
    <cac:Item>
      <cbc:Name>${description}</cbc:Name>
      <cac:ClassifiedTaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>25</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="NOK">${net}</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>
</Invoice>`;

  const formData = new FormData();
  formData.append("file", new Blob([xml], { type: "text/xml" }), `${invoiceNumber}.xml`);
  const importRes = await fetch(`${BASE}/ledger/voucher/importDocument`, {
    method: "POST",
    headers: { Authorization: AUTH },
    body: formData
  });
  const importJson = await importRes.json();
  console.log(`POST /ledger/voucher/importDocument → ${importRes.status}`);
  if (!importRes.ok) { console.log("ERROR:", JSON.stringify(importJson, null, 2)); return; }

  const voucherId = importJson.values[0].id;
  const voucherVersion = importJson.values[0].version;
  console.log(`Voucher: id=${voucherId}, version=${voucherVersion}`);

  // TEST: Can we combine postings + sendToLedger=true in ONE PUT?
  console.log("\n=== TEST: postings + sendToLedger=true in ONE PUT ===");
  const combinedRes = await api("PUT", `/ledger/voucher/${voucherId}?sendToLedger=true`, {
    version: voucherVersion,
    postings: [
      {
        row: 1,
        account: { id: expenseAccountId },
        description: description,
        vatType: { id: 1 },
        amount: net,
        amountCurrency: net,
        amountGross: gross,
        amountGrossCurrency: gross
      },
      {
        row: 2,
        account: { id: supplierLedgerAccountId },
        supplier: { id: supplierId },
        description: description,
        amount: -gross,
        amountCurrency: -gross,
        amountGross: -gross,
        amountGrossCurrency: -gross,
        invoiceNumber: invoiceNumber,
        termOfPayment: dueDate
      }
    ]
  });

  if (combinedRes.ok) {
    console.log("COMBINED PUT SUCCEEDED! This would make it a 4-call path!");
    console.log("Voucher number:", combinedRes.json.value?.number);
    console.log("Postings:", JSON.stringify(combinedRes.json.value?.postings?.map((p: any) => ({
      row: p.row, account: p.account?.number, amount: p.amount, amountGross: p.amountGross
    })), null, 2));
  } else {
    console.log("Combined PUT failed as expected. 5 calls is the true minimum.");

    // Now do the proven 2-step approach
    console.log("\n=== Fallback: 2-step booking ===");
    const step4 = await api("PUT", `/ledger/voucher/${voucherId}?sendToLedger=false`, {
      version: voucherVersion,
      postings: [
        {
          row: 1,
          account: { id: expenseAccountId },
          description: description,
          vatType: { id: 1 },
          amount: net,
          amountCurrency: net,
          amountGross: gross,
          amountGrossCurrency: gross
        },
        {
          row: 2,
          account: { id: supplierLedgerAccountId },
          supplier: { id: supplierId },
          description: description,
          amount: -gross,
          amountCurrency: -gross,
          amountGross: -gross,
          amountGrossCurrency: -gross,
          invoiceNumber: invoiceNumber,
          termOfPayment: dueDate
        }
      ]
    });
    if (!step4.ok) return;
    const v2 = step4.json.value.version;
    console.log(`Postings set, version=${v2}`);

    const step5 = await api("PUT", `/ledger/voucher/${voucherId}?sendToLedger=true`, { version: v2 });
    if (!step5.ok) return;
    console.log(`Booked: number=${step5.json.value.number}, version=${step5.json.value.version}`);
  }
}

main().catch(e => console.error("FATAL:", e.message));
