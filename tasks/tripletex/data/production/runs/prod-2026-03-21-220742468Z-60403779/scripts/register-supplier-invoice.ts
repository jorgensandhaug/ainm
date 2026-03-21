const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "LDkj7mUL8Ej9_fbHnYeEF122oGopmnhrZaQrelGnZJ0";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const headers = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: { Authorization: AUTH } };
  if (body instanceof FormData) {
    opts.body = body;
    // Do NOT set Content-Type for FormData - let fetch set it with boundary
  } else if (body) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  console.log(`\n>>> ${method} ${url}`);
  const res = await fetch(url, opts);
  const text = await res.text();
  console.log(`<<< ${res.status}`);
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(JSON.stringify(json, null, 2)?.slice(0, 2000));
  if (!res.ok) throw new Error(`${res.status}: ${JSON.stringify(json)}`);
  return json;
}

async function main() {
  // Step 1: POST /supplier with address and bank account
  const supplier = await api("POST", "/supplier", {
    name: "Forêt SARL",
    organizationNumber: "823356366",
    postalAddress: {
      addressLine1: "Solveien 51",
      postalCode: "9008",
      city: "Tromsø"
    },
    bankAccountPresentation: [{ bban: "68474635604" }]
  });
  const supplierId = supplier.value.id;
  const supplierLedgerAccountId = supplier.value.ledgerAccount.id;
  console.log(`Supplier ID: ${supplierId}, Ledger Account ID: ${supplierLedgerAccountId}`);

  // Step 2: GET /ledger/account for expense account 6340
  const accounts = await api("GET", "/ledger/account?number=6340&isApplicableForSupplierInvoice=true&fields=*");
  const expenseAccount = accounts.values[0];
  const expenseAccountId = expenseAccount.id;
  console.log(`Expense Account ID: ${expenseAccountId}`);

  // Step 3: POST /ledger/voucher/importDocument with EHF XML
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>INV-2026-6107</cbc:ID>
  <cbc:IssueDate>2026-01-28</cbc:IssueDate>
  <cbc:DueDate>2026-02-27</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>NOK</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0192">823356366</cbc:EndpointID>
      <cac:PostalAddress>
        <cbc:StreetName>Solveien 51</cbc:StreetName>
        <cbc:CityName>Tromsø</cbc:CityName>
        <cbc:PostalZone>9008</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>NO823356366MVA</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>Forêt SARL</cbc:RegistrationName>
        <cbc:CompanyID>823356366</cbc:CompanyID>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0192">000000000</cbc:EndpointID>
      <cac:PostalAddress>
        <cbc:StreetName>Testveien 1</cbc:StreetName>
        <cbc:CityName>Oslo</cbc:CityName>
        <cbc:PostalZone>0001</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>Ditt Firma AS</cbc:RegistrationName>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="NOK">16087</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="NOK">64350</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="NOK">16087</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>25</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="NOK">64350</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="NOK">64350</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="NOK">80437</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="NOK">80437</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  <cac:InvoiceLine>
    <cbc:ID>1</cbc:ID>
    <cbc:InvoicedQuantity unitCode="EA">1</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="NOK">64350</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Name>Programvarelisens</cbc:Name>
      <cac:ClassifiedTaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>25</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="NOK">64350</cbc:PriceAmount>
    </cac:Price>
  </cac:InvoiceLine>
</Invoice>`;

  const formData = new FormData();
  const blob = new Blob([xml], { type: "application/xml" });
  formData.append("file", blob, "invoice.xml");

  const importRes = await api("POST", "/ledger/voucher/importDocument", formData);
  // importDocument returns { values: [...] } list wrapper
  const voucher = importRes.values[0];
  const voucherId = voucher.id;
  let voucherVersion = voucher.version;
  console.log(`Voucher ID: ${voucherId}, Version: ${voucherVersion}`);

  // Step 4: PUT /ledger/voucher/{id}?sendToLedger=false with postings
  const net = 64350;
  const gross = 80437;

  const putPostings = await api("PUT", `/ledger/voucher/${voucherId}?sendToLedger=false`, {
    version: voucherVersion,
    postings: [
      {
        row: 1,
        account: { id: expenseAccountId },
        description: "Programvarelisens",
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
        description: "Programvarelisens",
        amount: -gross,
        amountCurrency: -gross,
        amountGross: -gross,
        amountGrossCurrency: -gross,
        invoiceNumber: "INV-2026-6107",
        termOfPayment: "2026-02-27"
      }
    ]
  });
  voucherVersion = putPostings.value.version;
  console.log(`Postings PUT OK, new version: ${voucherVersion}`);

  // Step 5: PUT /ledger/voucher/{id}?sendToLedger=true with ONLY version (books the voucher)
  const bookRes = await api("PUT", `/ledger/voucher/${voucherId}?sendToLedger=true`, {
    version: voucherVersion
  });
  console.log(`Booking PUT OK, voucher number: ${bookRes.value.number}`);
  console.log("DONE - 5 calls, 0 errors expected");
}

main().catch(e => { console.error(e); process.exit(1); });
