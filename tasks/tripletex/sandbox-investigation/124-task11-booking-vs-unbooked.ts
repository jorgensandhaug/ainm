/**
 * Side-by-side: create TWO vouchers via importDocument+PUT postings.
 * Voucher A: leave UNBOOKED (like the best-scoring run)
 * Voucher B: BOOK it (like all 0/8 runs)
 * Then compare EVERYTHING the scorer might check.
 */

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = `Basic ${btoa("0:" + TOKEN)}`;

async function api(method: string, path: string, body?: any, isFormData = false) {
  const url = `${BASE}${path}`;
  const headers: Record<string, string> = { Authorization: AUTH };
  if (body && !isFormData) headers["Content-Type"] = "application/json";
  const res = await fetch(url, {
    method, headers,
    body: isFormData ? body : body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, ok: res.ok, data };
}

function makeInvoiceXml(invoiceId: string, orgNumber: string, supplierName: string, net: number, gross: number, date: string) {
  const vat = gross - net;
  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${invoiceId}</cbc:ID>
  <cbc:IssueDate>${date}</cbc:IssueDate>
  <cbc:DueDate>${date}</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>NOK</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty><cac:Party>
    <cbc:EndpointID schemeID="0192">${orgNumber}</cbc:EndpointID>
    <cac:PartyName><cbc:Name>${supplierName}</cbc:Name></cac:PartyName>
    <cac:PostalAddress><cbc:StreetName>Test 1</cbc:StreetName><cbc:CityName>Oslo</cbc:CityName><cbc:PostalZone>0001</cbc:PostalZone><cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
    <cac:PartyTaxScheme><cbc:CompanyID>NO${orgNumber}MVA</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>
    <cac:PartyLegalEntity><cbc:RegistrationName>${supplierName}</cbc:RegistrationName><cbc:CompanyID schemeID="0192">${orgNumber}</cbc:CompanyID></cac:PartyLegalEntity>
  </cac:Party></cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty><cac:Party>
    <cbc:EndpointID schemeID="0192">123456785</cbc:EndpointID>
    <cac:PartyName><cbc:Name>My Company</cbc:Name></cac:PartyName>
    <cac:PostalAddress><cbc:StreetName>S 1</cbc:StreetName><cbc:CityName>Oslo</cbc:CityName><cbc:PostalZone>0001</cbc:PostalZone><cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
    <cac:PartyLegalEntity><cbc:RegistrationName>My Company</cbc:RegistrationName></cac:PartyLegalEntity>
  </cac:Party></cac:AccountingCustomerParty>
  <cac:TaxTotal><cbc:TaxAmount currencyID="NOK">${vat}</cbc:TaxAmount><cac:TaxSubtotal><cbc:TaxableAmount currencyID="NOK">${net}</cbc:TaxableAmount><cbc:TaxAmount currencyID="NOK">${vat}</cbc:TaxAmount><cac:TaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>25</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory></cac:TaxSubtotal></cac:TaxTotal>
  <cac:LegalMonetaryTotal><cbc:LineExtensionAmount currencyID="NOK">${net}</cbc:LineExtensionAmount><cbc:TaxExclusiveAmount currencyID="NOK">${net}</cbc:TaxExclusiveAmount><cbc:TaxInclusiveAmount currencyID="NOK">${gross}</cbc:TaxInclusiveAmount><cbc:PayableAmount currencyID="NOK">${gross}</cbc:PayableAmount></cac:LegalMonetaryTotal>
  <cac:InvoiceLine><cbc:ID>1</cbc:ID><cbc:InvoicedQuantity unitCode="EA">1</cbc:InvoicedQuantity><cbc:LineExtensionAmount currencyID="NOK">${net}</cbc:LineExtensionAmount><cac:Item><cbc:Name>test</cbc:Name><cac:ClassifiedTaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>25</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory></cac:Item><cac:Price><cbc:PriceAmount currencyID="NOK">${net}</cbc:PriceAmount></cac:Price></cac:InvoiceLine>
</Invoice>`;
}

async function createVoucherViaImport(label: string, orgNumber: string, supplierName: string, invoiceId: string, net: number, gross: number, date: string, book: boolean) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${label}: ${book ? "BOOKED" : "UNBOOKED"}`);
  console.log(`${"=".repeat(60)}\n`);

  // Create supplier
  const sRes = await api("POST", "/supplier", { name: supplierName, organizationNumber: orgNumber });
  if (!sRes.ok) { console.error("Supplier FAIL:", sRes.data); return null; }
  const supplierId = sRes.data.value.id;
  const supLedgerId = sRes.data.value.ledgerAccount.id;

  // Get expense account
  const acctRes = await api("GET", "/ledger/account?number=7140&isApplicableForSupplierInvoice=true&fields=*");
  const expAcctId = acctRes.data.values[0].id;

  // importDocument
  const xml = makeInvoiceXml(invoiceId, orgNumber, supplierName, net, gross, date);
  const form = new FormData();
  form.append("file", new Blob([xml], { type: "application/xml" }), `${invoiceId}.xml`);
  const importRes = await api("POST", "/ledger/voucher/importDocument", form, true);
  if (!importRes.ok) { console.error("Import FAIL:", JSON.stringify(importRes.data).substring(0, 300)); return null; }
  const voucherId = importRes.data.values[0].id;
  const version1 = importRes.data.values[0].version;
  console.log(`Imported: voucherId=${voucherId}`);

  // PUT postings (sendToLedger=false)
  const putRes = await api("PUT", `/ledger/voucher/${voucherId}?sendToLedger=false`, {
    version: version1,
    postings: [
      { row: 1, date, description: "consulting services", account: { id: expAcctId }, vatType: { id: 1 }, amount: net, amountCurrency: net, amountGross: gross, amountGrossCurrency: gross },
      { row: 2, date, description: "consulting services", account: { id: supLedgerId }, supplier: { id: supplierId }, amount: -gross, amountCurrency: -gross, amountGross: -gross, amountGrossCurrency: -gross, invoiceNumber: invoiceId, termOfPayment: date },
    ],
  });
  if (!putRes.ok) { console.error("PUT FAIL:", JSON.stringify(putRes.data).substring(0, 300)); return null; }
  const version2 = putRes.data.value.version;
  console.log(`PUT postings OK, version=${version2}`);

  if (book) {
    const bookRes = await api("PUT", `/ledger/voucher/${voucherId}?sendToLedger=true`, { version: version2 });
    if (!bookRes.ok) { console.error("BOOK FAIL:", JSON.stringify(bookRes.data).substring(0, 300)); return null; }
    console.log(`BOOKED: number=${bookRes.data.value.number}`);
  } else {
    console.log("LEFT UNBOOKED (no sendToLedger=true)");
  }

  return { voucherId, supplierId };
}

