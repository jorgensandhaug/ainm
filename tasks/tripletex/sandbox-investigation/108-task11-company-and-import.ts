/**
 * Task 11 — Find company org number and test importDocument properly.
 * Also test if POST /supplierInvoice works when we include more context.
 */

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);

async function api(method: string, path: string, body?: any, isForm = false) {
  const headers: Record<string, string> = { Authorization: AUTH };
  if (!isForm) headers["Content-Type"] = "application/json";
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    ...(body ? { body: isForm ? body : JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  const ok = res.status < 400;
  console.log(`  ${ok ? '✓' : '✗'} ${method} ${path} → ${res.status}`);
  if (!ok) console.log(`    ${JSON.stringify(data).slice(0, 600)}`);
  return { status: res.status, data };
}

async function main() {
  // Step 1: Get the company's org number
  console.log("── Finding company info ──");
  const companyRes = await api("GET", "/company/with/me?fields=*");
  if (companyRes.status < 400) {
    const co = companyRes.data.value;
    console.log(`  Company: "${co.name}" orgNum="${co.organizationNumber}"`);
    console.log(`  address: ${co.address?.addressLine1} ${co.address?.postalCode} ${co.address?.city}`);

    // Use the actual company org number for EHF XML
    const companyOrgNum = co.organizationNumber;
    const companyName = co.name;

    const date = "2026-03-22";
    const gross = 50000;
    const net = 40000;

    // Get or create supplier
    let supplierId: number;
    const supLookup = await api("GET", `/supplier?organizationNumber=984527318&fields=id,name,ledgerAccount(id)`);
    if (supLookup.data.values?.length > 0) {
      supplierId = supLookup.data.values[0].id;
    } else {
      const supRes = await api("POST", "/supplier", { name: "Testlev AS", organizationNumber: "984527318" });
      supplierId = supRes.data.value.id;
    }

    // ══════════════════════════════════════════
    // TEST: importDocument with CORRECT company org number
    // ══════════════════════════════════════════
    console.log("\n══════════════════════════════════════════");
    console.log("  TEST: importDocument with correct company org number");
    console.log(`  Customer: ${companyName} (${companyOrgNum})`);
    console.log("══════════════════════════════════════════");

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>INV-IMPORT-CORRECT-001</cbc:ID>
  <cbc:IssueDate>${date}</cbc:IssueDate>
  <cbc:DueDate>${date}</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>NOK</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty><cac:Party>
    <cbc:EndpointID schemeID="0192">984527318</cbc:EndpointID>
    <cac:PartyName><cbc:Name>Testlev AS</cbc:Name></cac:PartyName>
    <cac:PostalAddress><cbc:StreetName>Testveien 1</cbc:StreetName><cbc:CityName>Oslo</cbc:CityName><cbc:PostalZone>0001</cbc:PostalZone><cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
    <cac:PartyTaxScheme><cbc:CompanyID>NO984527318MVA</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>
    <cac:PartyLegalEntity><cbc:RegistrationName>Testlev AS</cbc:RegistrationName><cbc:CompanyID schemeID="0192">984527318</cbc:CompanyID></cac:PartyLegalEntity>
  </cac:Party></cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty><cac:Party>
    <cbc:EndpointID schemeID="0192">${companyOrgNum}</cbc:EndpointID>
    <cac:PartyName><cbc:Name>${companyName}</cbc:Name></cac:PartyName>
    <cac:PostalAddress><cbc:StreetName>Test</cbc:StreetName><cbc:CityName>Bergen</cbc:CityName><cbc:PostalZone>5003</cbc:PostalZone><cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
    <cac:PartyTaxScheme><cbc:CompanyID>NO${companyOrgNum}MVA</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>
    <cac:PartyLegalEntity><cbc:RegistrationName>${companyName}</cbc:RegistrationName><cbc:CompanyID schemeID="0192">${companyOrgNum}</cbc:CompanyID></cac:PartyLegalEntity>
  </cac:Party></cac:AccountingCustomerParty>
  <cac:TaxTotal><cbc:TaxAmount currencyID="NOK">10000.00</cbc:TaxAmount>
    <cac:TaxSubtotal><cbc:TaxableAmount currencyID="NOK">${net}.00</cbc:TaxableAmount><cbc:TaxAmount currencyID="NOK">10000.00</cbc:TaxAmount><cac:TaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>25</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory></cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="NOK">${net}.00</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="NOK">${net}.00</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="NOK">${gross}.00</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="NOK">${gross}.00</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  <cac:InvoiceLine><cbc:ID>1</cbc:ID><cbc:InvoicedQuantity unitCode="EA">1</cbc:InvoicedQuantity><cbc:LineExtensionAmount currencyID="NOK">${net}.00</cbc:LineExtensionAmount>
    <cac:Item><cbc:Name>kontortjenester</cbc:Name><cac:ClassifiedTaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>25</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory></cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="NOK">${net}.00</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>
</Invoice>`;

    const form = new FormData();
    form.append("file", new Blob([xml], { type: "application/xml" }), "invoice.xml");
    const importRes = await api("POST", "/ledger/voucher/importDocument", form, true);

    if (importRes.status < 400) {
      const v = importRes.data.values?.[0];
      console.log(`\n    Imported Voucher: id=${v?.id} number=${v?.number}`);
      console.log(`    description: "${v?.description}"`);
      console.log(`    date: ${v?.date}`);

      // Wait for async processing
      await new Promise(r => setTimeout(r, 3000));

      // Check supplierInvoice
      const siSearch = await api("GET", `/supplierInvoice?invoiceDateFrom=${date}&invoiceDateTo=2026-03-23&invoiceNumber=INV-IMPORT-CORRECT-001&fields=*,voucher(*,postings(*,account(*))),supplier(*)&count=50`);
      console.log(`\n    supplierInvoices found: ${siSearch.data.values?.length || 0}`);
      for (const si of siSearch.data.values || []) {
        console.log(`\n      SI id=${si.id}:`);
        console.log(`        invoiceNumber: "${si.invoiceNumber}"`);
        console.log(`        invoiceDate: ${si.invoiceDate}`);
        console.log(`        invoiceDueDate: ${si.invoiceDueDate}`);
        console.log(`        amount: ${si.amount}`);
        console.log(`        amountCurrency: ${si.amountCurrency}`);
        console.log(`        amountExcludingVat: ${si.amountExcludingVat}`);
        console.log(`        supplier: ${si.supplier?.id} "${si.supplier?.name}"`);
        console.log(`        voucher: id=${si.voucher?.id} number=${si.voucher?.number} desc="${si.voucher?.description}"`);
        if (si.voucher?.postings) {
          console.log(`        postings (${si.voucher.postings.length}):`);
          for (const p of si.voucher.postings) {
            console.log(`          row=${p.row} acct=${p.account?.number}(${p.account?.name}) amt=${p.amount} gross=${p.amountGross}`);
          }
        }
      }

      // Also search broadly
      const siAll = await api("GET", `/supplierInvoice?invoiceDateFrom=${date}&invoiceDateTo=2026-03-23&fields=id,invoiceNumber,amount,voucher(id)&count=50`);
      console.log(`\n    All SIs on ${date}: ${siAll.data.values?.length || 0}`);
      for (const si of siAll.data.values || []) {
        console.log(`      id=${si.id} invNum="${si.invoiceNumber}" amount=${si.amount} voucherId=${si.voucher?.id}`);
      }

      // Readback the voucher fully
      if (v?.id) {
        const vFull = await api("GET", `/ledger/voucher/${v.id}?fields=*,postings(*,account(*),vatType(*),supplier(*))`);
        if (vFull.status < 400) {
          const vv = vFull.data.value;
          console.log(`\n    Full voucher readback:`);
          console.log(`      description: "${vv.description}"`);
          console.log(`      number: ${vv.number}`);
          console.log(`      type: ${vv.type}`);
          for (const p of vv.postings || []) {
            console.log(`      row=${p.row} acct=${p.account?.number}(${p.account?.name}) amt=${p.amount} gross=${p.amountGross} vat=${p.vatType?.id}/${p.vatType?.name} supp=${p.supplier?.id||'-'} desc="${p.description}"`);
          }
        }

        // Cleanup
        console.log("\n── Cleanup ──");
        await api("PUT", `/ledger/voucher/${v.id}/:reverse?date=2026-03-22`);
      }
    }
  }

  console.log("\nDone.");
}

main().catch(e => { console.error(e); process.exit(1); });
