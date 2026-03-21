const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "FOLMUI3-n2A2eY-B6eczOxtpx0DlzUtgGDSfn8NnSZU";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function api(method: string, path: string, body?: any, isFormData = false) {
  const url = `${BASE}${path}`;
  const headers: Record<string, string> = { Authorization: AUTH };
  if (body && !isFormData) headers["Content-Type"] = "application/json";
  // Do NOT set Content-Type for FormData — let fetch set it with boundary
  const res = await fetch(url, {
    method,
    headers,
    body: isFormData ? body : body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  console.log(`${method} ${path} → ${res.status}`);
  if (!res.ok) {
    console.error("ERROR:", text);
    throw new Error(`${res.status} ${text}`);
  }
  return JSON.parse(text);
}

async function main() {
  // Constants
  const supplierName = "Montaña SL";
  const orgNumber = "831519975";
  const invoiceNumber = "INV-2026-1443";
  const description = "servicios de oficina";
  const gross = 50050;
  const net = 40040; // 50050 / 1.25
  const vat = 10010;
  const expenseAccount = 6300;
  const invoiceDate = "2026-03-22";
  const dueDate = "2026-04-21";

  // Step 1: POST /supplier (no PDF, so no address/bank data)
  const supplierRes = await api("POST", "/supplier", {
    name: supplierName,
    organizationNumber: orgNumber,
  });
  const supplierId = supplierRes.value.id;
  const supplierLedgerAccountId = supplierRes.value.ledgerAccount.id;
  console.log("Supplier ID:", supplierId, "Ledger Account ID:", supplierLedgerAccountId);

  // Step 2: GET /ledger/account
  const accountRes = await api("GET", `/ledger/account?number=${expenseAccount}&isApplicableForSupplierInvoice=true&fields=*`);
  const expenseAccountId = accountRes.values[0].id;
  console.log("Expense Account ID:", expenseAccountId);

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
      <cac:PartyName><cbc:Name>${supplierName}</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>Ukjent</cbc:StreetName>
        <cbc:CityName>Ukjent</cbc:CityName>
        <cbc:PostalZone>0000</cbc:PostalZone>
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
      <cbc:EndpointID schemeID="0192">123456785</cbc:EndpointID>
      <cac:PartyName><cbc:Name>My Company</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>Storgata 1</cbc:StreetName>
        <cbc:CityName>Oslo</cbc:CityName>
        <cbc:PostalZone>0001</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>My Company</cbc:RegistrationName>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="NOK">${vat}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="NOK">${net}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="NOK">${vat}</cbc:TaxAmount>
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
    <cac:Price>
      <cbc:PriceAmount currencyID="NOK">${net}</cbc:PriceAmount>
    </cac:Price>
  </cac:InvoiceLine>
</Invoice>`;

  const formData = new FormData();
  const blob = new Blob([xml], { type: "application/xml" });
  formData.append("file", blob, `${invoiceNumber}.xml`);

  const importRes = await api("POST", "/ledger/voucher/importDocument", formData, true);
  const voucherId = importRes.values[0].id;
  const voucherVersion = importRes.values[0].version;
  console.log("Voucher ID:", voucherId, "Version:", voucherVersion);

  // Step 4: PUT /ledger/voucher/{id}?sendToLedger=false with postings
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
        amountGrossCurrency: gross,
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
        termOfPayment: dueDate,
      },
    ],
  });
  const newVersion = putRes.value.version;
  console.log("Postings PUT OK, new version:", newVersion);
  console.log("Postings:", JSON.stringify(putRes.value.postings?.map((p: any) => ({
    row: p.row,
    account: p.account?.number,
    amount: p.amount,
    amountGross: p.amountGross,
    vatType: p.vatType?.id,
  })), null, 2));

  // Step 5: PUT /ledger/voucher/{id}?sendToLedger=true with only version (book)
  const bookRes = await api("PUT", `/ledger/voucher/${voucherId}?sendToLedger=true`, {
    version: newVersion,
  });
  console.log("Booking PUT OK, version:", bookRes.value.version, "number:", bookRes.value.number);
  console.log("DONE. Voucher", voucherId, "booked as number", bookRes.value.number);
}

main().catch((e) => { console.error(e); process.exit(1); });
