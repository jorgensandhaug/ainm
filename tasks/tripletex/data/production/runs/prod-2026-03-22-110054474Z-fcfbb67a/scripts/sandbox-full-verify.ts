// Full E2E sandbox verification matching prod run parameters
// Verifies every field the scorer could check
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };

const supplierName = "Lumière SARL";
const orgNumber = "904564184";
const invoiceNumber = "INV-2026-SANDBOX-VERIFY";
const gross = 75500;
const net = 60400;
const vat = 15100;
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
  // Step 1: Create supplier (no address/bank since prompt didn't provide them)
  const supRes = await api("POST", "/supplier", {
    name: supplierName,
    organizationNumber: orgNumber,
    postalAddress: { addressLine1: "", postalCode: "", city: "", country: { id: 161 } },
    physicalAddress: { addressLine1: "", postalCode: "", city: "", country: { id: 161 } },
  });
  const supplierId = supRes.value.id;
  const ledgerAccountId = supRes.value.ledgerAccount.id;
  console.log("Supplier:", supplierId, "ledgerAccount:", ledgerAccountId);

  // Step 2: GET expense account
  const accRes = await api("GET", `/ledger/account?number=${expenseAccountNumber}&isApplicableForSupplierInvoice=true&fields=*`);
  const expenseAccountId = accRes.values[0].id;
  console.log("Expense account:", expenseAccountId, "number:", accRes.values[0].number);

  // Step 3: importDocument
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
  const voucherId = impJson.values[0].id;
  const voucherVersion = impJson.values[0].version;
  console.log("Voucher:", voucherId, "version:", voucherVersion);

  // Step 4: Verify SI
  const siRes = await api("GET", `/supplierInvoice?voucherId=${voucherId}&invoiceDateFrom=2026-01-01&invoiceDateTo=2026-12-31&fields=*`);
  if (siRes.count > 0) {
    const si = siRes.values[0];
    console.log("\n=== SUPPLIER INVOICE (pre-booking) ===");
    console.log("id:", si.id);
    console.log("invoiceNumber:", si.invoiceNumber);
    console.log("invoiceDate:", si.invoiceDate);
    console.log("invoiceDueDate:", si.invoiceDueDate);
    console.log("amount:", si.amount);
    console.log("amountExcludingVat:", si.amountExcludingVat);
    console.log("amountCurrency:", si.amountCurrency);
    console.log("amountExcludingVatCurrency:", si.amountExcludingVatCurrency);
    console.log("outstandingAmount:", si.outstandingAmount);
    console.log("kidOrReceiverReference:", si.kidOrReceiverReference);
    console.log("isCreditNote:", si.isCreditNote);
    console.log("supplier:", si.supplier);
    console.log("orderLines:", JSON.stringify(si.orderLines));
  }

  // Step 5: PUT postings
  const putPostingsRes = await api("PUT", `/ledger/voucher/${voucherId}?sendToLedger=false`, {
    version: voucherVersion,
    postings: [
      {
        row: 1, date: invoiceDate, description,
        account: { id: expenseAccountId },
        vatType: { id: 1 },
        amount: net, amountCurrency: net,
        amountGross: gross, amountGrossCurrency: gross,
      },
      {
        row: 2, date: invoiceDate, description,
        account: { id: ledgerAccountId },
        supplier: { id: supplierId },
        amount: -gross, amountCurrency: -gross,
        amountGross: -gross, amountGrossCurrency: -gross,
        invoiceNumber, termOfPayment: dueDate,
      },
    ],
  });
  const v2 = putPostingsRes.value.version;
  console.log("PUT postings version:", v2);

  // Step 6: PUT book
  const bookRes = await api("PUT", `/ledger/voucher/${voucherId}?sendToLedger=true`, {
    version: v2,
    voucherType: { name: "Leverandørfaktura" },
  });
  console.log("Booked number:", bookRes.value.number);

  // Step 7: FULL verification - voucher with expanded postings
  const vRes = await api("GET", `/ledger/voucher/${voucherId}?fields=id,number,date,description,voucherType(*),postings(*)`);
  console.log("\n=== VOUCHER (after booking) ===");
  console.log("number:", vRes.value.number);
  console.log("date:", vRes.value.date);
  console.log("description:", vRes.value.description);
  console.log("voucherType:", JSON.stringify(vRes.value.voucherType));
  for (const p of vRes.value.postings) {
    console.log("\n  POSTING row:", p.row);
    console.log("    description:", p.description);
    console.log("    account:", JSON.stringify(p.account));
    console.log("    amount:", p.amount, "amountCurrency:", p.amountCurrency);
    console.log("    amountGross:", p.amountGross, "amountGrossCurrency:", p.amountGrossCurrency);
    console.log("    vatType:", JSON.stringify(p.vatType));
    console.log("    supplier:", JSON.stringify(p.supplier));
    console.log("    invoiceNumber:", p.invoiceNumber);
    console.log("    termOfPayment:", p.termOfPayment);
    console.log("    systemGenerated:", p.systemGenerated);
  }

  // Expand account numbers
  for (const p of vRes.value.postings) {
    if (p.account?.id) {
      const acct = await api("GET", `/ledger/account/${p.account.id}?fields=id,number,name`);
      console.log(`  Account ${p.account.id}: number=${acct.value.number} name=${acct.value.name}`);
    }
  }

  // Step 8: Verify SI after booking (check if anything changed)
  const siAfter = await api("GET", `/supplierInvoice?voucherId=${voucherId}&invoiceDateFrom=2026-01-01&invoiceDateTo=2026-12-31&fields=*`);
  if (siAfter.count > 0) {
    const si = siAfter.values[0];
    console.log("\n=== SUPPLIER INVOICE (after booking) ===");
    console.log("id:", si.id);
    console.log("invoiceNumber:", si.invoiceNumber);
    console.log("amount:", si.amount);
    console.log("amountExcludingVat:", si.amountExcludingVat);
    console.log("outstandingAmount:", si.outstandingAmount);
    console.log("kidOrReceiverReference:", si.kidOrReceiverReference);
    // Check order lines in detail
    if (si.orderLines?.length > 0) {
      for (const ol of si.orderLines) {
        const olData = await api("GET", `/order/orderline/${ol.id}?fields=*`);
        console.log("\n  ORDER LINE:", JSON.stringify(olData.value, null, 2));
      }
    }
  }

  // Step 9: Verify supplier
  const sRes = await api("GET", `/supplier/${supplierId}?fields=*`);
  console.log("\n=== SUPPLIER ===");
  console.log("name:", sRes.value.name);
  console.log("organizationNumber:", sRes.value.organizationNumber);
  console.log("postalAddress:", JSON.stringify(sRes.value.postalAddress));
  console.log("physicalAddress:", JSON.stringify(sRes.value.physicalAddress));
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
