// Deep verification: check if importDocument creates duplicate suppliers
// and inspect all supplierInvoice fields vs what scorer might check
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any, isForm = false) {
  const url = `${BASE}${path}`;
  const opts: RequestInit = {
    method,
    headers: isForm ? { Authorization: AUTH } : H,
  };
  if (body) opts.body = isForm ? body : JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  if (res.status >= 400) console.log(`${method} ${path} => ${res.status} ERR: ${JSON.stringify(json).slice(0, 300)}`);
  else console.log(`${method} ${path} => ${res.status}`);
  return { status: res.status, data: json };
}

function money(v: number) { return v.toFixed(2); }
function xmlEscape(s: string) { return s.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;"); }

function buildXml(invoiceNr: string, supplierName: string, orgNr: string, gross: number, net: number, vat: number, desc: string, date: string) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${xmlEscape(invoiceNr)}</cbc:ID>
  <cbc:IssueDate>${date}</cbc:IssueDate>
  <cbc:DueDate>${date}</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>NOK</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0192">${orgNr}</cbc:EndpointID>
      <cac:PartyIdentification><cbc:ID schemeID="0192">${orgNr}</cbc:ID></cac:PartyIdentification>
      <cac:PartyName><cbc:Name>${xmlEscape(supplierName)}</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>Storgata 1</cbc:StreetName>
        <cbc:CityName>Oslo</cbc:CityName>
        <cbc:PostalZone>0155</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>NO${orgNr}MVA</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${xmlEscape(supplierName)}</cbc:RegistrationName>
        <cbc:CompanyID schemeID="0192">${orgNr}</cbc:CompanyID>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0192">999999999</cbc:EndpointID>
      <cac:PartyIdentification><cbc:ID schemeID="0192">999999999</cbc:ID></cac:PartyIdentification>
      <cac:PartyName><cbc:Name>Test Buyer AS</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>Testveien 2</cbc:StreetName>
        <cbc:CityName>Oslo</cbc:CityName>
        <cbc:PostalZone>0155</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>Test Buyer AS</cbc:RegistrationName>
        <cbc:CompanyID schemeID="0192">999999999</cbc:CompanyID>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="NOK">${money(vat)}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="NOK">${money(net)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="NOK">${money(vat)}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>25</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="NOK">${money(net)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="NOK">${money(net)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="NOK">${money(gross)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="NOK">${money(gross)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  <cac:InvoiceLine>
    <cbc:ID>1</cbc:ID>
    <cbc:InvoicedQuantity unitCode="EA">1</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="NOK">${money(net)}</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Name>${xmlEscape(desc)}</cbc:Name>
      <cac:ClassifiedTaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>25</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="NOK">${money(net)}</cbc:PriceAmount>
    </cac:Price>
  </cac:InvoiceLine>
</Invoice>`;
}

async function main() {
  const orgNr = "987654325"; // valid mod11
  const supplierName = "DeepVerify AS";
  const invoiceNr = "INV-DEEP-001";
  const gross = 42100;
  const net = 33680;
  const vat = 8420;
  const desc = "kontortjenester";
  const date = "2026-03-21";

  // Step 1: Count suppliers with this org number BEFORE
  console.log("=== BEFORE: suppliers with org " + orgNr + " ===");
  const beforeSup = await api("GET", `/supplier?organizationNumber=${orgNr}&fields=id,name,organizationNumber,ledgerAccount(id)`);
  console.log(`  Found: ${beforeSup.data.fullResultSize}`);
  for (const s of (beforeSup.data.values || [])) {
    console.log(`  supplier id=${s.id} name="${s.name}" org=${s.organizationNumber} ledgerAcct=${s.ledgerAccount?.id}`);
  }

  // Step 2: Create supplier explicitly
  console.log("\n=== POST /supplier ===");
  const supRes = await api("POST", "/supplier", { name: supplierName, organizationNumber: orgNr });
  const supplierId = supRes.data.value.id;
  const supplierLedgerAcctId = supRes.data.value.ledgerAccount.id;
  console.log(`  supplierId=${supplierId}, ledgerAcctId=${supplierLedgerAcctId}`);

  // Step 3: Count suppliers again AFTER POST
  console.log("\n=== AFTER POST: suppliers with org " + orgNr + " ===");
  const afterPost = await api("GET", `/supplier?organizationNumber=${orgNr}&fields=id,name,organizationNumber`);
  console.log(`  Found: ${afterPost.data.fullResultSize}`);

  // Step 4: GET account
  const acctRes = await api("GET", "/ledger/account?number=6540&isApplicableForSupplierInvoice=true&fields=*");
  const expenseAcctId = acctRes.data.values[0].id;

  // Step 5: importDocument
  console.log("\n=== POST /ledger/voucher/importDocument ===");
  const xml = buildXml(invoiceNr, supplierName, orgNr, gross, net, vat, desc, date);
  const form = new FormData();
  form.append("description", `import-${invoiceNr}`);
  form.append("file", new Blob([xml], { type: "application/xml" }), `${invoiceNr}.xml`);
  const importRes = await api("POST", "/ledger/voucher/importDocument", form, true);
  const voucherId = importRes.data.values[0].id;
  const voucherVersion = importRes.data.values[0].version;
  console.log(`  voucherId=${voucherId}, version=${voucherVersion}`);

  // Step 6: Count suppliers AFTER import
  console.log("\n=== AFTER IMPORT: suppliers with org " + orgNr + " ===");
  const afterImport = await api("GET", `/supplier?organizationNumber=${orgNr}&fields=id,name,organizationNumber,ledgerAccount(id),email,phoneNumber`);
  console.log(`  Found: ${afterImport.data.fullResultSize}`);
  for (const s of (afterImport.data.values || [])) {
    console.log(`  supplier id=${s.id} name="${s.name}" org=${s.organizationNumber} ledgerAcct=${s.ledgerAccount?.id} email="${s.email}" phone="${s.phoneNumber}"`);
  }

  // Step 7: PUT postings (sendToLedger=false)
  console.log("\n=== PUT /ledger/voucher (sendToLedger=false) ===");
  const putRes = await api("PUT", `/ledger/voucher/${voucherId}?sendToLedger=false`, {
    version: voucherVersion,
    postings: [
      {
        row: 1, date, description: desc,
        account: { id: expenseAcctId },
        vatType: { id: 1 },
        amount: net, amountCurrency: net,
        amountGross: gross, amountGrossCurrency: gross,
      },
      {
        row: 2, date, description: desc,
        account: { id: supplierLedgerAcctId },
        supplier: { id: supplierId },
        amount: -gross, amountCurrency: -gross,
        amountGross: -gross, amountGrossCurrency: -gross,
        invoiceNumber: invoiceNr, termOfPayment: date,
      },
    ],
  });
  const newVersion = putRes.data.value.version;

  // Step 8: Check supplier count AFTER PUT (does it change supplier linkage?)
  console.log("\n=== AFTER PUT: suppliers with org " + orgNr + " ===");
  const afterPut = await api("GET", `/supplier?organizationNumber=${orgNr}&fields=id,name,organizationNumber`);
  console.log(`  Found: ${afterPut.data.fullResultSize}`);
  for (const s of (afterPut.data.values || [])) {
    console.log(`  supplier id=${s.id} name="${s.name}"`);
  }

  // Step 9: Check the supplierInvoice BEFORE booking
  console.log("\n=== SUPPLIER INVOICE (before booking) ===");
  const siRes = await api("GET", `/supplierInvoice?voucherId=${voucherId}&invoiceDateFrom=2026-01-01&invoiceDateTo=2026-12-31&fields=id,version,invoiceNumber,invoiceDate,invoiceDueDate,kidOrReceiverReference,supplier(id,name,organizationNumber),voucher(id,number),amount,amountCurrency,amountExcludingVat,amountExcludingVatCurrency,currency(id,code),isCreditNote,orderLines(*),payments(*),originalInvoiceDocumentId,approvalListElements(*),outstandingAmount`);
  if (siRes.data.values && siRes.data.values.length > 0) {
    const si = siRes.data.values[0];
    console.log("  FULL supplierInvoice (before booking):");
    console.log(JSON.stringify(si, null, 2));
    console.log(`\n  KEY FIELDS CHECK (before booking):`);
    console.log(`    invoiceNumber: "${si.invoiceNumber}" (expected: "${invoiceNr}")`);
    console.log(`    invoiceDate: "${si.invoiceDate}" (expected: "${date}")`);
    console.log(`    invoiceDueDate: "${si.invoiceDueDate}" (expected: "${date}")`);
    console.log(`    supplier.name: "${si.supplier?.name}" (expected: "${supplierName}")`);
    console.log(`    supplier.organizationNumber: "${si.supplier?.organizationNumber}" (expected: "${orgNr}")`);
    console.log(`    supplier.id: ${si.supplier?.id} (expected: ${supplierId} — which we created manually)`);
    console.log(`    amount: ${si.amount} (expected: -${gross} or ${gross})`);
    console.log(`    amountExcludingVat: ${si.amountExcludingVat} (expected: -${net} or ${net})`);
    console.log(`    isCreditNote: ${si.isCreditNote}`);
    console.log(`    voucher.id: ${si.voucher?.id} (expected: ${voucherId})`);
    console.log(`    voucher.number: ${si.voucher?.number} (expected: 0 unbooked)`);
    console.log(`    SUPPLIER MISMATCH: ${si.supplier?.id !== supplierId ? "YES — SI linked to DIFFERENT supplier!" : "NO — matches our manual supplier"}`);
  } else {
    console.log("  NO supplierInvoice found before booking!");
  }

  // Step 10: Book it
  console.log("\n=== PUT /ledger/voucher (sendToLedger=true) ===");
  const bookRes = await api("PUT", `/ledger/voucher/${voucherId}?sendToLedger=true`, { version: newVersion });
  console.log(`  booked, number=${bookRes.data.value?.number}`);

  // Step 11: Check the supplierInvoice AFTER booking
  console.log("\n=== SUPPLIER INVOICE (after booking) ===");
  const siAfter = await api("GET", `/supplierInvoice?voucherId=${voucherId}&invoiceDateFrom=2026-01-01&invoiceDateTo=2026-12-31&fields=id,version,invoiceNumber,invoiceDate,invoiceDueDate,kidOrReceiverReference,supplier(id,name,organizationNumber),voucher(id,number),amount,amountCurrency,amountExcludingVat,amountExcludingVatCurrency,currency(id,code),isCreditNote,orderLines(*),payments(*),originalInvoiceDocumentId,approvalListElements(*),outstandingAmount`);
  if (siAfter.data.values && siAfter.data.values.length > 0) {
    const si = siAfter.data.values[0];
    console.log("  FULL supplierInvoice (after booking):");
    console.log(JSON.stringify(si, null, 2));
    console.log(`\n  KEY FIELDS CHECK (after booking):`);
    console.log(`    invoiceNumber: "${si.invoiceNumber}"`);
    console.log(`    supplier.id: ${si.supplier?.id} (expected: ${supplierId})`);
    console.log(`    amount: ${si.amount}`);
    console.log(`    voucher.number: ${si.voucher?.number}`);
    console.log(`    SUPPLIER MISMATCH: ${si.supplier?.id !== supplierId ? "YES!" : "NO"}`);
  }
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
