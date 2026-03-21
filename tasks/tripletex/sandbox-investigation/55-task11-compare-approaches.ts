// Compare TWO approaches to supplier invoice creation in sandbox:
// A) Winning approach: sendToLedger=false only (no booking)
// B) Current standard: sendToLedger=false then sendToLedger=true (book)
// Then verify supplierInvoice object for both

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
  if (res.status >= 400) console.log("  ERR:", JSON.stringify(json, null, 2).slice(0, 500));
  return { status: res.status, data: json };
}

function xmlEscape(s: string) { return s.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;"); }
function money(v: number) { return v.toFixed(2); }

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

async function testApproach(label: string, book: boolean) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`APPROACH ${label}: ${book ? "WITH sendToLedger=true (current standard)" : "sendToLedger=false ONLY (winning run)"}`);
  console.log("=".repeat(60));

  const suffix = book ? "B" : "A";
  const supplierName = `SandboxTest${suffix} AS`;
  const orgNr = book ? "987654317" : "987654325";
  const invoiceNr = `INV-TEST-${suffix}`;
  const gross = 50000;
  const net = 40000;
  const vat = 10000;
  const desc = "kontortjenester";
  const date = "2026-03-21";

  // Step 1: Create supplier
  console.log("\n--- Step 1: POST /supplier ---");
  const supRes = await api("POST", "/supplier", { name: supplierName, organizationNumber: orgNr });
  if (supRes.status !== 201) { console.log("FAILED: supplier creation"); return; }
  const supplierId = supRes.data.value.id;
  const supplierLedgerAcctId = supRes.data.value.ledgerAccount.id;
  console.log(`  supplierId=${supplierId}, ledgerAcctId=${supplierLedgerAcctId}`);

  // Step 2: GET expense account
  console.log("\n--- Step 2: GET /ledger/account ---");
  const acctRes = await api("GET", "/ledger/account?number=6300&isApplicableForSupplierInvoice=true&fields=*");
  const expenseAcctId = acctRes.data.values[0].id;
  console.log(`  expenseAccountId=${expenseAcctId}`);

  // Step 3: GET vatType (like winning run)
  console.log("\n--- Step 3: GET /ledger/vatType ---");
  const vatRes = await api("GET", `/ledger/vatType?typeOfVat=INCOMING&vatDate=${date}&fields=*`);
  const vatTypes = (vatRes.data.values || []).filter((v: any) => v.percentage === 25);
  const vatTypeId = vatTypes.find((v: any) => String(v.number) === "1")?.id || vatTypes[0]?.id;
  console.log(`  vatTypeId=${vatTypeId}`);

  // Step 4: importDocument with description field (like winning run)
  console.log("\n--- Step 4: POST /ledger/voucher/importDocument ---");
  const xml = buildXml(invoiceNr, supplierName, orgNr, gross, net, vat, desc, date);
  const form = new FormData();
  form.append("description", `import-${invoiceNr}`);
  form.append("file", new Blob([xml], { type: "application/xml" }), `${invoiceNr}.xml`);
  const importRes = await api("POST", "/ledger/voucher/importDocument", form, true);
  if (importRes.status !== 201) { console.log("FAILED: importDocument"); return; }
  const voucherId = importRes.data.values[0].id;
  const voucherVersion = importRes.data.values[0].version;
  console.log(`  voucherId=${voucherId}, version=${voucherVersion}`);

  // Step 5: PUT postings with sendToLedger=false
  console.log("\n--- Step 5: PUT /ledger/voucher (sendToLedger=false) ---");
  const putRes = await api("PUT", `/ledger/voucher/${voucherId}?sendToLedger=false`, {
    version: voucherVersion,
    postings: [
      {
        row: 1,
        date: date,
        description: desc,
        account: { id: expenseAcctId },
        vatType: { id: vatTypeId },
        amount: net,
        amountCurrency: net,
        amountGross: gross,
        amountGrossCurrency: gross,
      },
      {
        row: 2,
        date: date,
        description: desc,
        account: { id: supplierLedgerAcctId },
        supplier: { id: supplierId },
        amount: -gross,
        amountCurrency: -gross,
        amountGross: -gross,
        amountGrossCurrency: -gross,
        invoiceNumber: invoiceNr,
        termOfPayment: date,
      },
    ],
  });
  if (putRes.status !== 200) { console.log("FAILED: PUT postings"); return; }
  const newVersion = putRes.data.value.version;
  console.log(`  newVersion=${newVersion}`);

  // Step 6 (conditional): PUT sendToLedger=true to book
  if (book) {
    console.log("\n--- Step 6: PUT /ledger/voucher (sendToLedger=true) ---");
    const bookRes = await api("PUT", `/ledger/voucher/${voucherId}?sendToLedger=true`, { version: newVersion });
    if (bookRes.status !== 200) { console.log("FAILED: booking"); return; }
    console.log(`  booked, number=${bookRes.data.value.number}`);
  }

  // Verify: Check supplierInvoice
  console.log("\n--- VERIFICATION: GET /supplierInvoice ---");
  const siRes = await api("GET", `/supplierInvoice?supplierName=${encodeURIComponent(supplierName)}&invoiceDateFrom=${date}&invoiceDateTo=${date}&fields=*`);
  console.log(`  fullResultSize=${siRes.data.fullResultSize}`);
  if (siRes.data.values && siRes.data.values.length > 0) {
    for (const si of siRes.data.values) {
      console.log(`\n  supplierInvoice FOUND:`);
      console.log(`    id=${si.id}`);
      console.log(`    invoiceNumber=${si.invoiceNumber}`);
      console.log(`    invoiceDate=${si.invoiceDate}`);
      console.log(`    supplier.id=${si.supplier?.id}, supplier.name=${si.supplier?.name}`);
      console.log(`    amount=${si.amount}`);
      console.log(`    amountCurrency=${si.amountCurrency}`);
      console.log(`    currency=${si.currency}`);
      console.log(`    isCreditNote=${si.isCreditNote}`);
      console.log(`    voucherId=${si.voucher?.id}`);
      console.log(`    voucherNumber=${si.voucher?.number}`);
      console.log(`    Full object keys: ${Object.keys(si).join(", ")}`);
      console.log(`    Full JSON: ${JSON.stringify(si, null, 2).slice(0, 2000)}`);
    }
  } else {
    console.log("  NO supplierInvoice found!");

    // Try broader search
    console.log("\n--- Broader search: all supplierInvoices today ---");
    const allRes = await api("GET", `/supplierInvoice?invoiceDateFrom=${date}&invoiceDateTo=${date}&fields=*`);
    console.log(`  total=${allRes.data.fullResultSize}`);
    for (const si of (allRes.data.values || []).slice(-3)) {
      console.log(`  id=${si.id} inv=${si.invoiceNumber} supplier=${si.supplier?.name} amount=${si.amount} voucher=${si.voucher?.id}`);
    }
  }

  // Also verify: GET /ledger/voucher to see voucher state
  console.log("\n--- VERIFICATION: GET /ledger/voucher ---");
  const vRes = await api("GET", `/ledger/voucher/${voucherId}?fields=id,number,date,description,voucherType(*),postings(id,row,account(id,number,name),amount,amountGross,vatType(id,name,percentage),supplier(id,name),description,invoiceNumber,termOfPayment,department(id,name))`);
  const v = vRes.data.value;
  if (v) {
    console.log(`  voucherId=${v.id}, number=${v.number}, date=${v.date}`);
    console.log(`  description="${v.description}"`);
    console.log(`  voucherType: id=${v.voucherType?.id}, name="${v.voucherType?.name}"`);
    for (const p of (v.postings || [])) {
      console.log(`  posting row=${p.row}: acct=${p.account?.number}(${p.account?.name}) amount=${p.amount} gross=${p.amountGross} vat=${p.vatType?.id}(${p.vatType?.name}) supplier=${p.supplier?.name || '-'} inv=${p.invoiceNumber || '-'}`);
    }
  }

  return { voucherId, supplierId };
}

async function main() {
  // Test approach A: sendToLedger=false only (winning run)
  await testApproach("A", false);

  // Test approach B: with sendToLedger=true (current standard)
  await testApproach("B", true);
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
