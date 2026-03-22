const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "QEX2q4HkZ_EMFZfmun8tE0w_mMPGGhJct-AV_XTpQWk";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };

// Task data
const supplierName = "Lumière SARL";
const orgNumber = "904564184";
const invoiceNumber = "INV-2026-5683";
const gross = 75500;
const net = 60400; // 75500 / 1.25
const vat = 15100; // 75500 - 60400
const expenseAccountNumber = 7140;
const invoiceDate = "2026-03-22";
const dueDate = "2026-04-21";
const description = "services de bureau";

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  if (!r.ok) {
    console.error(`${method} ${path} → ${r.status}`, JSON.stringify(json, null, 2));
    throw new Error(`${method} ${path} → ${r.status}`);
  }
  console.log(`${method} ${path} → ${r.status}`);
  return json;
}

async function main() {
  // Step 1: Create supplier
  const supRes = await api("POST", "/supplier", {
    name: supplierName,
    organizationNumber: orgNumber,
    postalAddress: { addressLine1: "", postalCode: "", city: "", country: { id: 161 } },
    physicalAddress: { addressLine1: "", postalCode: "", city: "", country: { id: 161 } },
  });
  const supplierId = supRes.value.id;
  const ledgerAccountId = supRes.value.ledgerAccount.id; // account 2400
  console.log("Supplier created:", supplierId, "ledgerAccount:", ledgerAccountId);

  // Step 2: GET expense account id
  const accRes = await api("GET", `/ledger/account?number=${expenseAccountNumber}&isApplicableForSupplierInvoice=true&fields=*`);
  const expenseAccountId = accRes.values[0].id;
  console.log("Expense account id:", expenseAccountId);

  // Step 3: importDocument with EHF XML
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
        <cbc:StreetName>Gate 1</cbc:StreetName>
        <cbc:CityName>Oslo</cbc:CityName>
        <cbc:PostalZone>0001</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>NO${orgNumber}MVA</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity><cbc:RegistrationName>${supplierName}</cbc:RegistrationName><cbc:CompanyID schemeID="0192">${orgNumber}</cbc:CompanyID></cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0192">987654325</cbc:EndpointID>
      <cac:PartyName><cbc:Name>Buyer AS</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>Veien 2</cbc:StreetName>
        <cbc:CityName>Bergen</cbc:CityName>
        <cbc:PostalZone>5003</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyLegalEntity><cbc:RegistrationName>Buyer AS</cbc:RegistrationName><cbc:CompanyID schemeID="0192">987654325</cbc:CompanyID></cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:PaymentMeans>
    <cbc:PaymentMeansCode>30</cbc:PaymentMeansCode>
    <cbc:PaymentID>${invoiceNumber}</cbc:PaymentID>
    <cac:PayeeFinancialAccount><cbc:ID>12345678903</cbc:ID></cac:PayeeFinancialAccount>
  </cac:PaymentMeans>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="NOK">${vat}.00</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="NOK">${net}.00</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="NOK">${vat}.00</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>25</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="NOK">${net}.00</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="NOK">${net}.00</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="NOK">${gross}.00</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="NOK">${gross}.00</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  <cac:InvoiceLine>
    <cbc:ID>1</cbc:ID>
    <cbc:InvoicedQuantity unitCode="EA">1</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="NOK">${net}.00</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Name>${description}</cbc:Name>
      <cac:ClassifiedTaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>25</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="NOK">${net}.00</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>
</Invoice>`;

  const formData = new FormData();
  formData.append("file", new Blob([xml], { type: "application/xml" }), `${invoiceNumber}.xml`);

  const impRes = await fetch(`${BASE}/ledger/voucher/importDocument`, {
    method: "POST",
    headers: { Authorization: AUTH },
    body: formData,
  });
  const impJson = await impRes.json();
  if (!impRes.ok) {
    console.error("importDocument →", impRes.status, JSON.stringify(impJson, null, 2));
    throw new Error("importDocument failed");
  }
  console.log("importDocument →", impRes.status);

  // CRITICAL: response is .values (plural)
  const voucherId = impJson.values[0].id;
  const voucherVersion = impJson.values[0].version;
  console.log("Voucher id:", voucherId, "version:", voucherVersion);

  // Step 4: Verify SI entity created (GET is free)
  const siRes = await api("GET", `/supplierInvoice?voucherId=${voucherId}&invoiceDateFrom=2026-01-01&invoiceDateTo=2026-12-31&fields=*`);
  console.log("SupplierInvoice count:", siRes.count);
  if (siRes.count > 0) {
    const si = siRes.values[0];
    console.log("SI:", JSON.stringify({
      id: si.id, amount: si.amount, amountExcludingVat: si.amountExcludingVat,
      invoiceNumber: si.invoiceNumber, kidOrReceiverReference: si.kidOrReceiverReference,
      invoiceDueDate: si.invoiceDueDate, outstandingAmount: si.outstandingAmount
    }));
  }

  // Step 5: PUT postings (sendToLedger=false)
  const putPostingsRes = await api("PUT", `/ledger/voucher/${voucherId}?sendToLedger=false`, {
    version: voucherVersion,
    postings: [
      {
        row: 1,
        date: invoiceDate,
        description,
        account: { id: expenseAccountId },
        vatType: { id: 1 },
        amount: net,
        amountCurrency: net,
        amountGross: gross,
        amountGrossCurrency: gross,
      },
      {
        row: 2,
        date: invoiceDate,
        description,
        account: { id: ledgerAccountId },
        supplier: { id: supplierId },
        amount: -gross,
        amountCurrency: -gross,
        amountGross: -gross,
        amountGrossCurrency: -gross,
        invoiceNumber,
        termOfPayment: dueDate,
      },
    ],
  });
  const v2 = putPostingsRes.value.version;
  console.log("PUT postings done, version:", v2);

  // Step 6: PUT book (sendToLedger=true)
  const bookRes = await api("PUT", `/ledger/voucher/${voucherId}?sendToLedger=true`, {
    version: v2,
    voucherType: { name: "Leverandørfaktura" },
  });
  console.log("Booked, number:", bookRes.value.number);

  // Step 7: Verify voucher (GET is free)
  const vRes = await api("GET", `/ledger/voucher/${voucherId}?fields=*`);
  console.log("Voucher:", JSON.stringify({
    number: vRes.value.number,
    description: vRes.value.description,
    voucherType: vRes.value.voucherType?.name,
  }));
  if (vRes.value.postings) {
    for (const p of vRes.value.postings) {
      console.log("  Posting:", JSON.stringify({
        row: p.row, account: p.account?.number, amount: p.amount,
        amountGross: p.amountGross, vatType: p.vatType?.id, description: p.description
      }));
    }
  }

  // Step 8: Verify supplier (GET is free)
  const sRes = await api("GET", `/supplier/${supplierId}?fields=*`);
  console.log("Supplier:", JSON.stringify({
    name: sRes.value.name,
    orgNumber: sRes.value.organizationNumber,
    postalAddress: sRes.value.postalAddress,
    physicalAddress: sRes.value.physicalAddress,
    bankAccountPresentation: sRes.value.bankAccountPresentation,
  }, null, 2));
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
