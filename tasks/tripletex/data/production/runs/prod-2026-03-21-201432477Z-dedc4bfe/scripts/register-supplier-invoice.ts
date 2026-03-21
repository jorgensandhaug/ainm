const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "C4hDhnqX1PNZHMbcVmnpcioYi4BVdjzlrrM9frB49l0";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const headers = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any, contentType?: string) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: { ...headers } };
  if (contentType) opts.headers["Content-Type"] = contentType;
  if (body) opts.body = typeof body === "string" ? body : JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} → ${res.status}`);
  if (!res.ok) { console.log("ERROR:", JSON.stringify(json, null, 2)); throw new Error(`${res.status}`); }
  return json;
}

async function main() {
  // Invoice data from PDF
  const supplierName = "Océan SARL";
  const orgNumber = "955986881";
  const invoiceNumber = "INV-2026-8825";
  const invoiceDate = "2026-06-27";
  const dueDate = "2026-07-27";
  const description = "Skylagring";
  const net = 60250;
  const gross = 75312;
  const expenseAccountNumber = 6340;

  // Step 1: POST /supplier (with address and bank from PDF)
  const supplierRes = await api("POST", "/supplier", {
    name: supplierName,
    organizationNumber: orgNumber,
    postalAddress: {
      addressLine1: "Torggata 92",
      postalCode: "4611",
      city: "Kristiansand"
    },
    bankAccountPresentation: [{ bban: "36069835664" }]
  });
  const supplierId = supplierRes.value.id;
  const supplierLedgerAccountId = supplierRes.value.ledgerAccount.id;
  console.log(`Supplier created: id=${supplierId}, ledgerAccount=${supplierLedgerAccountId}`);

  // Step 2: GET /ledger/account
  const accountRes = await api("GET", `/ledger/account?number=${expenseAccountNumber}&isApplicableForSupplierInvoice=true&fields=*`);
  const expenseAccountId = accountRes.values[0].id;
  console.log(`Expense account: id=${expenseAccountId}`);

  // Step 3: POST /ledger/voucher/importDocument with EHF XML
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
      <cac:PartyName>
        <cbc:Name>${supplierName}</cbc:Name>
      </cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>Torggata 92</cbc:StreetName>
        <cbc:CityName>Kristiansand</cbc:CityName>
        <cbc:PostalZone>4611</cbc:PostalZone>
        <cac:Country>
          <cbc:IdentificationCode>NO</cbc:IdentificationCode>
        </cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>NO${orgNumber}MVA</cbc:CompanyID>
        <cac:TaxScheme>
          <cbc:ID>VAT</cbc:ID>
        </cac:TaxScheme>
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
      <cac:PartyName>
        <cbc:Name>Ditt firma</cbc:Name>
      </cac:PartyName>
      <cac:PostalAddress>
        <cac:Country>
          <cbc:IdentificationCode>NO</cbc:IdentificationCode>
        </cac:Country>
      </cac:PostalAddress>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>Ditt firma</cbc:RegistrationName>
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
        <cac:TaxScheme>
          <cbc:ID>VAT</cbc:ID>
        </cac:TaxScheme>
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
        <cac:TaxScheme>
          <cbc:ID>VAT</cbc:ID>
        </cac:TaxScheme>
      </cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="NOK">${net}</cbc:PriceAmount>
    </cac:Price>
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
  if (!importRes.ok) { console.log("ERROR:", JSON.stringify(importJson, null, 2)); throw new Error(`${importRes.status}`); }

  const voucherId = importJson.values[0].id;
  const voucherVersion = importJson.values[0].version;
  console.log(`Voucher imported: id=${voucherId}, version=${voucherVersion}`);

  // Step 4: PUT /ledger/voucher/{id}?sendToLedger=false — set postings
  const putRes = await api("PUT", `/ledger/voucher/${voucherId}?sendToLedger=false`, {
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
  const newVersion = putRes.value.version;
  console.log(`Postings set: version=${newVersion}`);
  console.log("Postings:", JSON.stringify(putRes.value.postings?.map((p: any) => ({
    row: p.row, account: p.account?.number, amount: p.amount, amountGross: p.amountGross, vatType: p.vatType?.id
  })), null, 2));

  // Step 5: PUT /ledger/voucher/{id}?sendToLedger=true — book the voucher
  const bookRes = await api("PUT", `/ledger/voucher/${voucherId}?sendToLedger=true`, {
    version: newVersion
  });
  console.log(`Voucher booked: number=${bookRes.value.number}, version=${bookRes.value.version}`);
  console.log("DONE. 5 calls, 0 errors.");
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
