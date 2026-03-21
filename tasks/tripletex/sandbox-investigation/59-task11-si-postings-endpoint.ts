// Test PUT /supplierInvoice/voucher/{id}/postings endpoint
// and PUT /supplierInvoice/{id}/:approve
// These might be what the scorer expects instead of PUT /ledger/voucher

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
  console.log(`${method} ${path} => ${res.status}`);
  if (res.status >= 400) console.log("  ERR:", JSON.stringify(json, null, 2).slice(0, 600));
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
      <cac:PostalAddress><cbc:StreetName>Storgata 1</cbc:StreetName><cbc:CityName>Oslo</cbc:CityName><cbc:PostalZone>0155</cbc:PostalZone><cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
      <cac:PartyTaxScheme><cbc:CompanyID>NO${orgNr}MVA</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>
      <cac:PartyLegalEntity><cbc:RegistrationName>${xmlEscape(supplierName)}</cbc:RegistrationName><cbc:CompanyID schemeID="0192">${orgNr}</cbc:CompanyID></cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0192">999999999</cbc:EndpointID>
      <cac:PartyIdentification><cbc:ID schemeID="0192">999999999</cbc:ID></cac:PartyIdentification>
      <cac:PartyName><cbc:Name>Test Buyer AS</cbc:Name></cac:PartyName>
      <cac:PostalAddress><cbc:StreetName>Testveien 2</cbc:StreetName><cbc:CityName>Oslo</cbc:CityName><cbc:PostalZone>0155</cbc:PostalZone><cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
      <cac:PartyLegalEntity><cbc:RegistrationName>Test Buyer AS</cbc:RegistrationName><cbc:CompanyID schemeID="0192">999999999</cbc:CompanyID></cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:TaxTotal><cbc:TaxAmount currencyID="NOK">${money(vat)}</cbc:TaxAmount><cac:TaxSubtotal><cbc:TaxableAmount currencyID="NOK">${money(net)}</cbc:TaxableAmount><cbc:TaxAmount currencyID="NOK">${money(vat)}</cbc:TaxAmount><cac:TaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>25</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory></cac:TaxSubtotal></cac:TaxTotal>
  <cac:LegalMonetaryTotal><cbc:LineExtensionAmount currencyID="NOK">${money(net)}</cbc:LineExtensionAmount><cbc:TaxExclusiveAmount currencyID="NOK">${money(net)}</cbc:TaxExclusiveAmount><cbc:TaxInclusiveAmount currencyID="NOK">${money(gross)}</cbc:TaxInclusiveAmount><cbc:PayableAmount currencyID="NOK">${money(gross)}</cbc:PayableAmount></cac:LegalMonetaryTotal>
  <cac:InvoiceLine><cbc:ID>1</cbc:ID><cbc:InvoicedQuantity unitCode="EA">1</cbc:InvoicedQuantity><cbc:LineExtensionAmount currencyID="NOK">${money(net)}</cbc:LineExtensionAmount><cac:Item><cbc:Name>${xmlEscape(desc)}</cbc:Name><cac:ClassifiedTaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>25</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory></cac:Item><cac:Price><cbc:PriceAmount currencyID="NOK">${money(net)}</cbc:PriceAmount></cac:Price></cac:InvoiceLine>