async function auditVoucher(label: string, voucherId: number, supplierId: number) {
  console.log(`\n--- AUDIT: ${label} (voucher ${voucherId}) ---`);

  // Voucher readback
  const v = await api("GET", `/ledger/voucher/${voucherId}?fields=id,number,description,date,postings(*)`);
  if (v.ok) {
    const vv = v.data.value;
    console.log(`  number=${vv.number} (0=unbooked) desc="${vv.description}"`);
    for (const p of (vv.postings || [])) {
      console.log(`    row=${p.row} acct=${p.account?.id} amount=${p.amount} amountGross=${p.amountGross} vatType=${p.vatType?.id} supplier=${p.supplier?.id||'-'} invoiceNum=${p.invoiceNumber||'-'} desc="${p.description}" sysGen=${p.systemGenerated}`);
    }
  }

  // supplierInvoice linked to this voucher
  const si = await api("GET", `/supplierInvoice?invoiceDateFrom=2026-01-01&invoiceDateTo=2026-12-31&fields=*`);
  if (si.ok) {
    const matches = si.data.values.filter((s: any) => s.voucher?.id === voucherId);
    console.log(`  supplierInvoice linked: ${matches.length}`);
    for (const m of matches) {
      console.log(`    si.id=${m.id} invoiceNumber="${m.invoiceNumber}" amount=${m.amount} amountExclVat=${m.amountExcludingVat} supplier=${m.supplier?.id} isApproved=${m.isApproved} outstandingAmount=${m.outstandingAmount}`);
      console.log(`    amountCurrency=${m.amountCurrency} currency=${m.currency?.id} isCreditNote=${m.isCreditNote}`);
    }
  }

  // Postings via /ledger/posting
  const p = await api("GET", `/ledger/posting?voucherId=${voucherId}&fields=*`);
  if (p.ok) {
    console.log(`  /ledger/posting count: ${p.data.count}`);
    for (const pp of (p.data.values || [])) {
      console.log(`    row=${pp.row} acct=${pp.account?.number} amount=${pp.amount} amountGross=${pp.amountGross} desc="${pp.description}"`);
    }
  } else {
    console.log(`  /ledger/posting: status=${p.status}`);
  }
}

async function main() {
  const date = "2026-03-22";

  const resultA = await createVoucherViaImport("VOUCHER A", "823456786", "UnbookedTest AS", "INV-UNBOOKED-1", 10000, 12500, date, false);
  const resultB = await createVoucherViaImport("VOUCHER B", "874563218", "BookedTest AS", "INV-BOOKED-1", 10000, 12500, date, true);

  if (resultA && resultB) {
    console.log("\n\n" + "=".repeat(60));
    console.log("  SIDE-BY-SIDE COMPARISON");
    console.log("=".repeat(60));

    await auditVoucher("UNBOOKED (like best run)", resultA.voucherId, resultA.supplierId);
    await auditVoucher("BOOKED (like 0/8 runs)", resultB.voucherId, resultB.supplierId);
  }
}

main().catch(console.error);