</Invoice>`;
}

async function main() {
  const orgNr = "987654325";
  const supplierName = "SIPostings Test AS";
  const invoiceNr = "INV-SIPOST-001";
  const gross = 42100;
  const net = 33680;
  const vat = 8420;
  const desc = "kontortjenester";
  const date = "2026-03-21";

  // Create supplier
  console.log("=== POST /supplier ===");
  const supRes = await api("POST", "/supplier", { name: supplierName, organizationNumber: orgNr });
  const supplierId = supRes.data.value.id;
  const supplierLedgerAcctId = supRes.data.value.ledgerAccount.id;
  console.log(`  supplierId=${supplierId}, ledgerAcctId=${supplierLedgerAcctId}`);

  // Get account
  const acctRes = await api("GET", "/ledger/account?number=6540&isApplicableForSupplierInvoice=true&fields=*");
  const expenseAcctId = acctRes.data.values[0].id;

  // importDocument
  console.log("\n=== POST importDocument ===");
  const xml = buildXml(invoiceNr, supplierName, orgNr, gross, net, vat, desc, date);
  const form = new FormData();
  form.append("description", `import-${invoiceNr}`);
  form.append("file", new Blob([xml], { type: "application/xml" }), `${invoiceNr}.xml`);
  const importRes = await api("POST", "/ledger/voucher/importDocument", form, true);
  const voucherId = importRes.data.values[0].id;
  const voucherVersion = importRes.data.values[0].version;
  console.log(`  voucherId=${voucherId}, version=${voucherVersion}`);

  // Get supplierInvoice ID
  const siSearch = await api("GET", `/supplierInvoice?voucherId=${voucherId}&invoiceDateFrom=2026-01-01&invoiceDateTo=2026-12-31&fields=id,version`);
  const siId = siSearch.data.values[0].id;
  const siVersion = siSearch.data.values[0].version;
  console.log(`  supplierInvoiceId=${siId}, version=${siVersion}`);

  // Test A: PUT /supplierInvoice/voucher/{voucherId}/postings
  console.log("\n=== Test A: PUT /supplierInvoice/voucher/{voucherId}/postings ===");
  const postingsBody = [
    {
      row: 1,
      date: date,
      description: desc,
      account: { id: expenseAcctId },
      vatType: { id: 1 },
      amount: net,
      amountCurrency: net,
      amountGross: gross,
      amountGrossCurrency: gross,
    },
  ];
  const testA = await api("PUT", `/supplierInvoice/voucher/${voucherId}/postings`, postingsBody);
  if (testA.status < 400) {
    console.log("  SUCCESS! Response:");
    console.log(JSON.stringify(testA.data, null, 2).slice(0, 1000));
  }

  // Check voucher state after PUT /supplierInvoice/voucher postings
  console.log("\n=== After PUT si/voucher postings: GET /ledger/voucher ===");
  const vAfter = await api("GET", `/ledger/voucher/${voucherId}?fields=id,number,date,description,postings(id,row,account(id,number),amount,amountGross,vatType(id,name,percentage),supplier(id,name),description,invoiceNumber)`);
  if (vAfter.status === 200) {
    const v = vAfter.data.value;
    console.log(`  voucher ${v.id}, number=${v.number}`);
    for (const p of (v.postings || [])) {
      console.log(`  posting row=${p.row}: acct=${p.account?.number} amt=${p.amount} gross=${p.amountGross} vat=${p.vatType?.id}(${p.vatType?.name}) sup=${p.supplier?.name || '-'} inv=${p.invoiceNumber || '-'}`);
    }
  }

  // Test B: PUT /supplierInvoice/{id}/:approve
  console.log("\n=== Test B: PUT /supplierInvoice/{id}/:approve ===");
  const testB = await api("PUT", `/supplierInvoice/${siId}/:approve`, {
    comment: "Auto-approved",
    description: desc,
  });
  if (testB.status < 400) {
    console.log("  Approved! Response:");
    console.log(JSON.stringify(testB.data, null, 2).slice(0, 500));
  }

  // Check supplierInvoice state after approval
  console.log("\n=== After approve: GET /supplierInvoice ===");
  const siAfter = await api("GET", `/supplierInvoice/${siId}?fields=id,version,invoiceNumber,supplier(id,name),amount,amountExcludingVat,voucher(id,number),approvalListElements(*)`);
  if (siAfter.status === 200) {
    const si = siAfter.data.value;
    console.log(`  SI ${si.id}: inv=${si.invoiceNumber} amt=${si.amount} voucher=${si.voucher?.id}/${si.voucher?.number}`);
    for (const a of (si.approvalListElements || [])) {
      console.log(`  approval: status=${a.status} level=${a.organisationLevel} by=${a.actionEmployeeName || 'pending'}`);
    }
  }

  // Test C: Try sendToLedger=true AFTER using supplierInvoice/voucher/postings
  console.log("\n=== Test C: Book via PUT /ledger/voucher sendToLedger=true ===");
  // First get current version
  const vCheck = await api("GET", `/ledger/voucher/${voucherId}?fields=id,version`);
  const curVersion = vCheck.data.value?.version;
  if (curVersion) {
    const bookRes = await api("PUT", `/ledger/voucher/${voucherId}?sendToLedger=true`, { version: curVersion });
    if (bookRes.status === 200) {
      console.log(`  Booked! number=${bookRes.data.value?.number}`);
    }
  }

  // Final state check
  console.log("\n=== FINAL STATE ===");
  const finalSI = await api("GET", `/supplierInvoice/${siId}?fields=id,version,invoiceNumber,invoiceDate,invoiceDueDate,supplier(id,name,organizationNumber),voucher(id,number),amount,amountCurrency,amountExcludingVat,amountExcludingVatCurrency,isCreditNote,outstandingAmount,approvalListElements(*)`);
  if (finalSI.status === 200) {
    console.log(JSON.stringify(finalSI.data.value, null, 2));
  }

  const finalV = await api("GET", `/ledger/voucher/${voucherId}?fields=id,number,postings(id,row,account(id,number,name),amount,amountGross,vatType(id,name,percentage),supplier(id,name),description,invoiceNumber)`);
  if (finalV.status === 200) {
    const v = finalV.data.value;
    console.log(`\nVoucher ${v.id}, number=${v.number}:`);
    for (const p of (v.postings || [])) {
      console.log(`  row=${p.row}: acct=${p.account?.number}(${p.account?.name}) amt=${p.amount} gross=${p.amountGross} vat=${p.vatType?.id}(${p.vatType?.name}) sup=${p.supplier?.name || '-'} inv=${p.invoiceNumber || '-'} desc="${p.description}"`);
    }
  }
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
